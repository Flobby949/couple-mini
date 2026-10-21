package points

import (
	"context"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"time"
)

type Award struct {
	UserID       string `json:"userId"`
	Agreed       int64  `json:"agreed"`
	Actual       int64  `json:"actual"`
	Unpaid       int64  `json:"unpaid"`
	BalanceAfter *int64 `json:"balanceAfter,omitempty"`
}

func Remaining(ctx context.Context, tx *sql.Tx, user, date string, limit int64) (int64, error) {
	var earned int64
	err := tx.QueryRowContext(ctx, "SELECT earned FROM daily_points WHERE user_id=? AND business_date=?", user, date).Scan(&earned)
	if err == sql.ErrNoRows {
		return limit, nil
	}
	return max(0, limit-earned), err
}
func ensureDay(ctx context.Context, tx *sql.Tx, user, date string) error {
	_, err := tx.ExecContext(ctx, "INSERT IGNORE INTO daily_points(user_id,business_date) VALUES (?,?)", user, date)
	return err
}
func ReserveTask(ctx context.Context, tx *sql.Tx, couple, task string, amount int64, now time.Time) error {
	var old int64
	var status string
	err := tx.QueryRowContext(ctx, "SELECT amount,status FROM task_reservations WHERE task_id=?", task).Scan(&old, &status)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && status != "active" {
		return platform.Fail(409, "TASK_STATE_CHANGED", "任务预留已结束")
	}
	delta := amount - old
	result, err := tx.ExecContext(ctx, "UPDATE pools SET available=available-?,reserved=reserved+? WHERE couple_id=? AND available>=?", delta, delta, couple, max(0, delta))
	if err != nil {
		return err
	}
	// A zero delta may report zero changed rows, including for a zero-reward task.
	if delta != 0 {
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return platform.Fail(409, "INSUFFICIENT_POOL", "共同池可用积分不足，不能承诺这份奖励")
		}
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO task_reservations VALUES (?,?,?,'active') ON DUPLICATE KEY UPDATE amount=VALUES(amount)", task, couple, amount); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO reservation_history VALUES (?,?,?,?,?,?)", platform.ID(), task, couple, delta, "reserve", now)
	return err
}
func closeReservation(ctx context.Context, tx *sql.Tx, couple, task, status string, paid int64, now time.Time) (int64, error) {
	var reserved int64
	var current string
	if err := tx.QueryRowContext(ctx, "SELECT amount,status FROM task_reservations WHERE task_id=?", task).Scan(&reserved, &current); err != nil {
		return 0, err
	}
	if current != "active" {
		return 0, platform.Fail(409, "TASK_STATE_CHANGED", "任务已经结束，不能重复结算")
	}
	released := reserved - paid
	if _, err := tx.ExecContext(ctx, "UPDATE pools SET reserved=reserved-?,available=available+? WHERE couple_id=?", reserved, released, couple); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE task_reservations SET amount=0,status=? WHERE task_id=?", status, task); err != nil {
		return 0, err
	}
	_, err := tx.ExecContext(ctx, "INSERT INTO reservation_history VALUES (?,?,?,?,?,?)", platform.ID(), task, couple, -reserved, status, now)
	return released, err
}
func ReleaseTask(ctx context.Context, tx *sql.Tx, couple, task string, now time.Time) (int64, error) {
	return closeReservation(ctx, tx, couple, task, "released", 0, now)
}
func TaskPreview(ctx context.Context, tx *sql.Tx, users []string, reward, limit int64, now time.Time) ([]Award, error) {
	out := []Award{}
	for _, user := range users {
		remaining, err := Remaining(ctx, tx, user, platform.Date(now), limit)
		if err != nil {
			return nil, err
		}
		actual := min(reward, remaining)
		out = append(out, Award{UserID: user, Agreed: reward, Actual: actual, Unpaid: reward - actual})
	}
	return out, nil
}
func SettleTask(ctx context.Context, tx *sql.Tx, couple, task, actor string, users []string, reward, limit int64, now time.Time) ([]Award, int64, error) {
	awards, err := TaskPreview(ctx, tx, users, reward, limit, now)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	for i := range awards {
		a := &awards[i]
		if err = ensureDay(ctx, tx, a.UserID, platform.Date(now)); err != nil {
			return nil, 0, err
		}
		balance, err := TaskAccount(ctx, tx, a.UserID, task, "task_reward", a.Actual, now)
		if err != nil {
			return nil, 0, err
		}
		a.BalanceAfter = &balance
		if _, err = tx.ExecContext(ctx, "UPDATE daily_points SET earned=earned+? WHERE user_id=? AND business_date=?", a.Actual, a.UserID, platform.Date(now)); err != nil {
			return nil, 0, err
		}
		total += a.Actual
	}
	released, err := closeReservation(ctx, tx, couple, task, "settled", total, now)
	if err != nil {
		return nil, 0, err
	}
	return awards, released, taskLedger(ctx, tx, couple, actor, task, "task_reward", -total, now)
}
func taskLedger(ctx context.Context, tx *sql.Tx, couple, actor, task, reason string, amount int64, now time.Time) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO pool_ledger(id,couple_id,actor_id,task_id,reason,amount,created_at) VALUES (?,?,?,?,?,?,?)", platform.ID(), couple, actor, task, reason, amount, now)
	return err
}
func TaskPenaltyPool(ctx context.Context, tx *sql.Tx, couple, actor, task string, amount int64, now time.Time) error {
	if _, err := tx.ExecContext(ctx, "UPDATE pools SET available=available+? WHERE couple_id=?", amount, couple); err != nil {
		return err
	}
	return taskLedger(ctx, tx, couple, actor, task, "task_timeout_penalty", amount, now)
}
