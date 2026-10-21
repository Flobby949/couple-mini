package notifications

import (
	"couple-mini/backend/internal/events"
	"couple-mini/backend/internal/platform"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

type Message struct {
	Title, Body string
	Target      events.Target
	Fields      map[string]string
}

func Render(code, user, actor string, payload json.RawMessage, s events.Snapshot, at time.Time) (Message, error) {
	m := Message{Fields: map[string]string{"actor": s.Names[actor], "occurredAt": at.In(platform.Beijing).Format("2006-01-02 15:04")}}
	if actor == "" {
		m.Fields["actor"] = "系统"
	}
	name := func(id string) string { return s.Names[id] }
	deadline := func(t *time.Time) string {
		if t == nil {
			return ""
		}
		return t.In(platform.Beijing).Format("2006-01-02 15:04:05") + " 北京时间"
	}
	num := func(n int64) string { return strconv.FormatInt(n, 10) }
	if len(code) != 3 {
		return m, fmt.Errorf("unknown template")
	}
	switch code[0] {
	case 'O':
		var e events.OrderChange
		if err := json.Unmarshal(payload, &e); err != nil {
			return m, err
		}
		o, r := e.Order, e.Result
		m.Target = events.Target{Type: "order", ID: o.ID}
		m.Fields["name"] = o.Snapshot.Name
		m.Fields["amount"] = num(o.Snapshot.Price)
		item := "《" + o.Snapshot.Name + "》"
		refund := fmt.Sprintf("已退还 %d 积分", o.Snapshot.Price)
		if o.Snapshot.Price == 0 {
			refund = "本单为 0 积分，无需退分"
		}
		auto := ""
		if o.AutoConfirmAt != nil {
			auto = o.AutoConfirmAt.In(platform.Beijing).Format("2006-01-02 15:04") + " 北京时间"
		}
		switch code {
		case "O01":
			m.Title = "你有新订单"
			m.Body = fmt.Sprintf("%s兑换了%s，实扣 %d 积分，请接单或拒绝。", name(o.BuyerID), item, o.Snapshot.Price)
		case "O02":
			m.Title = "订单已接单"
			m.Body = name(o.SellerID) + "已接受" + item + "订单，等待兑现。"
		case "O03":
			m.Title = "订单未被接受"
			m.Body = item + "订单已被" + name(o.SellerID) + "拒绝，" + refund + "。"
		case "O04":
			m.Title = "订单已取消"
			m.Body = name(o.BuyerID) + "取消了" + item + "订单，已返还 1 份库存。"
		case "O05":
			if auto == "" {
				return m, fmt.Errorf("auto-confirm time missing")
			}
			m.Title = "请确认兑现结果"
			m.Body = name(o.SellerID) + "已提交" + item + "的兑现结果，请确认或驳回；本轮将于 " + auto + " 自动确认。"
		case "O06":
			m.Title = "兑现结果被驳回"
			m.Body = name(o.BuyerID) + "驳回了" + item + "的兑现结果，请继续兑现后重新提交。"
		case "O07":
			m.Title = "订单已完成"
			m.Body = name(o.BuyerID) + "已确认" + item + "的兑现结果，订单完成。"
		case "O08":
			m.Title = "订单已自动完成"
			m.Body = item + "订单已自动确认收货。"
		case "O09":
			m.Title = "请处理取消申请"
			m.Body = name(o.BuyerID) + "申请取消" + item + "订单，请同意或拒绝；申请待处理期间订单不会自动完成。"
		case "O10":
			m.Title = "取消申请已同意"
			m.Body = name(o.SellerID) + "已同意取消" + item + "订单，" + refund + "。"
		case "O11":
			m.Title = "取消申请未获同意"
			m.Body = name(o.SellerID) + "未同意取消" + item + "订单。"
			if o.Status == "awaiting_receipt" {
				if auto == "" {
					return m, fmt.Errorf("renewed auto-confirm time missing")
				}
				m.Body += "本轮将于 " + auto + " 自动确认。"
			} else {
				m.Body += "订单继续待兑现。"
			}
		case "O12":
			if user == o.SellerID {
				m.Title = "订单取消扣分"
				m.Body = fmt.Sprintf("你取消了%s订单，本次扣除 %d 积分并入池，扣后余额为 %d。", item, r.Penalty, r.SellerBalance)
				m.Fields["amount"] = num(r.Penalty)
			} else {
				m.Title = "店主取消了订单"
				m.Body = name(o.SellerID) + "取消了" + item + "订单，" + refund + "。"
			}
		}
	case 'T':
		var e events.TaskChange
		if err := json.Unmarshal(payload, &e); err != nil {
			return m, err
		}
		t, r := e.Task, e.Result
		m.Target = events.Target{Type: "task", ID: t.ID}
		m.Fields["name"] = t.Name
		m.Fields["amount"] = num(t.Reward)
		item := "《" + t.Name + "》"
		terms := fmt.Sprintf("奖励 %d 积分，截止 %s", t.Reward, deadline(t.EffectiveDeadline))
		if t.Kind == "joint" {
			terms = fmt.Sprintf("每人奖励 %d 积分，不限时", t.Reward)
		}
		switch code {
		case "T01":
			m.Title = "有新任务待接受"
			verb := "邀请你完成"
			if t.Kind == "joint" {
				verb = "邀请你一起完成"
			}
			m.Body = name(t.CreatorID) + verb + item + "，" + terms + "，请接受或拒绝。"
		case "T02":
			m.Title = "任务已更新"
			m.Body = name(t.CreatorID) + "更新了" + item + "，请查看最新内容。" + terms + "。"
		case "T03":
			m.Title = "任务已接受"
			m.Body = name(t.PartnerID) + "已接受" + item + "。"
			if t.Kind == "joint" {
				m.Body += "共同任务已开始，不限时。"
			} else {
				m.Body += "截止 " + deadline(t.EffectiveDeadline) + "。"
			}
		case "T04":
			m.Title = "任务未被接受"
			m.Body = fmt.Sprintf("%s拒绝了%s，已释放 %d 积分回池，无罚分。", name(t.PartnerID), item, r.Released)
		case "T05":
			m.Title = "任务到期未被接受"
			m.Body = fmt.Sprintf("%s已到期结束，预留的 %d 积分已释放回池，无罚分。", item, r.Released)
		case "T06":
			m.Title = "请确认任务完成"
			m.Body = name(actor) + "提交了" + item + "的完成结果，请确认或驳回；确认后按各人当日剩余额度结算。"
		case "T07":
			m.Title = "任务需要补正"
			m.Body = name(actor) + "驳回了" + item + "的完成结果，请补正后重新提交。"
			if t.Kind == "joint" {
				m.Body += "仍不限时。"
			} else {
				m.Body += "补正截止 " + deadline(t.EffectiveDeadline) + "。"
			}
		case "T08":
			m.Title = "任务已完成"
			found := false
			for _, a := range r.Awards {
				if a.UserID == user {
					found = true
					m.Body = fmt.Sprintf("%s已确认完成，你的约定奖励为 %d 积分，实际到账 %d 积分。", item, a.Agreed, a.Actual)
					m.Fields["amount"] = num(a.Actual)
					if a.Unpaid > 0 {
						m.Body += fmt.Sprintf("因今日剩余额度不足，未到账的 %d 积分已释放回池，不再补发。", a.Unpaid)
					}
				}
			}
			if !found {
				return m, fmt.Errorf("recipient award missing")
			}
		case "T09":
			m.Title = "任务超时结束"
			m.Body = fmt.Sprintf("%s已超时结束，预留的 %d 积分已释放回池；", item, r.Released)
			m.Fields["amount"] = num(r.Penalty)
			if user == t.PartnerID {
				if r.PenaltyBalance == nil {
					return m, fmt.Errorf("penalty balance missing")
				}
				m.Body += fmt.Sprintf("本次罚分 %d 积分并入池，扣后余额 %d。", r.Penalty, *r.PenaltyBalance)
			} else {
				m.Body += fmt.Sprintf("执行方罚分 %d 积分已入池。", r.Penalty)
			}
		case "T10":
			m.Title = "请处理任务取消申请"
			m.Body = name(actor) + "申请取消" + item + "，请同意或拒绝。"
			if t.Kind == "partner" && t.Status == "active" {
				m.Body += "申请不顺延截止时间，仍需在 " + deadline(t.EffectiveDeadline) + " 前提交完成。"
			}
		case "T11":
			m.Title = "任务取消申请已同意"
			m.Body = fmt.Sprintf("%s已同意取消%s，预留的 %d 积分已释放回池，无罚分。", name(actor), item, r.Released)
		case "T12":
			m.Title = "任务取消申请未获同意"
			m.Body = name(actor) + "未同意取消" + item + "，任务继续按当前约定进行。"
			if t.Status == "awaiting" {
				m.Body += "继续等待完成确认。"
			} else if t.Kind == "joint" {
				m.Body += "共同任务仍不限时。"
			} else if t.Status == "active" {
				m.Body += "仍需在 " + deadline(t.EffectiveDeadline) + " 前提交完成。"
			}
		}
	case 'P':
		if code == "P01" {
			var g events.Gift
			if err := json.Unmarshal(payload, &g); err != nil {
				return m, err
			}
			m.Title = "收到伴侣赠送"
			m.Target = events.Target{Type: "gift", ID: g.ID}
			m.Fields["name"] = "伴侣赠送"
			m.Fields["amount"] = num(g.Actual)
			m.Body = fmt.Sprintf("%s赠送了你 %d 积分，实际到账 %d 积分。", name(g.SenderID), g.Requested, g.Actual)
			if g.Discarded > 0 {
				m.Body += fmt.Sprintf("受今日剩余额度限制，超出的 %d 积分未发放，不入池、不补发。", g.Discarded)
			}
		} else {
			var c events.Checkin
			if err := json.Unmarshal(payload, &c); err != nil {
				return m, err
			}
			m.Target = events.Target{Type: "home"}
			m.Fields["name"] = "双人签到"
			if code == "P02" {
				m.Title = "伴侣已签到"
				m.Body = name(actor) + "今天已签到，积分池增加 10 积分，你今天还未签到。"
				m.Fields["amount"] = "10"
				if c.DoubleBonus > 0 {
					m.Title = "双人签到完成"
					m.Body = fmt.Sprintf("%s已签到，今天基础签到及双人奖励共 30 积分已入池，累计双人签到 %d 天。", name(actor), c.DoubleDays)
					m.Fields["amount"] = "30"
				}
			} else if code == "P03" {
				m.Title = "达成双人签到里程碑"
				m.Body = fmt.Sprintf("累计双人签到达到 %d 天，额外 %d 积分已进入共同积分池。", c.DoubleDays, c.MilestoneBonus)
				m.Fields["amount"] = num(c.MilestoneBonus)
			}
		}
	case 'R':
		var r events.Rule
		if err := json.Unmarshal(payload, &r); err != nil {
			return m, err
		}
		m.Fields["name"] = "共同规则"
		m.Fields["amount"] = num(r.DailyLimit)
		switch code {
		case "R01":
			m.Title = "伴侣绑定成功"
			m.Body = name(actor) + "已与你绑定，接下来请共同确认使用规则。"
			m.Target = events.Target{Type: "partner"}
		case "R02":
			m.Title = "请确认共同规则"
			m.Target = events.Target{Type: "rules", ID: r.ID}
			if r.PreviousLimit == nil {
				m.Body = fmt.Sprintf("%s提议将每日获得上限设为 %d 积分，请确认。", name(actor), r.DailyLimit)
			} else {
				m.Body = fmt.Sprintf("%s提议将每日获得上限由 %d 调整为 %d 积分，请确认。", name(actor), *r.PreviousLimit, r.DailyLimit)
			}
		case "R03":
			m.Title = "共同规则已生效"
			m.Target = events.Target{Type: "rules", ID: r.ProposalID}
			if r.PreviousLimit == nil {
				m.Body = fmt.Sprintf("双方每日获得上限为 %d 积分，现可开始使用积分、任务和下单功能。", r.DailyLimit)
			} else {
				m.Body = fmt.Sprintf("每日获得上限已由 %d 调整为 %d 积分，立即生效；今日已获得积分和已用赠送次数不重置。", *r.PreviousLimit, r.DailyLimit)
			}
			if r.VoidedCount > 0 {
				m.Body += "其余待确认提议已自动作废。"
			}
		}
	}
	if m.Title == "" || m.Body == "" {
		return m, fmt.Errorf("unknown template %s", code)
	}
	m.Fields["title"] = m.Title
	return m, nil
}
