package eventbus

import (
	"context"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"encoding/json"
	"time"
)

// Persist the immutable result now; notification consumers are a later milestone.
func Save(ctx context.Context, tx *sql.Tx, couple, actor, event string, payload any, now time.Time) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO outbox(id,couple_id,actor_id,event_type,payload,occurred_at) VALUES (?,?,?,?,?,?)", platform.ID(), couple, actor, event, b, now)
	return err
}
