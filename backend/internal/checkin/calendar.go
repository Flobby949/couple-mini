package checkin

import (
	"context"
	"database/sql"
	"time"

	"couple-mini/backend/internal/platform"
)

func ValidMood(mood string) bool {
	switch mood {
	case "happy", "calm", "loving", "missing", "tired", "sad", "irritated", "energetic":
		return true
	}
	return false
}

type Entry struct {
	Mood      *string   `json:"mood"`
	CheckedAt time.Time `json:"checkedAt"`
}

// Cache these relationship-scoped facts, never the viewer's me/partner mapping.
type Row struct {
	UserID string `json:"userId"`
	Date   string `json:"date"`
	Entry
}

func ReadRange(ctx context.Context, tx *sql.Tx, couple, start, end string) ([]Row, error) {
	rows, err := tx.QueryContext(ctx, "SELECT user_id,business_date,mood,created_at FROM checkins WHERE couple_id=? AND business_date>=? AND business_date<? ORDER BY business_date,user_id", couple, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Row{}
	for rows.Next() {
		var row Row
		var date time.Time
		if err := rows.Scan(&row.UserID, &date, &row.Mood, &row.CheckedAt); err != nil {
			return nil, err
		}
		row.Date = date.Format("2006-01-02")
		out = append(out, row)
	}
	return out, rows.Err()
}

func Today(rows []Row, user, date string, revision uint64) Status {
	out := Status{Revision: revision}
	for _, row := range rows {
		if row.Date != date {
			continue
		}
		entry := row.Entry
		if row.UserID == user {
			out.Me, out.MeEntry = true, &entry
		} else {
			out.Partner, out.PartnerEntry = true, &entry
		}
	}
	return out
}

type Day struct {
	Date    string `json:"date"`
	Me      *Entry `json:"me"`
	Partner *Entry `json:"partner"`
}

func MonthRange(month, firstMonth, today string) (time.Time, time.Time, error) {
	start, err := time.ParseInLocation("2006-01", month, platform.Beijing)
	if err != nil || start.Format("2006-01") != month {
		return time.Time{}, time.Time{}, platform.Fail(422, "INVALID_MONTH", "请选择有效的月份")
	}
	if month < firstMonth || month > today[:7] {
		return time.Time{}, time.Time{}, platform.Fail(422, "MONTH_OUT_OF_RANGE", "只能查看绑定当月至本月的签到")
	}
	return start, start.AddDate(0, 1, 0), nil
}

func CalendarDays(rows []Row, user string, start, end time.Time) []Day {
	out := make([]Day, 0, 31)
	positions := map[string]int{}
	for date := start; date.Before(end); date = date.AddDate(0, 0, 1) {
		key := date.Format("2006-01-02")
		positions[key] = len(out)
		out = append(out, Day{Date: key})
	}
	for _, row := range rows {
		position, ok := positions[row.Date]
		if !ok {
			continue
		}
		entry := row.Entry
		if row.UserID == user {
			out[position].Me = &entry
		} else {
			out[position].Partner = &entry
		}
	}
	return out
}
