package notifications

import (
	"context"
	"couple-mini/backend/internal/events"
	"database/sql"
	"encoding/json"
	"fmt"
)

type Template struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	Group string `json:"group"`
}

var Templates = []Template{
	{"O01", "新订单待接单", "订单"}, {"O02", "订单已接单", "订单"}, {"O03", "订单被拒绝", "订单"}, {"O04", "下单方直接取消", "订单"}, {"O05", "订单待确认收货", "订单"}, {"O06", "兑现被驳回", "订单"}, {"O07", "下单方确认收货", "订单"}, {"O08", "订单自动完成", "订单"}, {"O09", "订单取消待处理", "订单"}, {"O10", "订单取消获同意", "订单"}, {"O11", "订单取消被拒绝", "订单"}, {"O12", "店主主动取消", "订单"},
	{"T01", "新任务待接受", "任务"}, {"T02", "待接受任务已更新", "任务"}, {"T03", "任务已接受", "任务"}, {"T04", "任务被拒绝", "任务"}, {"T05", "未接受任务到期", "任务"}, {"T06", "任务完成待确认", "任务"}, {"T07", "任务完成被驳回", "任务"}, {"T08", "任务完成结算", "任务"}, {"T09", "已接受任务超时", "任务"}, {"T10", "任务取消待处理", "任务"}, {"T11", "任务取消获同意", "任务"}, {"T12", "任务取消被拒绝", "任务"},
	{"P01", "收到伴侣赠送", "积分与签到"}, {"P02", "伴侣已签到", "积分与签到"}, {"P03", "双人签到里程碑", "积分与签到"}, {"R01", "伴侣绑定成功", "绑定与规则"}, {"R02", "共同规则待确认", "绑定与规则"}, {"R03", "共同规则已生效", "绑定与规则"},
}
var EventTypes = []string{"OrderChanged", "TaskChanged", "PointsGifted", "CoupleBound", "RulesProposed", "RulesActivated", "CheckinRecorded"}

func Known(code string) bool {
	for _, t := range Templates {
		if t.Code == code {
			return true
		}
	}
	return false
}
func ValidChannel(c string) bool { return c == "in_app" || c == "wechat" || c == "both" || c == "off" }
func Channel(ctx context.Context, tx *sql.Tx, user, code string) (string, error) {
	var channel string
	err := tx.QueryRowContext(ctx, "SELECT channel FROM notification_preferences WHERE user_id=? AND template_code=?", user, code).Scan(&channel)
	if err == sql.ErrNoRows {
		return "in_app", nil
	}
	return channel, err
}

// Capture plans recipients and resolves defaults while the relationship is locked.
// The consumer renders only this immutable payload and never looks up mutable business objects.
func Capture(ctx context.Context, tx *sql.Tx, couple, actor, kind string, payload json.RawMessage) (json.RawMessage, error) {
	s := events.Snapshot{Names: map[string]string{}, Recipients: []events.Recipient{}}
	rows, err := tx.QueryContext(ctx, "SELECT u.id,u.nickname FROM members m JOIN users u ON u.id=m.user_id WHERE m.couple_id=?", couple)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, name string
		if err = rows.Scan(&id, &name); err != nil {
			rows.Close()
			return nil, err
		}
		s.Names[id] = name
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	partner := ""
	for id := range s.Names {
		if id != actor {
			partner = id
		}
	}
	add := func(code string, users ...string) {
		for _, user := range users {
			s.Recipients = append(s.Recipients, events.Recipient{UserID: user, Template: code})
		}
	}
	switch kind {
	case "OrderChanged":
		var e events.OrderChange
		if err = json.Unmarshal(payload, &e); err != nil {
			return nil, err
		}
		o, r := e.Order, e.Result
		switch r.Action {
		case "placed":
			add("O01", o.SellerID)
		case "accept":
			add("O02", o.BuyerID)
		case "reject":
			add("O03", o.BuyerID)
		case "fulfill":
			add("O05", o.BuyerID)
		case "reject_fulfillment":
			add("O06", o.SellerID)
		case "confirm":
			add("O07", o.SellerID)
		case "auto_confirm":
			add("O08", o.BuyerID, o.SellerID)
		case "request_cancel":
			add("O09", o.SellerID)
		case "approve_cancel":
			add("O10", o.BuyerID)
		case "deny_cancel":
			add("O11", o.BuyerID)
		case "cancel":
			if actor == o.BuyerID {
				add("O04", o.SellerID)
			} else {
				add("O12", o.BuyerID)
				if r.Penalty > 0 {
					add("O12", o.SellerID)
				}
			}
		default:
			return nil, fmt.Errorf("unmapped order action %s", r.Action)
		}
	case "TaskChanged":
		var e events.TaskChange
		if err = json.Unmarshal(payload, &e); err != nil {
			return nil, err
		}
		t, r := e.Task, e.Result
		switch r.Action {
		case "created":
			add("T01", t.PartnerID)
		case "edited":
			add("T02", t.PartnerID)
		case "accept":
			add("T03", t.CreatorID)
		case "reject_accept":
			add("T04", t.CreatorID)
		case "expired":
			add("T05", t.CreatorID, t.PartnerID)
		case "submit":
			add("T06", partner)
		case "reject_completion":
			add("T07", partner)
		case "confirm":
			for _, a := range r.Awards {
				add("T08", a.UserID)
			}
		case "timed_out":
			add("T09", t.CreatorID, t.PartnerID)
		case "request_cancel":
			add("T10", partner)
		case "approve_cancel":
			add("T11", partner)
		case "deny_cancel":
			add("T12", partner)
		default:
			return nil, fmt.Errorf("unmapped task action %s", r.Action)
		}
	case "PointsGifted":
		var g events.Gift
		if err = json.Unmarshal(payload, &g); err != nil {
			return nil, err
		}
		add("P01", g.ReceiverID)
	case "CoupleBound":
		add("R01", partner)
	case "RulesProposed":
		add("R02", partner)
	case "RulesActivated":
		var r events.Rule
		if err = json.Unmarshal(payload, &r); err != nil {
			return nil, err
		}
		add("R03", r.ProposerID)
	case "CheckinRecorded":
		var c events.Checkin
		if err = json.Unmarshal(payload, &c); err != nil {
			return nil, err
		}
		add("P02", partner)
		if c.MilestoneBonus > 0 {
			for id := range s.Names {
				add("P03", id)
			}
		}
	default:
		return nil, fmt.Errorf("unmapped event type %s", kind)
	}
	for i := range s.Recipients {
		r := &s.Recipients[i]
		if _, ok := s.Names[r.UserID]; !ok {
			return nil, fmt.Errorf("recipient outside relationship")
		}
		r.Channel, err = Channel(ctx, tx, r.UserID, r.Template)
		if err != nil {
			return nil, err
		}
	}
	return json.Marshal(s)
}
