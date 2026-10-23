package orders

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"couple-mini/backend/internal/catalog"
	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/points"
)

const Pending = "pending"
const Fulfilling = "fulfilling"
const Awaiting = "awaiting_receipt"
const Completed = "completed"
const Rejected = "rejected"
const Cancelled = "cancelled"

type Snapshot struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CoverID     string `json:"coverId"`
	Price       int64  `json:"price"`
}
type Order struct {
	ID             string     `json:"id"`
	BuyerID        string     `json:"buyerId"`
	SellerID       string     `json:"sellerId"`
	ProductID      string     `json:"productId"`
	Snapshot       Snapshot   `json:"snapshot"`
	Status         string     `json:"status"`
	CancelPending  bool       `json:"cancelPending"`
	AutoConfirmAt  *time.Time `json:"autoConfirmAt"`
	Refunded       int64      `json:"refunded"`
	Penalty        int64      `json:"penalty"`
	EndedReason    string     `json:"endedReason"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	AllowedActions []string   `json:"allowedActions"`
}
type Receipt struct {
	OrderID       string    `json:"orderId"`
	Action        string    `json:"action"`
	Charged       int64     `json:"charged"`
	Refunded      int64     `json:"refunded"`
	Penalty       int64     `json:"penalty"`
	BuyerBalance  int64     `json:"buyerBalance"`
	SellerBalance int64     `json:"sellerBalance"`
	OccurredAt    time.Time `json:"occurredAt"`
	Snapshot      Snapshot  `json:"snapshot"`
}
type History struct {
	ID         string    `json:"id"`
	ActorID    *string   `json:"actorId"`
	Action     string    `json:"action"`
	OccurredAt time.Time `json:"occurredAt"`
}

const columns = "id,buyer_id,seller_id,product_id,snapshot_name,snapshot_description,snapshot_cover_id,points,status,cancel_pending,auto_confirm_at,refunded,penalty,ended_reason,created_at,updated_at"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Order, error) {
	var o Order
	err := row.Scan(&o.ID, &o.BuyerID, &o.SellerID, &o.ProductID, &o.Snapshot.Name, &o.Snapshot.Description, &o.Snapshot.CoverID, &o.Snapshot.Price, &o.Status, &o.CancelPending, &o.AutoConfirmAt, &o.Refunded, &o.Penalty, &o.EndedReason, &o.CreatedAt, &o.UpdatedAt)
	return o, err
}

func Actions(o Order, user string) []string {
	out := []string{}
	if o.Status == Completed || o.Status == Rejected || o.Status == Cancelled {
		return out
	}
	if user == o.SellerID {
		if o.CancelPending {
			return []string{"approve_cancel", "deny_cancel", "cancel"}
		}
		switch o.Status {
		case Pending:
			return []string{"accept", "reject"}
		case Fulfilling:
			return []string{"fulfill", "cancel"}
		case Awaiting:
			return []string{"cancel"}
		}
	}
	if user == o.BuyerID {
		if o.CancelPending {
			return out
		}
		switch o.Status {
		case Pending:
			return []string{"cancel"}
		case Fulfilling:
			return []string{"request_cancel"}
		case Awaiting:
			return []string{"confirm", "reject_fulfillment", "request_cancel"}
		}
	}
	return out
}
func Get(ctx context.Context, tx *sql.Tx, couple, user, id string) (Order, error) {
	o, err := scan(tx.QueryRowContext(ctx, "SELECT "+columns+" FROM orders WHERE id=? AND couple_id=? AND (buyer_id=? OR seller_id=?)", id, couple, user, user))
	if err == sql.ErrNoRows {
		return o, platform.Fail(404, "NOT_FOUND", "订单不存在或无权查看")
	}
	o.AllowedActions = Actions(o, user)
	return o, err
}
func Timeline(ctx context.Context, tx *sql.Tx, id string) ([]History, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,actor_id,action,occurred_at FROM order_history WHERE order_id=? ORDER BY id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []History{}
	for rows.Next() {
		var h History
		var n int64
		if err = rows.Scan(&n, &h.ActorID, &h.Action, &h.OccurredAt); err != nil {
			return nil, err
		}
		h.ID = strconv.FormatInt(n, 10)
		out = append(out, h)
	}
	return out, rows.Err()
}

func Place(ctx context.Context, tx *sql.Tx, couple, user, productID string, confirmedPrice int64, now time.Time) (Receipt, error) {
	var r Receipt
	p, err := catalog.Get(ctx, tx, productID, couple)
	if err != nil {
		return r, err
	}
	if p.OwnerID == user {
		return r, platform.Fail(403, "OWN_PRODUCT", "只能在伴侣的小店下单")
	}
	if !p.OnSale {
		return r, platform.Fail(409, "PRODUCT_OFF_SALE", "商品已下架，暂不能下单")
	}
	if p.Price != confirmedPrice {
		return r, platform.Fail(409, "PRICE_CHANGED", fmt.Sprintf("价格已从 %d 更新为 %d 积分，请重新确认", confirmedPrice, p.Price))
	}
	balance, err := points.Balance(ctx, tx, user)
	if err != nil {
		return r, err
	}
	if balance < 0 {
		return r, platform.Fail(409, "NEGATIVE_BALANCE", "当前余额为负，恢复至非负后才能下单，包括 0 积分商品")
	}
	if balance < p.Price {
		return r, platform.Fail(409, "INSUFFICIENT_POINTS", "当前积分不足，请刷新余额")
	}
	if err = catalog.ChangeStock(ctx, tx, p.ID, -1, now); err != nil {
		return r, err
	}
	o := Order{ID: platform.ID(), BuyerID: user, SellerID: p.OwnerID, ProductID: p.ID, Snapshot: Snapshot{p.Name, p.Description, p.CoverID, p.Price}, Status: Pending, CreatedAt: now, UpdatedAt: now}
	if _, err = tx.ExecContext(ctx, "INSERT INTO orders (id,couple_id,buyer_id,seller_id,product_id,snapshot_name,snapshot_description,snapshot_cover_id,points,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", o.ID, couple, user, p.OwnerID, p.ID, p.Name, p.Description, p.CoverID, p.Price, Pending, now, now); err != nil {
		return r, err
	}
	balance, err = points.ChangeAccount(ctx, tx, user, o.ID, "order_spend", -p.Price, now)
	if err != nil {
		return r, err
	}
	if err = catalog.RemoveCart(ctx, tx, user, p.ID); err != nil {
		return r, err
	}
	r = Receipt{OrderID: o.ID, Action: "placed", Charged: p.Price, BuyerBalance: balance, OccurredAt: now, Snapshot: o.Snapshot}
	r.SellerBalance, err = points.Balance(ctx, tx, p.OwnerID)
	if err != nil {
		return r, err
	}
	return r, record(ctx, tx, couple, user, "placed", o, r, now)
}

func Apply(ctx context.Context, tx *sql.Tx, couple, user, id, action string, now time.Time) (Receipt, error) {
	var r Receipt
	o, err := Get(ctx, tx, couple, user, id)
	if err != nil {
		return r, err
	}
	roleActions := map[string]string{"accept": "seller", "reject": "seller", "fulfill": "seller", "approve_cancel": "seller", "deny_cancel": "seller", "confirm": "buyer", "reject_fulfillment": "buyer", "request_cancel": "buyer", "cancel": "either"}
	role, known := roleActions[action]
	if !known {
		return r, platform.Fail(422, "INVALID_ACTION", "订单操作无效")
	}
	if role == "seller" && user != o.SellerID || role == "buyer" && user != o.BuyerID {
		return r, platform.Fail(403, "FORBIDDEN", "只有订单的另一方可以执行这项操作")
	}
	permitted := false
	for _, a := range o.AllowedActions {
		if a == action {
			permitted = true
		}
	}
	if !permitted {
		return r, platform.Fail(409, "ORDER_STATE_CHANGED", "当前订单不能执行此操作，请刷新状态")
	}
	r = Receipt{OrderID: o.ID, Action: action, OccurredAt: now, Snapshot: o.Snapshot}
	switch action {
	case "accept":
		o.Status = Fulfilling
	case "reject":
		o.Status = Rejected
		o.EndedReason = "rejected"
		r.Refunded = o.Snapshot.Price
	case "fulfill":
		o.Status = Awaiting
		at := now.Add(72 * time.Hour)
		o.AutoConfirmAt = &at
	case "confirm":
		o.Status = Completed
		o.EndedReason = "confirmed"
		o.AutoConfirmAt = nil
	case "reject_fulfillment":
		o.Status = Fulfilling
		o.AutoConfirmAt = nil
	case "request_cancel":
		o.CancelPending = true
		o.AutoConfirmAt = nil
	case "deny_cancel":
		o.CancelPending = false
		if o.Status == Awaiting {
			at := now.Add(72 * time.Hour)
			o.AutoConfirmAt = &at
		}
	case "approve_cancel":
		o.Status = Cancelled
		o.EndedReason = "cancel_approved"
		r.Refunded = o.Snapshot.Price
	case "cancel":
		o.Status = Cancelled
		r.Refunded = o.Snapshot.Price
		o.EndedReason = "buyer_cancelled"
		if user == o.SellerID {
			o.EndedReason = "seller_cancelled"
			r.Penalty = (o.Snapshot.Price + 1) / 2
		}
	}
	if o.Status == Cancelled || o.Status == Rejected {
		o.CancelPending = false
		o.AutoConfirmAt = nil
		o.Refunded = r.Refunded
		o.Penalty = r.Penalty
		if _, err = points.ChangeAccount(ctx, tx, o.BuyerID, o.ID, "order_refund", r.Refunded, now); err != nil {
			return r, err
		}
		if err = catalog.ChangeStock(ctx, tx, o.ProductID, 1, now); err != nil {
			return r, err
		}
		// Record zero penalties too: a zero-price accepted order still follows the same lifecycle.
		if o.EndedReason == "seller_cancelled" {
			if _, err = points.ChangeAccount(ctx, tx, o.SellerID, o.ID, "order_penalty", -r.Penalty, now); err != nil {
				return r, err
			}
			if err = points.CreditPool(ctx, tx, couple, o.SellerID, "order_cancel_penalty", r.Penalty, now); err != nil {
				return r, err
			}
		}
	}
	o.UpdatedAt = now
	if err = save(ctx, tx, o, now); err != nil {
		return r, err
	}
	r.BuyerBalance, err = points.Balance(ctx, tx, o.BuyerID)
	if err != nil {
		return r, err
	}
	r.SellerBalance, err = points.Balance(ctx, tx, o.SellerID)
	if err != nil {
		return r, err
	}
	return r, record(ctx, tx, couple, user, action, o, r, now)
}
func save(ctx context.Context, tx *sql.Tx, o Order, now time.Time) error {
	_, err := tx.ExecContext(ctx, "UPDATE orders SET status=?,cancel_pending=?,auto_confirm_at=?,refunded=?,penalty=?,ended_reason=?,updated_at=? WHERE id=?", o.Status, o.CancelPending, o.AutoConfirmAt, o.Refunded, o.Penalty, o.EndedReason, now, o.ID)
	return err
}
func record(ctx context.Context, tx *sql.Tx, couple, user, action string, o Order, r Receipt, processed time.Time) error {
	var actor any
	if user != "" {
		actor = user
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO order_history(order_id,actor_id,action,occurred_at,processed_at) VALUES (?,?,?,?,?)", o.ID, actor, action, r.OccurredAt, processed); err != nil {
		return err
	}
	o.AllowedActions = nil
	return eventbus.Save(ctx, tx, couple, user, "OrderChanged", map[string]any{"order": o, "result": r}, r.OccurredAt)
}

// Caller holds the relationship lock. Auto-completion commits independently of the next user request.
func SettleDue(ctx context.Context, tx *sql.Tx, couple string, now time.Time) (int, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+columns+" FROM orders WHERE couple_id=? AND status=? AND cancel_pending=FALSE AND auto_confirm_at<=? ORDER BY auto_confirm_at,id", couple, Awaiting, now)
	if err != nil {
		return 0, err
	}
	due := []Order{}
	for rows.Next() {
		o, err := scan(rows)
		if err != nil {
			rows.Close()
			return 0, err
		}
		due = append(due, o)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	for _, o := range due {
		effective := *o.AutoConfirmAt
		o.Status = Completed
		o.AutoConfirmAt = nil
		o.EndedReason = "auto_confirmed"
		o.UpdatedAt = effective
		if err = save(ctx, tx, o, effective); err != nil {
			return 0, err
		}
		r := Receipt{OrderID: o.ID, Action: "auto_confirm", OccurredAt: effective, Snapshot: o.Snapshot}
		if err = record(ctx, tx, couple, "", "auto_confirm", o, r, now); err != nil {
			return 0, err
		}
	}
	return len(due), nil
}

type Page struct {
	Items      []Order `json:"items"`
	NextCursor string  `json:"nextCursor"`
}

func List(ctx context.Context, tx *sql.Tx, couple, user, role, status, cursor string) (Page, error) {
	out := Page{Items: []Order{}}
	if role != "buyer" && role != "seller" {
		return out, platform.Fail(422, "INVALID_FILTER", "请选择我下的单或我收到的")
	}
	if status != "" && status != Pending && status != Fulfilling && status != Awaiting && status != Completed && status != Rejected && status != Cancelled {
		return out, platform.Fail(422, "INVALID_FILTER", "订单状态无效")
	}
	query := "SELECT " + columns + " FROM orders WHERE couple_id=? AND " + role + "_id=?"
	args := []any{couple, user}
	if status != "" {
		query += " AND status=?"
		args = append(args, status)
	}
	if cursor != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(cursor)
		parts := strings.Split(string(decoded), "|")
		if err != nil || len(parts) != 2 || len(parts[1]) != 32 {
			return out, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
		}
		at, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return out, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
		}
		query += " AND (created_at<? OR (created_at=? AND id<?))"
		args = append(args, at, at, parts[1])
	}
	rows, err := tx.QueryContext(ctx, query+" ORDER BY created_at DESC,id DESC LIMIT 51", args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		o, err := scan(rows)
		if err != nil {
			return out, err
		}
		o.AllowedActions = Actions(o, user)
		out.Items = append(out.Items, o)
	}
	if err = rows.Err(); err != nil {
		return out, err
	}
	if len(out.Items) > 50 {
		out.Items = out.Items[:50]
		last := out.Items[49]
		out.NextCursor = base64.RawURLEncoding.EncodeToString([]byte(last.CreatedAt.Format(time.RFC3339Nano) + "|" + last.ID))
	}
	return out, nil
}
func Todos(ctx context.Context, tx *sql.Tx, couple, user string) ([]Order, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+columns+" FROM orders WHERE couple_id=? AND status IN (?,?,?) ORDER BY created_at,id", couple, Pending, Fulfilling, Awaiting)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Order{}
	for rows.Next() {
		o, err := scan(rows)
		if err != nil {
			return nil, err
		}
		o.AllowedActions = Actions(o, user)
		needsAction := user == o.SellerID && (o.Status == Pending || o.Status == Fulfilling || o.CancelPending) || user == o.BuyerID && o.Status == Awaiting && !o.CancelPending
		if needsAction {
			out = append(out, o)
		}
	}
	return out, rows.Err()
}
