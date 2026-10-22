package app

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"couple-mini/backend/internal/catalog"
)

const catalogCacheTTL = 72 * time.Hour

func catalogCacheKey(couple string) string {
	return "couple:catalog:v1:" + couple
}

// Call while holding the relationship lock, just like catalog mutations, so a
// concurrent reader cannot refill the cache between invalidation and commit.
func (s *Server) cachedProducts(ctx context.Context, tx *sql.Tx, couple, owner string) ([]catalog.Product, error) {
	return cachedRead(s, ctx, catalogCacheKey(couple), owner, catalogCacheTTL, func() ([]catalog.Product, error) {
		return catalog.List(ctx, tx, owner)
	})
}

func (s *Server) invalidateCatalog(ctx context.Context, couple string) {
	// Invalidate before releasing the relationship lock. A rollback only causes
	// an extra cache miss; failed invalidations remain bounded by the TTL.
	if err := s.Redis.Del(ctx, catalogCacheKey(couple)).Err(); err != nil {
		slog.Warn("catalog cache invalidation failed", "error", err)
	}
}
