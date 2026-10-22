package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"time"

	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/rules"
	"github.com/redis/go-redis/v9"
)

const stableCacheTTL = 72 * time.Hour
const activityCacheTTL = 2 * time.Hour

func readCacheKey(kind, scope string) string {
	return "couple:read:v1:" + kind + ":" + scope
}

// Mutable data is read and invalidated under the same relationship lock.
// Only successful loads are cached, so failed reads and denied access cannot
// hide newly available data. Hits never extend the original expiration.
func cachedRead[T any](s *Server, ctx context.Context, key, field string, ttl time.Duration, load func() (T, error)) (T, error) {
	data, err := s.Redis.HGet(ctx, key, field).Bytes()
	if err == nil {
		var value T
		if string(data) != "null" && json.Unmarshal(data, &value) == nil {
			return value, nil
		}
	} else if err != redis.Nil {
		slog.Warn("read cache lookup failed", "error", err)
	}
	value, err := load()
	if err != nil {
		return value, err
	}
	data, err = json.Marshal(value)
	if err == nil {
		_, err = s.Redis.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.HSet(ctx, key, field, data)
			pipe.ExpireNX(ctx, key, ttl)
			return nil
		})
	}
	if err != nil {
		slog.Warn("read cache fill failed", "error", err)
	}
	return value, nil
}

func (s *Server) invalidateReadCache(ctx context.Context, scope string, kinds ...string) {
	keys := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		keys = append(keys, readCacheKey(kind, scope))
	}
	if err := s.Redis.Del(ctx, keys...).Err(); err != nil {
		slog.Warn("read cache invalidation failed", "error", err)
	}
}

func (s *Server) cachedCoupleID(ctx context.Context, user string) (string, error) {
	// Membership is immutable after binding. Never cache sql.ErrNoRows: the
	// user may bind immediately after this lookup, including while waiting on a lock.
	return cachedRead(s, ctx, readCacheKey("membership", user), "couple", stableCacheTTL, func() (string, error) {
		var id string
		err := s.DB.QueryRowContext(ctx, "SELECT couple_id FROM members WHERE user_id=?", user).Scan(&id)
		return id, err
	})
}

func (s *Server) cachedContext(ctx context.Context, tx *sql.Tx, user string, couple *identity.Couple, now time.Time) (identity.Context, error) {
	if couple == nil {
		// Unbound reads do not hold the relationship lock, so they must not fill
		// mutable caches concurrently with profile updates or binding.
		return identity.ReadContext(ctx, tx, user, now)
	}
	state, err := cachedRead(s, ctx, readCacheKey("context", couple.ID), user, stableCacheTTL, func() (identity.Context, error) {
		return identity.ReadContext(ctx, tx, user, now)
	})
	// The relationship row is already locked and authoritative for rule gates,
	// limits and sign-in milestones, even if a cache invalidation failed.
	state.Couple = couple
	state.Stage = "rules"
	if couple.DailyLimit != nil {
		state.Stage = "ready"
	}
	// Time and Beijing's business date are request-specific, even on a cache hit.
	state.ServerTime = now
	state.BusinessDate = platform.Date(now)
	return state, err
}

func (s *Server) cachedRules(ctx context.Context, tx *sql.Tx, couple string) ([]rules.Proposal, error) {
	return cachedRead(s, ctx, readCacheKey("rules", couple), "list", stableCacheTTL, func() ([]rules.Proposal, error) {
		return rules.List(ctx, tx, couple)
	})
}
