package app

import (
	"context"
	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/events"
	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/notifications"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"encoding/base64"
	"github.com/gin-gonic/gin"
	"strconv"
	"strings"
	"time"
)

func (s *Server) consumer() notifications.Consumer {
	return notifications.Consumer{Mappings: s.NotificationMappings, WechatReady: s.Wechat != nil, MiniProgramState: s.Config.MiniProgramState}
}
func (s *Server) Subscription() eventbus.Subscription {
	return eventbus.Subscription{Name: "notifications", Types: notifications.EventTypes, Handle: s.consumer().Consume}
}
func (s *Server) DispatchNotifications(ctx context.Context) error {
	return s.Subscription().Dispatch(ctx, s.DB, s.Now().UTC())
}
func (s *Server) DeliverNotifications(ctx context.Context) error {
	var sender notifications.Sender
	if s.Wechat != nil {
		sender = s.Wechat
	}
	return notifications.Deliver(ctx, s.DB, sender, s.Now().UTC())
}
func (s *Server) notificationRoutes(a *gin.RouterGroup) {
	a.GET("/notifications", s.messages)
	a.GET("/notifications/unread", s.unread)
	a.GET("/notifications/:id", s.message)
	a.POST("/notifications/read", s.markMessages)
	a.POST("/notifications/read-all", s.markAllMessages)
	a.POST("/rules/:id/read-notification", s.markRuleNotification)
	a.GET("/notification-preferences", s.preferences)
	a.POST("/notification-preferences/:code", s.savePreference)
	a.POST("/notification-authorizations/:code", s.authorization)
	a.GET("/notification-deliveries", s.deliveries)
}

type message struct {
	ID             string        `json:"id"`
	Sequence       string        `json:"sequence"`
	Template       string        `json:"template"`
	Title          string        `json:"title"`
	Body           string        `json:"body"`
	Target         events.Target `json:"target"`
	OccurredAt     time.Time     `json:"occurredAt"`
	ReceivedAt     time.Time     `json:"receivedAt"`
	ReadAt         *time.Time    `json:"readAt"`
	DeliveryStatus *string       `json:"deliveryStatus"`
	DeliveryReason *string       `json:"deliveryReason"`
}

const messageColumns = "n.id,n.sequence,n.template_code,n.title,n.body,n.target_type,n.target_id,n.occurred_at,n.received_at,n.read_at,d.status,d.reason"

func scanMessage(row interface{ Scan(...any) error }) (message, error) {
	var m message
	var seq int64
	err := row.Scan(&m.ID, &seq, &m.Template, &m.Title, &m.Body, &m.Target.Type, &m.Target.ID, &m.OccurredAt, &m.ReceivedAt, &m.ReadAt, &m.DeliveryStatus, &m.DeliveryReason)
	m.Sequence = strconv.FormatInt(seq, 10)
	return m, err
}
func (s *Server) messages(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		query := "SELECT " + messageColumns + " FROM notifications n LEFT JOIN notification_deliveries d ON d.notification_id=n.id WHERE n.user_id=? AND n.in_app=TRUE"
		args := []any{state.Me.ID}
		filter := c.DefaultQuery("filter", "all")
		if filter == "unread" {
			query += " AND n.read_at IS NULL"
		} else if filter != "all" {
			return nil, platform.Fail(422, "INVALID_FILTER", "请选择全部或未读")
		}
		if cursor := c.Query("cursor"); cursor != "" {
			b, err := base64.RawURLEncoding.DecodeString(cursor)
			parts := strings.Split(string(b), "|")
			if err != nil || len(parts) != 2 {
				return nil, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
			}
			at, err := time.Parse(time.RFC3339Nano, parts[0])
			if err != nil {
				return nil, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
			}
			seq, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil {
				return nil, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
			}
			query += " AND (n.occurred_at<? OR (n.occurred_at=? AND n.sequence<?))"
			args = append(args, at, at, seq)
		}
		rows, err := tx.QueryContext(ctx, query+" ORDER BY n.occurred_at DESC,n.sequence DESC LIMIT 51", args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		items := []message{}
		for rows.Next() {
			m, err := scanMessage(rows)
			if err != nil {
				return nil, err
			}
			items = append(items, m)
		}
		if err = rows.Err(); err != nil {
			return nil, err
		}
		next := ""
		if len(items) > 50 {
			items = items[:50]
			last := items[49]
			next = base64.RawURLEncoding.EncodeToString([]byte(last.OccurredAt.Format(time.RFC3339Nano) + "|" + last.Sequence))
		}
		return gin.H{"items": items, "nextCursor": next}, nil
	})
}
func (s *Server) unread(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		var count int
		err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM notifications WHERE user_id=? AND in_app=TRUE AND read_at IS NULL", state.Me.ID).Scan(&count)
		return gin.H{"count": count}, err
	})
}
func (s *Server) message(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		m, err := scanMessage(tx.QueryRowContext(ctx, "SELECT "+messageColumns+" FROM notifications n LEFT JOIN notification_deliveries d ON d.notification_id=n.id WHERE n.id=? AND n.user_id=? AND n.in_app=TRUE", c.Param("id"), state.Me.ID))
		if err == sql.ErrNoRows {
			return nil, platform.Fail(404, "NOT_FOUND", "消息不存在或无权查看")
		}
		return m, err
	})
}
func (s *Server) markMessages(c *gin.Context) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		if _, err := identity.LockCouple(ctx, tx, user, true); err != nil {
			return nil, err
		}
		if len(body.IDs) == 0 || len(body.IDs) > 200 {
			return nil, platform.Fail(422, "INVALID_MESSAGES", "每次请选择 1–200 条已收到消息")
		}
		for _, id := range body.IDs {
			if len(id) != 32 {
				return nil, platform.Fail(422, "INVALID_MESSAGES", "消息标识无效")
			}
			var own int
			if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM notifications WHERE id=? AND user_id=? AND in_app=TRUE", id, user).Scan(&own); err != nil {
				return nil, err
			}
			if own != 1 {
				return nil, platform.Fail(404, "NOT_FOUND", "消息不存在或无权查看")
			}
		}
		for _, id := range body.IDs {
			if _, err := tx.ExecContext(ctx, "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?", now, id, user); err != nil {
				return nil, err
			}
		}
		return gin.H{"read": len(body.IDs)}, nil
	})
}
func (s *Server) markRuleNotification(c *gin.Context) {
	var body struct{}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, false)
		if err != nil {
			return nil, err
		}
		var count int
		if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM rule_proposals WHERE id=? AND couple_id=?", c.Param("id"), couple.ID).Scan(&count); err != nil {
			return nil, err
		}
		if count == 0 {
			return nil, platform.Fail(404, "NOT_FOUND", "规则提议不存在")
		}
		_, err = tx.ExecContext(ctx, "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE user_id=? AND template_code='R02' AND target_type='rules' AND target_id=? AND in_app=TRUE", now, user, c.Param("id"))
		return gin.H{"read": true}, err
	})
}
func (s *Server) preferences(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		items := []gin.H{}
		for _, t := range notifications.Templates {
			channel, err := notifications.Channel(ctx, tx, state.Me.ID, t.Code)
			if err != nil {
				return nil, err
			}
			mapping, mapped := s.NotificationMappings[t.Code]
			available := mapped && s.Wechat != nil
			auth := "none"
			var authAt *time.Time
			err = tx.QueryRowContext(ctx, "SELECT result,created_at FROM subscription_authorizations WHERE user_id=? AND template_code=? ORDER BY created_at DESC,id DESC LIMIT 1", state.Me.ID, t.Code).Scan(&auth, &authAt)
			if err != nil && err != sql.ErrNoRows {
				return nil, err
			}
			var remaining int
			if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM subscription_authorizations WHERE user_id=? AND platform_template=? AND result='accept' AND used=FALSE", state.Me.ID, mapping.TemplateID).Scan(&remaining); err != nil {
				return nil, err
			}
			items = append(items, gin.H{"code": t.Code, "name": t.Name, "group": t.Group, "channel": channel, "wechatAvailable": available, "platformTemplateId": mapping.TemplateID, "authorization": auth, "authorizationAt": authAt, "reportedRemaining": remaining})
		}
		return gin.H{"items": items}, nil
	})
}
func (s *Server) savePreference(c *gin.Context) {
	var body struct {
		Channel string `json:"channel"`
	}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		if _, err := identity.LockCouple(ctx, tx, user, true); err != nil {
			return nil, err
		}
		code := c.Param("code")
		if !notifications.Known(code) || !notifications.ValidChannel(body.Channel) {
			return nil, platform.Fail(422, "INVALID_PREFERENCE", "请选择具体模板与有效渠道")
		}
		_, err := tx.ExecContext(ctx, "INSERT INTO notification_preferences VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE channel=VALUES(channel),updated_at=VALUES(updated_at)", user, code, body.Channel, now)
		return gin.H{"code": code, "channel": body.Channel, "savedAt": now}, err
	})
}
func (s *Server) authorization(c *gin.Context) {
	var body struct {
		PlatformTemplate string `json:"platformTemplateId"`
		Result           string `json:"result"`
		ReportID         string `json:"reportId"`
	}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		if _, err := identity.LockCouple(ctx, tx, user, true); err != nil {
			return nil, err
		}
		if !operationKey.MatchString(body.ReportID) {
			return nil, platform.Fail(422, "INVALID_AUTHORIZATION", "授权报告标识无效")
		}
		var existingID, existingTemplate, existingResult, existingCode string
		err := tx.QueryRowContext(ctx, "SELECT id,platform_template,result,template_code FROM subscription_authorizations WHERE user_id=? AND report_id=?", user, body.ReportID).Scan(&existingID, &existingTemplate, &existingResult, &existingCode)
		if err == nil {
			if existingTemplate != body.PlatformTemplate || existingResult != body.Result || existingCode != c.Param("code") {
				return nil, platform.Fail(409, "AUTHORIZATION_CONFLICT", "授权报告内容已变化")
			}
			return gin.H{"id": existingID, "result": existingResult}, nil
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
		code := c.Param("code")
		mapping, ok := s.NotificationMappings[code]
		if !ok || s.Wechat == nil || mapping.TemplateID != body.PlatformTemplate {
			return nil, platform.Fail(409, "TEMPLATE_UNAVAILABLE", "微信模板未配置或已变化，请刷新")
		}
		switch body.Result {
		case "accept", "reject", "ban", "filter", "fail":
		default:
			return nil, platform.Fail(422, "INVALID_AUTHORIZATION", "授权结果无效")
		}
		if body.Result == "reject" || body.Result == "ban" {
			if _, err := tx.ExecContext(ctx, "UPDATE subscription_authorizations SET used=TRUE WHERE user_id=? AND platform_template=? AND used=FALSE", user, mapping.TemplateID); err != nil {
				return nil, err
			}
		}
		id := platform.ID()
		_, err = tx.ExecContext(ctx, "INSERT INTO subscription_authorizations(id,user_id,report_id,template_code,platform_template,result,created_at) VALUES (?,?,?,?,?,?,?)", id, user, body.ReportID, code, mapping.TemplateID, body.Result, now)
		return gin.H{"id": id, "result": body.Result, "reportedAt": now}, err
	})
}
func (s *Server) deliveries(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		code := c.Query("template")
		if !notifications.Known(code) {
			return nil, platform.Fail(422, "INVALID_PREFERENCE", "模板不存在")
		}
		rows, err := tx.QueryContext(ctx, "SELECT n.id,n.title,d.status,d.reason,d.attempts,d.updated_at FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.user_id=? AND n.template_code=? ORDER BY n.sequence DESC LIMIT 30", state.Me.ID, code)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		items := []gin.H{}
		for rows.Next() {
			var id, title, status, reason string
			var attempts int
			var at time.Time
			if err = rows.Scan(&id, &title, &status, &reason, &attempts, &at); err != nil {
				return nil, err
			}
			items = append(items, gin.H{"id": id, "title": title, "status": status, "reason": reason, "attempts": attempts, "updatedAt": at})
		}
		return gin.H{"items": items}, rows.Err()
	})
}

func (s *Server) markAllMessages(c *gin.Context) {
	var body struct{}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		if _, err := identity.LockCouple(ctx, tx, user, true); err != nil {
			return nil, err
		}
		// Freeze the committed IDs visible to this operation. Never use business time or a future ID cutoff.
		rows, err := tx.QueryContext(ctx, "SELECT id FROM notifications WHERE user_id=? AND in_app=TRUE AND read_at IS NULL", user)
		if err != nil {
			return nil, err
		}
		ids := []string{}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			ids = append(ids, id)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if _, err = tx.ExecContext(ctx, "UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL", now, id, user); err != nil {
				return nil, err
			}
		}
		return gin.H{"read": len(ids)}, nil
	})
}
