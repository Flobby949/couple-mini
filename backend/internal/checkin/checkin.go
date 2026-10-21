package checkin

import (
	"context"
	"database/sql"
	"time"

	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/points"
)

type Milestone struct {
	Days   int   `json:"days"`
	Reward int64 `json:"reward"`
}

var Milestones = []Milestone{{7, 30}, {30, 100}, {100, 300}, {365, 1000}}

type Result struct {
	Date           string `json:"date"`
	Base           int64  `json:"base"`
	DoubleBonus    int64  `json:"doubleBonus"`
	MilestoneBonus int64  `json:"milestoneBonus"`
	Total          int64  `json:"total"`
	DoubleDays     int    `json:"doubleDays"`
}

func Record(ctx context.Context, tx *sql.Tx, user string, c identity.Couple, now time.Time) (Result, error) {
	out := Result{Date: platform.Date(now), Base: 10, DoubleDays: c.DoubleDays}
	var already int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM checkins WHERE user_id=? AND business_date=?", user, out.Date).Scan(&already); err != nil {
		return out, err
	}
	if already > 0 {
		return out, platform.Fail(409, "ALREADY_CHECKED_IN", "今天已经签到，无需重复签到")
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO checkins VALUES (?,?,?,?)", user, out.Date, c.ID, now); err != nil {
		return out, err
	}
	if err := points.CreditPool(ctx, tx, c.ID, user, "checkin", 10, now); err != nil {
		return out, err
	}
	var count int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM checkins WHERE couple_id=? AND business_date=?", c.ID, out.Date).Scan(&count); err != nil {
		return out, err
	}
	if count == 2 {
		out.DoubleBonus = 10
		out.DoubleDays++
		if _, err := tx.ExecContext(ctx, "UPDATE couples SET double_days=double_days+1 WHERE id=?", c.ID); err != nil {
			return out, err
		}
		if err := points.CreditPool(ctx, tx, c.ID, user, "double_checkin", 10, now); err != nil {
			return out, err
		}
		for _, m := range Milestones {
			if out.DoubleDays == m.Days {
				if _, err := tx.ExecContext(ctx, "INSERT INTO milestones VALUES (?,?,?,?)", c.ID, m.Days, m.Reward, now); err != nil {
					return out, err
				}
				if err := points.CreditPool(ctx, tx, c.ID, user, "milestone", m.Reward, now); err != nil {
					return out, err
				}
				out.MilestoneBonus = m.Reward
			}
		}
	}
	out.Total = out.Base + out.DoubleBonus + out.MilestoneBonus
	return out, nil
}

type Status struct {
	Me      bool `json:"me"`
	Partner bool `json:"partner"`
}

func Read(ctx context.Context, tx *sql.Tx, user, couple, date string) (Status, error) {
	var s Status
	rows, err := tx.QueryContext(ctx, "SELECT user_id FROM checkins WHERE couple_id=? AND business_date=?", couple, date)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return s, err
		}
		if id == user {
			s.Me = true
		} else {
			s.Partner = true
		}
	}
	return s, rows.Err()
}
