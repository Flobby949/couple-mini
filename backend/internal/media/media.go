package media

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"couple-mini/backend/internal/platform"
)

const MaxBytes = 5 << 20

var fileID = regexp.MustCompile(`^[a-f0-9]{32}$`)

type File struct {
	ID     string `json:"fileId"`
	MIME   string `json:"mime"`
	Size   int    `json:"size"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// Decode a bounded raster and re-encode it; extensions and claimed MIME are not trusted.
func Store(root string, reader io.Reader) (File, error) {
	var f File
	data, err := io.ReadAll(io.LimitReader(reader, MaxBytes+1))
	if err != nil {
		return f, err
	}
	if len(data) > MaxBytes {
		return f, platform.Fail(413, "IMAGE_TOO_LARGE", "图片不能超过 5 MiB")
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg") {
		return f, platform.Fail(422, "INVALID_IMAGE", "请选择有效的 PNG 或 JPEG 图片")
	}
	if cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 4096 || cfg.Height > 4096 {
		return f, platform.Fail(422, "IMAGE_DIMENSIONS", "图片宽高不能超过 4096 像素")
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return f, platform.Fail(422, "INVALID_IMAGE", "图片文件不完整，请重新选择")
	}
	var encoded bytes.Buffer
	f.MIME = "image/png"
	if format == "jpeg" {
		f.MIME = "image/jpeg"
		err = jpeg.Encode(&encoded, img, &jpeg.Options{Quality: 85})
	} else {
		err = png.Encode(&encoded, img)
	}
	if err != nil {
		return f, err
	}
	if encoded.Len() > MaxBytes {
		return f, platform.Fail(413, "IMAGE_TOO_LARGE", "图片处理后超过 5 MiB，请缩小后重试")
	}
	if err = os.MkdirAll(root, 0700); err != nil {
		return f, err
	}
	f.ID = platform.ID()
	f.Width = cfg.Width
	f.Height = cfg.Height
	f.Size = encoded.Len()
	temp, err := os.CreateTemp(root, ".upload-*")
	if err != nil {
		return f, err
	}
	defer os.Remove(temp.Name())
	if _, err = temp.Write(encoded.Bytes()); err != nil {
		temp.Close()
		return f, err
	}
	if err = temp.Sync(); err != nil {
		temp.Close()
		return f, err
	}
	if err = temp.Close(); err != nil {
		return f, err
	}
	if err = os.Rename(temp.Name(), filepath.Join(root, f.ID)); err != nil {
		return f, err
	}
	return f, nil
}
func Register(ctx context.Context, tx *sql.Tx, user string, f File, now time.Time) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO media_files VALUES (?,?,?,?,?,?,?)", f.ID, user, f.MIME, f.Size, f.Width, f.Height, now)
	return err
}
func Path(root, id string) (string, error) {
	if !fileID.MatchString(id) {
		return "", platform.Fail(404, "NOT_FOUND", "图片不存在")
	}
	return filepath.Join(root, id), nil
}
func Authorized(ctx context.Context, db *sql.DB, user, id string) (File, error) {
	var f File
	f.ID = id
	if !fileID.MatchString(id) {
		return f, platform.Fail(404, "NOT_FOUND", "图片不存在")
	}
	err := db.QueryRowContext(ctx, `SELECT f.mime,f.size_bytes,f.width,f.height FROM media_files f
 WHERE f.id=? AND (f.owner_id=? OR EXISTS (
 SELECT 1 FROM members a JOIN members b ON a.couple_id=b.couple_id WHERE a.user_id=? AND b.user_id=f.owner_id))`, id, user, user).Scan(&f.MIME, &f.Size, &f.Width, &f.Height)
	if errors.Is(err, sql.ErrNoRows) {
		return f, platform.Fail(404, "NOT_FOUND", "图片不存在或无权查看")
	}
	return f, err
}
