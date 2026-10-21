package scheduler

import (
	"context"
	"log/slog"
	"time"
)

// Work runs synchronously, so scans never overlap. Business modules own claiming and settlement.
func Run(ctx context.Context, interval time.Duration, work func(context.Context) error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		runCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		if err := work(runCtx); err != nil && ctx.Err() == nil {
			slog.Error("background job failed", "job", "relationship-due-settlement", "error", err)
		}
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
