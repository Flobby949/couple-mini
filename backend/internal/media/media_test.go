package media

import (
	"bytes"
	"image"
	"image/png"
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
