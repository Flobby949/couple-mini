package app

import (
	"context"
	"database/sql"
	"time"

	"couple-mini/backend/internal/identity"
	"github.com/gin-gonic/gin"
)

func (s *Server) saveProfile(c *gin.Context) {
	var body identity.ProfileInput
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		return identity.SaveProfile(ctx, tx, user, body)
	})
}

func (s *Server) uploadAvatar(c *gin.Context) {
	s.uploadImage(c, false)
}
