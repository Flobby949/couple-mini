package notifications

import (
	"context"
	"couple-mini/backend/internal/wechat"
	"database/sql"
	"time"
)

type Sender interface {
	Send(context.Context, []byte) wechat.Outcome
}

// Deliver never keeps a database transaction open during a network request.
func Deliver(ctx context.Context, db *sql.DB, sender Sender, now time.Time) error {
	if _, err := db.ExecContext(ctx, "UPDATE notification_deliveries SET status='unknown',reason='process_stopped_during_send',updated_at=? WHERE status='sending' AND lease_until<=?", now, now); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, "UPDATE notification_deliveries SET status='retry',reason='claim_lease_expired',next_attempt_at=?,updated_at=? WHERE status='claimed' AND lease_until<=?", now, now, now); err != nil {
		return err
	}
	if sender == nil {
		return nil
	}
	for i := 0; i < 30; i++ {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		var id string
		var payload []byte
		var attempts int
		err = tx.QueryRowContext(ctx, "SELECT notification_id,payload,attempts FROM notification_deliveries WHERE status IN ('pending','retry') AND next_attempt_at<=? ORDER BY next_attempt_at,notification_id LIMIT 1 FOR UPDATE SKIP LOCKED", now).Scan(&id, &payload, &attempts)
		if err == sql.ErrNoRows {
			tx.Rollback()
			return nil
		}
		if err != nil {
			tx.Rollback()
			return err
		}
		_, err = tx.ExecContext(ctx, "UPDATE notification_deliveries SET status='claimed',lease_until=?,updated_at=? WHERE notification_id=?", now.Add(time.Minute), now, id)
		if err != nil {
			tx.Rollback()
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		// Persist the ambiguous boundary before any request can leave this process.
		result, err := db.ExecContext(ctx, "UPDATE notification_deliveries SET status='sending',attempts=attempts+1,updated_at=? WHERE notification_id=? AND status='claimed' AND lease_until>?", now, id, now)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			continue
		}
		sendCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		outcome := sender.Send(sendCtx, payload)
		cancel()
		if outcome.Status == "retry" && attempts >= 4 {
			outcome = wechat.Outcome{Status: "failed", Reason: "retry_exhausted"}
		}
		_, err = db.ExecContext(ctx, "UPDATE notification_deliveries SET status=?,reason=?,next_attempt_at=?,lease_until=NULL,updated_at=? WHERE notification_id=? AND status='sending'", outcome.Status, outcome.Reason, now.Add(time.Duration(1<<min(attempts, 6))*time.Minute), time.Now().UTC(), id)
		if err != nil {
			return err
		}
	}
	return nil
}
