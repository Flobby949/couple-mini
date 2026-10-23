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
	return "couple:catalog:v2:" + couple
}

// Call while holding the relationship lock, just like catalog mutations, so a
// concurrent reader cannot refill the cache between invalidation and commit.
func (s *Server) cachedProducts(ctx context.Context, tx *sql.Tx, couple, owner string) ([]catalog.Product, error) {
	return cachedRead(s, ctx, catalogCacheKey(couple), "list:"+owner, catalogCacheTTL, func() ([]catalog.Product, error) {
		products, err := catalog.List(ctx, tx, owner)
		if err == nil {
			s.warmProductDetails(ctx, couple, products)
		}
		return products, err
	})
}

func (s *Server) cachedProduct(ctx context.Context, tx *sql.Tx, couple, id string) (catalog.Product, error) {
	return cachedRead(s, ctx, catalogCacheKey(couple), "product:"+id, catalogCacheTTL, func() (catalog.Product, error) {
		return catalog.Get(ctx, tx, id, couple)
	})
}

// The list already contains complete products. Warm details in one batch while
// the relationship is locked; never publish uncommitted product writes here.
func (s *Server) warmProductDetails(ctx context.Context, couple string, products []catalog.Product) {
	if len(products) == 0 {
		return
	}
	values := make(map[string]any, len(products))
	for _, product := range products {
		data, err := json.Marshal(product)
		if err != nil {
			slog.Warn("product cache warmup failed", "error", err)
			return
		}
		values["product:"+product.ID] = data
	}
	key := catalogCacheKey(couple)
	_, err := s.Redis.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.HSet(ctx, key, values)
		pipe.ExpireNX(ctx, key, catalogCacheTTL)
		return nil
	})
	if err != nil {
		slog.Warn("product cache warmup failed", "error", err)
	}
}

func (s *Server) invalidateCatalog(ctx context.Context, couple string) {
	// Invalidate before releasing the relationship lock. A rollback only causes
	// an extra cache miss; failed invalidations remain bounded by the TTL.
	if err := s.Redis.Del(ctx, catalogCacheKey(couple)).Err(); err != nil {
		slog.Warn("catalog cache invalidation failed", "error", err)
	}
}
