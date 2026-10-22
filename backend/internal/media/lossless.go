package media

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"hash/crc32"
	"image"
	"io"

	"couple-mini/backend/internal/platform"
)

func invalidImage() error {
	return platform.Fail(422, "INVALID_IMAGE", "图片文件不完整，请重新选择")
}

// Recompress the existing PNG scanlines, preserving bit depth, palette, alpha,
// color profiles and orientation. Reuse IDAT if it was already smaller.
func optimizePNG(data []byte, cfg image.Config) ([]byte, error) {
	var idat bytes.Buffer
	var chunks [][]byte
	hasIDAT := false
	for pos := 8; ; {
		if len(data)-pos < 12 {
			return nil, invalidImage()
		}
		length := int(binary.BigEndian.Uint32(data[pos:]))
		if length > len(data)-pos-12 {
			return nil, invalidImage()
		}
		chunk := data[pos : pos+length+12]
		kind := string(chunk[4:8])
		switch kind {
		case "IDAT":
			idat.Write(chunk[8 : 8+length])
			if !hasIDAT {
				chunks = append(chunks, chunk)
				hasIDAT = true
			}
		case "tEXt", "zTXt", "iTXt", "tIME": // Non-rendering text and timestamps.
		default:
			chunks = append(chunks, chunk)
		}
		pos += len(chunk)
		if kind == "IEND" {
			break
		}
	}
	reader, err := zlib.NewReader(bytes.NewReader(idat.Bytes()))
	if err != nil {
		return nil, invalidImage()
	}
	defer reader.Close()
	var compressed bytes.Buffer
	writer, _ := zlib.NewWriterLevel(&compressed, zlib.BestCompression)
	// Bound even malicious extra scanlines: at most 8 bytes/pixel plus Adam7
	// filter bytes and rounding. Decoding above has already validated the raster.
	maxRaw := int64(8) * int64(cfg.Width+1) * int64(cfg.Height+7)
	n, copyErr := io.Copy(writer, io.LimitReader(reader, maxRaw+1))
	closeErr := writer.Close()
	if copyErr != nil || closeErr != nil || n > maxRaw {
		return nil, invalidImage()
	}
	payload := idat.Bytes()
	if compressed.Len() < len(payload) {
		payload = compressed.Bytes()
	}
	var output bytes.Buffer
	output.Write(data[:8])
	for _, chunk := range chunks {
		if string(chunk[4:8]) != "IDAT" {
			output.Write(chunk)
			continue
		}
		binary.Write(&output, binary.BigEndian, uint32(len(payload)))
		output.WriteString("IDAT")
		output.Write(payload)
		checksum := crc32.NewIEEE()
		checksum.Write([]byte("IDAT"))
		checksum.Write(payload)
		binary.Write(&output, binary.BigEndian, checksum.Sum32())
	}
	return output.Bytes(), nil
}

// Keep JPEG tables and entropy-coded scans byte-for-byte. Only discard comments
// and trailing data; application segments (including EXIF/ICC/JFIF/Adobe) stay intact.
func optimizeJPEG(data []byte) ([]byte, error) {
	var output bytes.Buffer
	output.Write(data[:2]) // SOI; image.Decode has already checked the format.
	for pos := 2; pos < len(data); {
		start := pos
		if data[pos] != 0xff {
			return nil, invalidImage()
		}
		for pos < len(data) && data[pos] == 0xff {
			pos++
		}
		if pos >= len(data) {
			return nil, invalidImage()
		}
		marker := data[pos]
		pos++
		if marker == 0xd9 { // EOI
			output.Write(data[start:pos])
			return output.Bytes(), nil
		}
		if len(data)-pos < 2 {
			return nil, invalidImage()
		}
		length := int(binary.BigEndian.Uint16(data[pos:]))
		if length < 2 || length > len(data)-pos {
			return nil, invalidImage()
		}
		pos += length
		if marker != 0xfe {
			output.Write(data[start:pos])
		}
		if marker != 0xda { // SOS
			continue
		}
		start = pos
		for pos < len(data) {
			if data[pos] != 0xff {
				pos++
				continue
			}
			end := pos + 1
			for end < len(data) && data[end] == 0xff {
				end++
			}
			if end >= len(data) {
				return nil, invalidImage()
			}
			if data[end] != 0 && (data[end] < 0xd0 || data[end] > 0xd7) {
				break
			}
			pos = end + 1 // Stuffed 0xff or restart marker within a scan.
		}
		output.Write(data[start:pos])
	}
	return nil, invalidImage()
}
