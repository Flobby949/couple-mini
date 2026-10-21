package eventbus

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

type Event struct {
	ID, Actor, Type   string
	Version           int
	Payload, Snapshot json.RawMessage
	OccurredAt        time.Time
}
type Handler func(context.Context, *sql.Tx, Event, time.Time) error
type Subscription struct {
	Name   string
	Types  []string
	Handle Handler
}

func (s Subscription) Validate() error {
	if s.Name == "" || s.Handle == nil || len(s.Types) == 0 {
		return fmt.Errorf("incomplete event subscription")
	}
	seen := map[string]bool{}
	for _, t := range s.Types {
		if seen[t] {
			return fmt.Errorf("duplicate event registration")
		}
		seen[t] = true
	}
	return nil
}

// Dispatch owns the independent consumer transaction and success receipt. No business locks are acquired.
func (s Subscription) Dispatch(ctx context.Context, db *sql.DB, now time.Time) error {
	if err := s.Validate(); err != nil {
		return err
	}
	rows, err := db.QueryContext(ctx, "SELECT o.id,o.event_type FROM outbox o LEFT JOIN event_consumptions c ON c.event_id=o.id AND c.subscriber=? WHERE c.event_id IS NULL OR (c.status='retry' AND c.next_attempt_at<=?) ORDER BY o.occurred_at,o.id LIMIT 100", s.Name, now)
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id, kind string
		if err = rows.Scan(&id, &kind); err != nil {
			rows.Close()
			return err
		}
		found := false
		for _, t := range s.Types {
			found = found || t == kind
		}
		if !found {
			rows.Close()
			return fmt.Errorf("unregistered event type %s", kind)
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "INSERT IGNORE INTO event_consumptions(event_id,subscriber,status,next_attempt_at) VALUES (?,?,'pending',?)", id, s.Name, now)
		if err != nil {
			tx.Rollback()
			return err
		}
		var status string
		var attempts int
		var next time.Time
		err = tx.QueryRowContext(ctx, "SELECT status,attempts,next_attempt_at FROM event_consumptions WHERE event_id=? AND subscriber=? FOR UPDATE", id, s.Name).Scan(&status, &attempts, &next)
		if err != nil {
			tx.Rollback()
			return err
		}
		if status == "succeeded" || status == "skipped" || status == "failed" || next.After(now) {
			tx.Rollback()
			continue
		}
		var e Event
		e.ID = id
		err = tx.QueryRowContext(ctx, "SELECT actor_id,event_type,version,payload,notification_context,occurred_at FROM outbox WHERE id=?", id).Scan(&e.Actor, &e.Type, &e.Version, &e.Payload, &e.Snapshot, &e.OccurredAt)
		if err == nil {
			_, err = tx.ExecContext(ctx, "SAVEPOINT consumer")
		}
		if err != nil {
			tx.Rollback()
			return err
		}
		err = s.Handle(ctx, tx, e, now)
		if err != nil {
			if _, rollbackErr := tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT consumer"); rollbackErr != nil {
				tx.Rollback()
				return rollbackErr
			}
			slog.Warn("event consumption failed", "eventId", id, "eventType", e.Type, "subscriber", s.Name, "attempt", attempts+1, "code", "handler_failed")
			status = "retry"
			if attempts >= 7 {
				status = "failed"
			}
			// Only a stable code is retained; payloads and secrets never enter failure logs.
			_, err = tx.ExecContext(ctx, "UPDATE event_consumptions SET status=?,attempts=attempts+1,next_attempt_at=?,last_error='handler_failed' WHERE event_id=? AND subscriber=?", status, now.Add(time.Duration(1<<min(attempts, 7))*time.Minute), id, s.Name)
		} else {
			_, err = tx.ExecContext(ctx, "UPDATE event_consumptions SET status='succeeded',attempts=attempts+1,completed_at=?,last_error='' WHERE event_id=? AND subscriber=?", now, id, s.Name)
		}
		if err != nil {
			tx.Rollback()
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
