package rules

import (
	"context"
	"database/sql"
	"time"

	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/platform"
)

type Proposal struct {
	ID            string    `json:"id"`
	ProposerID    string    `json:"proposerId"`
	PreviousLimit *int64    `json:"previousLimit"`
	DailyLimit    int64     `json:"dailyLimit"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
}

func List(ctx context.Context, tx *sql.Tx, couple string) ([]Proposal, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,proposer_id,previous_limit,daily_limit,status,created_at FROM rule_proposals WHERE couple_id=? ORDER BY created_at DESC,id DESC LIMIT 100", couple)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Proposal{}
	for rows.Next() {
		var p Proposal
		if err = rows.Scan(&p.ID, &p.ProposerID, &p.PreviousLimit, &p.DailyLimit, &p.Status, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func Propose(ctx context.Context, tx *sql.Tx, user string, c identity.Couple, limit int64, now time.Time) (Proposal, error) {
	p := Proposal{platform.ID(), user, c.DailyLimit, limit, "pending", now}
	_, err := tx.ExecContext(ctx, "INSERT INTO rule_proposals(id,couple_id,proposer_id,previous_limit,daily_limit,status,created_at) VALUES (?,?,?,?,?,'pending',?)", p.ID, c.ID, user, c.DailyLimit, limit, now)
	return p, err
}
func Confirm(ctx context.Context, tx *sql.Tx, user, couple, id string, now time.Time) (any, error) {
	var proposer, status string
	var limit int64
	err := tx.QueryRowContext(ctx, "SELECT proposer_id,status,daily_limit FROM rule_proposals WHERE id=? AND couple_id=? FOR UPDATE", id, couple).Scan(&proposer, &status, &limit)
	if err == sql.ErrNoRows {
		return nil, platform.Fail(404, "NOT_FOUND", "未找到这份规则提议")
	}
	if err != nil {
		return nil, err
	}
	if proposer == user {
		return nil, platform.Fail(403, "PARTNER_CONFIRM_REQUIRED", "请由另一方确认这份提议")
	}
	if status != "pending" {
		return nil, platform.Fail(409, "PROPOSAL_INACTIVE", "这份提议已生效或作废，请查看当前规则")
	}
	if _, err = tx.ExecContext(ctx, "UPDATE rule_proposals SET status='void' WHERE couple_id=? AND status='pending'", couple); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE rule_proposals SET status='active',confirmed_at=? WHERE id=?", now, id); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE couples SET daily_limit=? WHERE id=?", limit, couple); err != nil {
		return nil, err
	}
	return map[string]any{"proposalId": id, "dailyLimit": limit, "activatedAt": now}, nil
}
