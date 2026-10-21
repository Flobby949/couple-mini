package notifications

import (
	"context"
	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/events"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

type Consumer struct {
	Mappings         Mappings
	WechatReady      bool
	MiniProgramState string
}

func (c Consumer) Consume(ctx context.Context, tx *sql.Tx, e eventbus.Event, now time.Time) error {
	if e.Version != 2 || len(e.Snapshot) == 0 {
		return fmt.Errorf("event snapshot unavailable")
	}
	var s events.Snapshot
	if err := json.Unmarshal(e.Snapshot, &s); err != nil {
		return err
	}
	for _, r := range s.Recipients {
		if !Known(r.Template) || !ValidChannel(r.Channel) {
			return fmt.Errorf("invalid frozen preference")
		}
		if r.Channel == "off" {
			continue
		}
		m, err := Render(r.Template, r.UserID, e.Actor, e.Payload, s, e.OccurredAt)
		if err != nil {
			return err
		}
		id := platform.ID()
		inApp := r.Channel == "in_app" || r.Channel == "both"
		_, err = tx.ExecContext(ctx, "INSERT INTO notifications(id,event_id,user_id,template_code,title,body,target_type,target_id,in_app,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", id, e.ID, r.UserID, r.Template, m.Title, m.Body, m.Target.Type, m.Target.ID, inApp, e.OccurredAt, now)
		if err != nil {
			return err
		}
		if r.Channel == "wechat" || r.Channel == "both" {
			if err = c.delivery(ctx, tx, id, r.UserID, r.Template, m, now); err != nil {
				return err
			}
		}
	}
	return nil
}
func (c Consumer) delivery(ctx context.Context, tx *sql.Tx, id, user, code string, m Message, now time.Time) error {
	mapping, ok := c.Mappings[code]
	status, reason := "pending", ""
	if !ok {
		status, reason = "unavailable", "template_unmapped"
	} else if !c.WechatReady {
		status, reason = "unavailable", "wechat_not_configured"
	}
	var openid string
	if err := tx.QueryRowContext(ctx, "SELECT openid FROM users WHERE id=?", user).Scan(&openid); err != nil {
		return err
	}
	if status == "pending" && strings.HasPrefix(openid, "dev:") {
		status, reason = "unavailable", "development_identity"
	}
	if status == "pending" {
		var grant string
		err := tx.QueryRowContext(ctx, "SELECT id FROM subscription_authorizations WHERE user_id=? AND platform_template=? AND result='accept' AND used=FALSE ORDER BY created_at,id LIMIT 1 FOR UPDATE", user, mapping.TemplateID).Scan(&grant)
		if err == sql.ErrNoRows {
			status, reason = "unavailable", "no_authorization"
		} else if err != nil {
			return err
		} else if _, err = tx.ExecContext(ctx, "UPDATE subscription_authorizations SET used=TRUE WHERE id=?", grant); err != nil {
			return err
		}
	}
	data := map[string]map[string]string{}
	for key, source := range mapping.Fields {
		value := m.Fields[source]
		limit := 20
		if strings.HasPrefix(key, "phrase") {
			limit = 5
		} else if strings.HasPrefix(key, "character_string") {
			limit = 32
		}
		if source != "amount" && source != "occurredAt" && utf8.RuneCountInString(value) > limit {
			value = string([]rune(value)[:limit])
		}
		data[key] = map[string]string{"value": value}
	}
	state := c.MiniProgramState
	if state == "" {
		state = "trial"
	}
	payload, err := json.Marshal(map[string]any{"touser": openid, "template_id": mapping.TemplateID, "page": TargetPage(m.Target), "data": data, "miniprogram_state": state, "lang": "zh_CN"})
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO notification_deliveries(notification_id,user_id,platform_template,payload,status,reason,next_attempt_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", id, user, mapping.TemplateID, payload, status, reason, now, now)
	return err
}
func TargetPage(t events.Target) string {
	switch t.Type {
	case "order":
		return "packages/commerce/order-detail/index?id=" + t.ID
	case "task":
		return "packages/tasks/detail/index?id=" + t.ID
	case "gift":
		return "packages/account/gift-detail/index?id=" + t.ID
	case "rules":
		return "packages/account/rules/index?id=" + t.ID
	case "partner":
		return "packages/account/partner/index"
	default:
		return "pages/home/index"
	}
}
