package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"couple-mini/backend/internal/checkin"
	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/platform"
	"github.com/gin-gonic/gin"
)

func checkinMood(raw []byte, date string) (*string, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, nil // Older clients sent no body or {}.
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, platform.Fail(400, "INVALID_BODY", "请求格式不正确")
	}
	if len(fields) == 0 {
		return nil, nil
	}
	var input struct {
		Mood         string `json:"mood"`
		ExpectedDate string `json:"expectedDate"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil {
		return nil, platform.Fail(400, "INVALID_BODY", "请求格式不正确")
	}
	if !checkin.ValidMood(input.Mood) {
		return nil, platform.Fail(422, "INVALID_MOOD", "请选择一种心情后再签到")
	}
	expected, err := time.Parse("2006-01-02", input.ExpectedDate)
	if err != nil || expected.Format("2006-01-02") != input.ExpectedDate {
		return nil, platform.Fail(422, "INVALID_CHECKIN_DATE", "请刷新今天的签到状态")
	}
	if input.ExpectedDate != date {
		return nil, platform.Fail(409, "CHECKIN_DATE_CHANGED", "已经是新的一天，请刷新后重新选择心情")
	}
	return &input.Mood, nil
}

func (s *Server) checkin(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		s.fail(c, platform.Fail(400, "INVALID_BODY", "请求内容过大"))
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(raw))
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		// Validate after arbitration: an immutable old receipt must still replay.
		mood, err := checkinMood(raw, platform.Date(now))
		if err != nil {
			return nil, err
		}
		result, err := checkin.Record(ctx, tx, user, couple, now, mood)
		if err != nil {
			return nil, err
		}
		// Revision is committed with the record. DEL is only an early cleanup.
		s.invalidateReadCache(ctx, couple.ID, "checkins")
		return result, eventbus.Save(ctx, tx, couple.ID, user, "CheckinRecorded", result, now)
	})
}

func (s *Server) cachedCheckins(ctx context.Context, tx *sql.Tx, couple identity.Couple, period, start, end string, sealed bool) ([]checkin.Row, error) {
	kind, ttl := "checkins", activityCacheTTL
	field := fmt.Sprintf("v2:%s:%s:r%d", period, start, couple.CheckinRevision)
	if sealed {
		kind, ttl, field = "checkin-history", stableCacheTTL, "v2:month:"+start+":sealed"
	}
	return cachedRead(s, ctx, readCacheKey(kind, couple.ID), field, ttl, func() ([]checkin.Row, error) {
		return checkin.ReadRange(ctx, tx, couple.ID, start, end)
	})
}

func (s *Server) checkinCalendar(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		month := c.Query("month")
		if month == "" {
			month = state.BusinessDate[:7]
		}
		firstMonth := state.Couple.CreatedAt.In(platform.Beijing).Format("2006-01")
		start, end, err := checkin.MonthRange(month, firstMonth, state.BusinessDate)
		if err != nil {
			return nil, err
		}
		rows, err := s.cachedCheckins(ctx, tx, *state.Couple, "month", start.Format("2006-01-02"), end.Format("2006-01-02"), month < state.BusinessDate[:7])
		if err != nil {
			return nil, err
		}
		return gin.H{"month": month, "firstMonth": firstMonth, "businessDate": state.BusinessDate, "serverTime": state.ServerTime, "revision": state.Couple.CheckinRevision, "days": checkin.CalendarDays(rows, state.Me.ID, start, end)}, nil
	})
}
