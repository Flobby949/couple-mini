package media

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math/rand/v2"
	"os"
	"path/filepath"
	"testing"
)

func TestBoundedRasterAndImmutableStorage(t *testing.T) {
	root := t.TempDir()
	var input bytes.Buffer
	png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 4, 4)))
	input.WriteString("<script>untrusted trailing bytes</script>")
	f, err := Store(root, &input)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.ReadFile(filepath.Join(root, f.ID))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte("script")) {
		t.Fatal("trailing bytes retained")
	}
	if f.MIME != "image/png" || f.Width != 4 || f.Size != len(stored) {
		t.Fatal(f)
	}
	if _, err = Path(root, "../../outside"); err == nil {
		t.Fatal("path traversal accepted")
	}
}

func storeAndCompare(t *testing.T, data []byte) []byte {
	t.Helper()
	root := t.TempDir()
	f, err := Store(root, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.ReadFile(filepath.Join(root, f.ID))
	if err != nil {
		t.Fatal(err)
	}
	if f.Size != len(stored) || len(stored) > len(data) {
		t.Fatalf("size: input=%d stored=%d metadata=%d", len(data), len(stored), f.Size)
	}
	want, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	got, format, err := image.Decode(bytes.NewReader(stored))
	if err != nil {
		t.Fatal(err)
	}
	if got.Bounds() != want.Bounds() || f.Width != want.Bounds().Dx() || f.Height != want.Bounds().Dy() || f.MIME != "image/"+format {
		t.Fatal("dimensions or format changed")
	}
	for y := 0; y < f.Height; y++ {
		for x := 0; x < f.Width; x++ {
			r, g, b, a := got.At(x, y).RGBA()
			wr, wg, wb, wa := want.At(x, y).RGBA()
			if r != wr || g != wg || b != wb || a != wa {
				t.Fatalf("pixel changed at (%d,%d)", x, y)
			}
		}
	}
	return stored
}

func pngChunk(kind string, payload []byte) []byte {
	var chunk bytes.Buffer
	binary.Write(&chunk, binary.BigEndian, uint32(len(payload)))
	chunk.WriteString(kind)
	chunk.Write(payload)
	binary.Write(&chunk, binary.BigEndian, crc32.ChecksumIEEE(chunk.Bytes()[4:]))
	return chunk.Bytes()
}

func TestPNGLosslessCompression(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	noise := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	for i := range noise.Pix {
		noise.Pix[i] = byte(rng.Uint32())
	}
	gray := image.NewGray16(image.Rect(0, 0, 24, 24))
	for i := range gray.Pix {
		gray.Pix[i] = byte(i)
	}
	palette := image.NewPaletted(image.Rect(0, 0, 64, 64), color.Palette{color.Transparent, color.NRGBA{R: 240, A: 128}, color.White})
	for i := range palette.Pix {
		palette.Pix[i] = uint8(i % 3)
	}
	for name, img := range map[string]image.Image{"transparent-noise": noise, "16-bit": gray, "palette-alpha": palette} {
		t.Run(name, func(t *testing.T) {
			for _, level := range []png.CompressionLevel{png.NoCompression, png.BestCompression} {
				var input bytes.Buffer
				encoder := png.Encoder{CompressionLevel: level}
				if err := encoder.Encode(&input, img); err != nil {
					t.Fatal(err)
				}
				stored := storeAndCompare(t, input.Bytes())
				if level == png.NoCompression && name != "transparent-noise" && len(stored) >= input.Len() {
					t.Fatal("compressible PNG did not shrink")
				}
				t.Logf("level=%d: %d → %d bytes", level, input.Len(), len(stored))
			}
		})
	}
}

func TestPNGPreservesDisplayMetadataAndRemovesTextAndTrailingData(t *testing.T) {
	var input bytes.Buffer
	png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 4, 4)))
	colorInfo := pngChunk("gAMA", []byte{0, 0, 177, 143})
	data := append([]byte{}, input.Bytes()[:33]...) // After IHDR, before IDAT.
	data = append(data, colorInfo...)
	data = append(data, pngChunk("tEXt", []byte("Comment\x00unneeded text"))...)
	data = append(data, input.Bytes()[33:]...)
	data = append(data, []byte("trailing data")...)
	stored := storeAndCompare(t, data)
	if !bytes.Contains(stored, colorInfo) || bytes.Contains(stored, []byte("unneeded text")) || bytes.Contains(stored, []byte("trailing data")) {
		t.Fatal("display metadata lost or redundant data retained")
	}
}

func TestJPEGLosslessStorage(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	for i := range img.Pix {
		img.Pix[i] = byte(i * 37)
	}
	var input bytes.Buffer
	if err := jpeg.Encode(&input, img, &jpeg.Options{Quality: 98}); err != nil {
		t.Fatal(err)
	}
	segment := func(marker byte, data string) []byte {
		result := []byte{0xff, marker, 0, 0}
		binary.BigEndian.PutUint16(result[2:], uint16(len(data)+2))
		return append(result, data...)
	}
	// A real EXIF orientation entry (6 = rotate 90 degrees) must survive.
	exif := segment(0xe1, "Exif\x00\x00II\x2a\x00\x08\x00\x00\x00\x01\x00\x12\x01\x03\x00\x01\x00\x00\x00\x06\x00\x00\x00\x00\x00\x00\x00")
	icc := segment(0xe2, "ICC_PROFILE\x00\x01\x01profile")
	data := append([]byte{}, input.Bytes()[:2]...)
	data = append(data, exif...)
	data = append(data, icc...)
	data = append(data, segment(0xfe, "unneeded comment")...)
	data = append(data, input.Bytes()[2:]...)
	data = append(data, []byte("trailing data")...)
	stored := storeAndCompare(t, data)
	if !bytes.Contains(stored, exif) || !bytes.Contains(stored, icc) || bytes.Contains(stored, []byte("unneeded comment")) || bytes.Contains(stored, []byte("trailing data")) {
		t.Fatal("display metadata lost or redundant data retained")
	}
	if clean := storeAndCompare(t, input.Bytes()); !bytes.Equal(clean, input.Bytes()) {
		t.Fatal("already optimized JPEG changed")
	}
	t.Logf("JPEG: %d → %d bytes", len(data), len(stored))
}

func TestProgressiveJPEGLosslessStorage(t *testing.T) {
	data, err := os.ReadFile("testdata/progressive.jpg")
	if err != nil {
		t.Fatal(err)
	}
	stored := storeAndCompare(t, append(append([]byte{}, data...), []byte("trailing data")...))
	if !bytes.Equal(stored, data) {
		t.Fatal("progressive JPEG scans changed")
	}
}
func TestRejectOversizeDimensionsAndUnsupportedContent(t *testing.T) {
	for _, data := range [][]byte{[]byte("<svg/>"), bytes.Repeat([]byte{0}, MaxBytes+1)} {
		if _, err := Store(t.TempDir(), bytes.NewReader(data)); err == nil {
			t.Fatal("invalid image accepted")
		}
	}
	var input bytes.Buffer
	png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 4097, 1)))
	if _, err := Store(t.TempDir(), &input); err == nil {
		t.Fatal("oversize dimensions accepted")
	}
}

func TestOriginalUploadSizeBoundary(t *testing.T) {
	var input bytes.Buffer
	png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 1, 1)))
	data := make([]byte, MaxBytes+1)
	copy(data, input.Bytes())
	// Even compressible/trailing input counts toward the upload limit.
	storeAndCompare(t, data[:MaxBytes])
	root := t.TempDir()
	if _, err := Store(root, bytes.NewReader(data)); err == nil {
		t.Fatal("oversized source accepted after optimization")
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 0 {
		t.Fatal("rejected upload left files behind", err)
	}
}
