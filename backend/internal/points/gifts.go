package points

import (
	"context"
	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"time"
)

type GiftPreview struct {
	ReceiverID        string `json:"receiverId"`
	DailyLimit        int64  `json:"dailyLimit"`
	SingleMax         int64  `json:"singleMax"`
	ReceiverRemaining int64  `json:"receiverRemaining"`
	SendsRemaining    int    `json:"sendsRemaining"`
}
type Gift struct {
	ID         string    `json:"id"`
	SenderID   string    `json:"senderId"`
	ReceiverID string    `json:"receiverId"`
	Requested  int64     `json:"requested"`
	Actual     int64     `json:"actual"`
	Discarded  int64     `json:"discarded"`
	DailyLimit int64     `json:"dailyLimit"`
	CreatedAt  time.Time `json:"createdAt"`
}

func PreviewGift(ctx context.Context, tx *sql.Tx, couple, user string, limit int64, now time.Time) (GiftPreview, error) {
	p := GiftPreview{DailyLimit: limit, SingleMax: (limit + 2) / 5, SendsRemaining: 3}
	if err := tx.QueryRowContext(ctx, "SELECT user_id FROM members WHERE couple_id=? AND user_id<>?", couple, user).Scan(&p.ReceiverID); err != nil {
		return p, err
	}
	var sent int
	err := tx.QueryRowContext(ctx, "SELECT gifts_sent FROM daily_points WHERE user_id=? AND business_date=?", user, platform.Date(now)).Scan(&sent)
	if err != nil && err != sql.ErrNoRows {
		return p, err
	}
	p.SendsRemaining = max(0, 3-sent)
	p.ReceiverRemaining, err = Remaining(ctx, tx, p.ReceiverID, platform.Date(now), limit)
	return p, err
}
func Give(ctx context.Context, tx *sql.Tx, couple, user string, requested, limit int64, now time.Time) (Gift, error) {
	var gift Gift
	p, err := PreviewGift(ctx, tx, couple, user, limit, now)
	if err != nil {
		return gift, err
	}
	if requested > p.SingleMax {
		return gift, platform.Fail(422, "GIFT_LIMIT", "申请积分超过本次赠送上限，请刷新额度")
	}
	if p.SendsRemaining < 1 {
		return gift, platform.Fail(409, "GIFT_COUNT_LIMIT", "今天的 3 次赠送已用完")
	}
	actual := min(requested, p.ReceiverRemaining)
	gift = Gift{platform.ID(), user, p.ReceiverID, requested, actual, requested - actual, limit, now}
	if _, err = tx.ExecContext(ctx, "INSERT INTO point_gifts VALUES (?,?,?,?,?,?,?,?,?)", gift.ID, couple, user, p.ReceiverID, requested, actual, gift.Discarded, limit, now); err != nil {
		return gift, err
	}
	for _, id := range []string{user, p.ReceiverID} {
		if err = ensureDay(ctx, tx, id, platform.Date(now)); err != nil {
			return gift, err
		}
	}
	if _, err = tx.ExecContext(ctx, "UPDATE daily_points SET gifts_sent=gifts_sent+1 WHERE user_id=? AND business_date=?", user, platform.Date(now)); err != nil {
		return gift, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE daily_points SET earned=earned+? WHERE user_id=? AND business_date=?", actual, p.ReceiverID, platform.Date(now)); err != nil {
		return gift, err
	}
	if _, err = changeAccount(ctx, tx, p.ReceiverID, "partner_gift", actual, nil, nil, &gift.ID, now); err != nil {
		return gift, err
	}
	return gift, eventbus.Save(ctx, tx, couple, user, "PointsGifted", gift, now)
}
func Gifts(ctx context.Context, tx *sql.Tx, couple string) ([]Gift, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,sender_id,receiver_id,requested,actual,discarded,daily_limit,created_at FROM point_gifts WHERE couple_id=? ORDER BY created_at DESC,id DESC LIMIT 100", couple)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Gift{}
	for rows.Next() {
		var g Gift
		if err = rows.Scan(&g.ID, &g.SenderID, &g.ReceiverID, &g.Requested, &g.Actual, &g.Discarded, &g.DailyLimit, &g.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
