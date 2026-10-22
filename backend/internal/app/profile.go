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
		profile, err := identity.SaveProfile(ctx, tx, user, body)
		if err != nil {
			return nil, err
		}
		couple, err := s.cachedCoupleID(ctx, user)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		if couple != "" {
			s.invalidateReadCache(ctx, couple, "context")
		}
		return profile, nil
	})
}

func (s *Server) uploadAvatar(c *gin.Context) {
	s.uploadImage(c, false)
}
