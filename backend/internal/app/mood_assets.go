package app

import (
	"bytes"
	"net/http"
	"regexp"
	"strings"
	"time"

	"couple-mini/backend/assets"
	"couple-mini/backend/internal/checkin"
	"couple-mini/backend/internal/platform"
	"github.com/gin-gonic/gin"
)

var moodRevision = regexp.MustCompile(`^[a-f0-9]{16}$`)

func (s *Server) moodAsset(c *gin.Context) {
	revision, scheme, file := c.Param("revision"), c.Param("scheme"), c.Param("file")
	mood := strings.TrimSuffix(file, ".png")
	if !moodRevision.MatchString(revision) || (scheme != "light" && scheme != "dark") || file != mood+".png" || !checkin.ValidMood(mood) {
		s.fail(c, platform.Fail(404, "NOT_FOUND", "图片不存在"))
		return
	}
	data, err := assets.Moods.ReadFile("moods/" + revision + "/" + scheme + "/" + file)
	if err != nil {
		s.fail(c, platform.Fail(404, "NOT_FOUND", "图片不存在"))
		return
	}
	c.Header("Content-Type", "image/png")
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("ETag", `"`+platform.Hash(string(data))+`"`)
	http.ServeContent(c.Writer, c.Request, file, time.Time{}, bytes.NewReader(data))
}
