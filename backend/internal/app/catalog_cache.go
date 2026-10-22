package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"time"

	"couple-mini/backend/internal/catalog"
	"github.com/redis/go-redis/v9"
)

const catalogCacheTTL = 72 * time.Hour

func catalogCacheKey(couple string) string {
	return "couple:catalog:v1:" + couple
}

// Call while holding the relationship lock, just like catalog mutations, so a
// concurrent reader cannot refill the cache between invalidation and commit.
func (s *Server) cachedProducts(ctx context.Context, tx *sql.Tx, couple, owner string) ([]catalog.Product, error) {
	key := catalogCacheKey(couple)
	data, err := s.Redis.HGet(ctx, key, owner).Bytes()
	if err == nil {
		var products []catalog.Product
		if json.Unmarshal(data, &products) == nil && products != nil {
			return products, nil
		}
	} else if err != redis.Nil {
		slog.Warn("catalog cache read failed", "error", err)
	}
	products, err := catalog.List(ctx, tx, owner)
	if err != nil {
		return nil, err
	}
	data, err = json.Marshal(products)
	if err == nil {
		_, err = s.Redis.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.HSet(ctx, key, owner, data)
			// Reading the other owner's store must not extend old entries' lifetime.
			pipe.ExpireNX(ctx, key, catalogCacheTTL)
			return nil
		})
	}
	if err != nil {
		slog.Warn("catalog cache write failed", "error", err)
	}
	return products, nil
}

func (s *Server) invalidateCatalog(ctx context.Context, couple string) {
	// Invalidate before releasing the relationship lock. A rollback only causes
	// an extra cache miss; failed invalidations remain bounded by the TTL.
	if err := s.Redis.Del(ctx, catalogCacheKey(couple)).Err(); err != nil {
		slog.Warn("catalog cache invalidation failed", "error", err)
	}
}
