package points

import (
	"context"
	"database/sql"
	"regexp"
	"strconv"
	"strings"
	"time"

	"couple-mini/backend/internal/platform"
)

const MaxInput int64 = 1_000_000_000

var decimal = regexp.MustCompile(`^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$`)

// Parse nonnegative decimal text before rounding, without floating point arithmetic.
func Parse(raw string) (int64, error) {
	if !decimal.MatchString(raw) {
		return 0, platform.Fail(422, "INVALID_POINTS", "积分须为非负数字，最多六位小数")
	}
	parts := strings.Split(raw, ".")
	n, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || n > MaxInput {
		return 0, platform.Fail(422, "INVALID_POINTS", "积分不能超过 1000000000")
	}
	if len(parts) == 2 && parts[1][0] >= '5' {
		n++
	}
	if n > MaxInput {
		return 0, platform.Fail(422, "INVALID_POINTS", "取整后积分超出范围")
	}
	return n, nil
}

func Initialize(ctx context.Context, tx *sql.Tx, couple, actor string, users []string, now time.Time) error {
	for _, user := range users {
		if _, err := tx.ExecContext(ctx, "INSERT INTO accounts(user_id) VALUES (?)", user); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO pools(couple_id,available) VALUES (?,100)", couple); err != nil {
		return err
	}
	return Ledger(ctx, tx, couple, actor, "initial", 100, now)
}
func Ledger(ctx context.Context, tx *sql.Tx, couple, actor, reason string, amount int64, now time.Time) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO pool_ledger VALUES (?,?,?,?,?,?)", platform.ID(), couple, actor, reason, amount, now)
	return err
}
func CreditPool(ctx context.Context, tx *sql.Tx, couple, actor, reason string, amount int64, now time.Time) error {
	if _, err := tx.ExecContext(ctx, "UPDATE pools SET available=available+? WHERE couple_id=?", amount, couple); err != nil {
		return err
	}
	return Ledger(ctx, tx, couple, actor, reason, amount, now)
}

type Summary struct {
	Balance    int64 `json:"balance"`
	Earned     int64 `json:"earned"`
	DailyLimit int64 `json:"dailyLimit"`
	Remaining  int64 `json:"remaining"`
	Available  int64 `json:"available"`
	Reserved   int64 `json:"reserved"`
	Total      int64 `json:"total"`
}

func Read(ctx context.Context, tx *sql.Tx, user, couple, date string, limit int64) (Summary, error) {
	s := Summary{DailyLimit: limit}
	err := tx.QueryRowContext(ctx, "SELECT a.balance,p.available,p.reserved,COALESCE(d.earned,0) FROM accounts a JOIN pools p ON p.couple_id=? LEFT JOIN daily_points d ON d.user_id=a.user_id AND d.business_date=? WHERE a.user_id=?", couple, date, user).Scan(&s.Balance, &s.Available, &s.Reserved, &s.Earned)
	s.Total = s.Available + s.Reserved
	s.Remaining = max(0, limit-s.Earned)
	return s, err
}

// Order consumption leaves the system; refunds do not consume the daily earning cap.
func ChangeAccount(ctx context.Context, tx *sql.Tx, user, order, reason string, amount int64, now time.Time) (int64, error) {
	if _, err := tx.ExecContext(ctx, "UPDATE accounts SET balance=balance+? WHERE user_id=?", amount, user); err != nil {
		return 0, err
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, "SELECT balance FROM accounts WHERE user_id=?", user).Scan(&balance); err != nil {
		return 0, err
	}
	_, err := tx.ExecContext(ctx, "INSERT INTO account_ledger VALUES (?,?,?,?,?,?,?)", platform.ID(), user, order, reason, amount, balance, now)
	return balance, err
}
func Balance(ctx context.Context, tx *sql.Tx, user string) (int64, error) {
	var n int64
	err := tx.QueryRowContext(ctx, "SELECT balance FROM accounts WHERE user_id=?", user).Scan(&n)
	return n, err
}
