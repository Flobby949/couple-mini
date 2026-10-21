package eventbus

import (
	"context"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type Capture func(context.Context, *sql.Tx, string, string, string, json.RawMessage) (json.RawMessage, error)
type captureKey struct{}

// WithCapture injects a read-only snapshot provider; no rendering runs in the business transaction.
func WithCapture(ctx context.Context, capture Capture) context.Context {
	return context.WithValue(ctx, captureKey{}, capture)
}
func Save(ctx context.Context, tx *sql.Tx, couple, actor, event string, payload any, now time.Time) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	capture, ok := ctx.Value(captureKey{}).(Capture)
	if !ok {
		return errors.New("event snapshot provider missing")
	}
	frozen, err := capture(ctx, tx, couple, actor, event, b)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO outbox(id,couple_id,actor_id,event_type,version,payload,notification_context,occurred_at) VALUES (?,?,?,?,2,?,?,?)", platform.ID(), couple, actor, event, b, frozen, now)
	return err
}
