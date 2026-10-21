package tasks

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/points"
)

type Cancellation struct {
	ID          string    `json:"id"`
	RequesterID string    `json:"requesterId"`
	CreatedAt   time.Time `json:"createdAt"`
}
type Task struct {
	ID                 string        `json:"id"`
	Kind               string        `json:"kind"`
	CreatorID          string        `json:"creatorId"`
	PartnerID          string        `json:"partnerId"`
	Name               string        `json:"name"`
	Description        string        `json:"description"`
	Reward             int64         `json:"reward"`
	Status             string        `json:"status"`
	Deadline           *time.Time    `json:"deadline"`
	CorrectionDeadline *time.Time    `json:"correctionDeadline"`
	SubmittedBy        *string       `json:"submittedBy"`
	CreatedAt          time.Time     `json:"createdAt"`
	UpdatedAt          time.Time     `json:"updatedAt"`
	Reserved           int64         `json:"reserved"`
	Cancel             *Cancellation `json:"cancelRequest"`
	EffectiveDeadline  *time.Time    `json:"effectiveDeadline"`
	AllowedActions     []string      `json:"allowedActions"`
}
type Input struct {
	Kind        string  `json:"kind"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Reward      string  `json:"reward"`
	Deadline    *string `json:"deadline"`
}
type Action struct {
	Action             string  `json:"action"`
	CorrectionDeadline *string `json:"correctionDeadline"`
	CancelRequestID    string  `json:"cancelRequestId"`
}
type Receipt struct {
	TaskID         string         `json:"taskId"`
	Action         string         `json:"action"`
	Name           string         `json:"name"`
	Reward         int64          `json:"reward"`
	Reserved       int64          `json:"reserved"`
	Released       int64          `json:"released"`
	Penalty        int64          `json:"penalty"`
	PenaltyBalance *int64         `json:"penaltyBalance,omitempty"`
	Awards         []points.Award `json:"awards"`
	OccurredAt     time.Time      `json:"occurredAt"`
}
type History struct {
	ID         string          `json:"id"`
	ActorID    *string         `json:"actorId"`
	Action     string          `json:"action"`
	OccurredAt time.Time       `json:"occurredAt"`
	Result     json.RawMessage `json:"result"`
}

const fromTables = " FROM tasks t JOIN task_reservations r ON r.task_id=t.id LEFT JOIN task_cancellations c ON c.task_id=t.id AND c.status='pending' "
const columns = "t.id,t.kind,t.creator_id,t.partner_id,t.name,t.description,t.reward,t.status,t.deadline,t.correction_deadline,t.submitted_by,t.created_at,t.updated_at,r.amount,c.id,c.requester_id,c.created_at"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Task, error) {
	var t Task
	var cid, requester *string
	var created *time.Time
	err := row.Scan(&t.ID, &t.Kind, &t.CreatorID, &t.PartnerID, &t.Name, &t.Description, &t.Reward, &t.Status, &t.Deadline, &t.CorrectionDeadline, &t.SubmittedBy, &t.CreatedAt, &t.UpdatedAt, &t.Reserved, &cid, &requester, &created)
	if cid != nil {
		t.Cancel = &Cancellation{*cid, *requester, *created}
	}
	t.EffectiveDeadline = t.Deadline
	if t.CorrectionDeadline != nil {
		t.EffectiveDeadline = t.CorrectionDeadline
	}
	return t, err
}
func Active(status string) bool {
	return status == "pending" || status == "active" || status == "awaiting"
}
func Actions(t Task, user string) []string {
	out := []string{}
	if !Active(t.Status) {
		return out
	}
	switch t.Status {
	case "pending":
		if user == t.CreatorID {
			out = append(out, "edit")
		} else {
			out = append(out, "accept", "reject_accept")
		}
	case "active":
		if t.Kind == "joint" || user == t.PartnerID {
			out = append(out, "submit")
		}
	case "awaiting":
		if t.SubmittedBy != nil && *t.SubmittedBy != user {
			out = append(out, "confirm", "reject_completion")
		}
	}
	if t.Cancel == nil {
		out = append(out, "request_cancel")
	} else if t.Cancel.RequesterID != user {
		out = append(out, "approve_cancel", "deny_cancel")
	}
	return out
}
func NeedsAction(t Task, user string) bool {
	if !Active(t.Status) {
		return false
	}
	return t.Cancel != nil && t.Cancel.RequesterID != user || t.Status == "pending" && t.PartnerID == user || t.Status == "active" && (t.Kind == "joint" || t.PartnerID == user) || t.Status == "awaiting" && t.SubmittedBy != nil && *t.SubmittedBy != user
}
func Get(ctx context.Context, tx *sql.Tx, couple, user, id string) (Task, error) {
	t, err := scan(tx.QueryRowContext(ctx, "SELECT "+columns+fromTables+" WHERE t.id=? AND t.couple_id=? AND (t.creator_id=? OR t.partner_id=?)", id, couple, user, user))
	if err == sql.ErrNoRows {
		return t, platform.Fail(404, "NOT_FOUND", "任务不存在或无权查看")
	}
	t.AllowedActions = Actions(t, user)
	return t, err
}
func Future(raw *string, now time.Time) (*time.Time, error) {
	if raw == nil {
		return nil, platform.Fail(422, "INVALID_DEADLINE", "请选择未来的北京时间截止时刻")
	}
	at, err := time.Parse(time.RFC3339Nano, *raw)
	if err != nil {
		return nil, platform.Fail(422, "INVALID_DEADLINE", "截止时间须包含明确时区")
	}
	at = at.UTC().Truncate(time.Microsecond)
	if !at.After(now) {
		return nil, platform.Fail(422, "INVALID_DEADLINE", "截止时间必须晚于当前服务端时间")
	}
	return &at, nil
}
func Save(ctx context.Context, tx *sql.Tx, couple, user, partner, id string, in Input, now time.Time) (Receipt, error) {
	r := Receipt{Action: "created", OccurredAt: now, Awards: []points.Award{}}
	if in.Kind != "partner" && in.Kind != "joint" {
		return r, platform.Fail(422, "INVALID_TASK_TYPE", "请选择共同任务或伴侣任务")
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || utf8.RuneCountInString(name) > 80 || utf8.RuneCountInString(in.Description) > 2000 {
		return r, platform.Fail(422, "INVALID_TASK", "任务名称须为 1–80 字，说明最多 2000 字")
	}
	reward, err := points.Parse(in.Reward)
	if err != nil {
		return r, err
	}
	var deadline *time.Time
	if in.Kind == "partner" {
		deadline, err = Future(in.Deadline, now)
		if err != nil {
			return r, err
		}
	} else if in.Deadline != nil {
		return r, platform.Fail(422, "INVALID_DEADLINE", "共同任务不限时")
	}
	if id == "" {
		id = platform.ID()
		if _, err = tx.ExecContext(ctx, "INSERT INTO tasks(id,couple_id,kind,creator_id,partner_id,name,description,reward,status,deadline,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'pending',?,?,?)", id, couple, in.Kind, user, partner, name, in.Description, reward, deadline, now, now); err != nil {
			return r, err
		}
	} else {
		t, err := Get(ctx, tx, couple, user, id)
		if err != nil {
			return r, err
		}
		if t.CreatorID != user {
			return r, platform.Fail(403, "FORBIDDEN", "只有发布方可以编辑任务")
		}
		if t.Status != "pending" {
			return r, platform.Fail(409, "TASK_STATE_CHANGED", "仅接受前可以修改约定")
		}
		if t.Kind != in.Kind {
			return r, platform.Fail(422, "TASK_TYPE_LOCKED", "编辑仅修改内容、奖励和截止时间")
		}
		sameDeadline := deadline == nil && t.Deadline == nil || deadline != nil && t.Deadline != nil && deadline.Equal(*t.Deadline)
		if t.Name == name && t.Description == in.Description && t.Reward == reward && sameDeadline {
			return Receipt{TaskID: id, Action: "unchanged", Name: t.Name, Reward: t.Reward, Reserved: t.Reserved, OccurredAt: now, Awards: []points.Award{}}, nil
		}
		r.Action = "edited"
		if _, err = tx.ExecContext(ctx, "UPDATE tasks SET name=?,description=?,reward=?,deadline=?,updated_at=? WHERE id=?", name, in.Description, reward, deadline, now, id); err != nil {
			return r, err
		}
	}
	reserved := reward
	if in.Kind == "joint" {
		reserved *= 2
	}
	if err = points.ReserveTask(ctx, tx, couple, id, reserved, now); err != nil {
		return r, err
	}
	t, err := Get(ctx, tx, couple, user, id)
	if err != nil {
		return r, err
	}
	r.TaskID = id
	r.Name = name
	r.Reward = reward
	r.Reserved = reserved
	return r, record(ctx, tx, couple, user, t, r, now)
}
func recipients(t Task) []string {
	if t.Kind == "joint" {
		return []string{t.CreatorID, t.PartnerID}
	}
	return []string{t.PartnerID}
}
func Preview(ctx context.Context, tx *sql.Tx, t Task, limit int64, now time.Time) ([]points.Award, error) {
	return points.TaskPreview(ctx, tx, recipients(t), t.Reward, limit, now)
}
func Apply(ctx context.Context, tx *sql.Tx, couple, user, id string, action Action, limit int64, now time.Time) (Receipt, error) {
	r := Receipt{TaskID: id, Action: action.Action, OccurredAt: now, Awards: []points.Award{}}
	t, err := Get(ctx, tx, couple, user, id)
	if err != nil {
		return r, err
	}
	r.Name = t.Name
	r.Reward = t.Reward
	r.Reserved = t.Reserved
	allowed := false
	for _, name := range t.AllowedActions {
		if name == action.Action && name != "edit" {
			allowed = true
		}
	}
	if !allowed {
		return r, platform.Fail(409, "TASK_STATE_CHANGED", "当前角色或任务阶段不能执行此操作，请刷新")
	}
	switch action.Action {
	case "accept":
		t.Status = "active"
	case "reject_accept":
		t.Status = "rejected"
	case "submit":
		t.Status = "awaiting"
		t.SubmittedBy = &user
	case "confirm":
		r.Awards, r.Released, err = points.SettleTask(ctx, tx, couple, id, user, recipients(t), t.Reward, limit, now)
		if err != nil {
			return r, err
		}
		t.Status = "completed"
	case "reject_completion":
		if t.Kind == "partner" {
			t.CorrectionDeadline, err = Future(action.CorrectionDeadline, now)
			if err != nil {
				return r, err
			}
		} else if action.CorrectionDeadline != nil {
			return r, platform.Fail(422, "INVALID_DEADLINE", "共同任务驳回后仍不限时")
		}
		t.Status = "active"
		t.SubmittedBy = nil
	case "request_cancel":
		if _, err = tx.ExecContext(ctx, "INSERT INTO task_cancellations(id,task_id,requester_id,status,created_at) VALUES (?,?,?,'pending',?)", platform.ID(), id, user, now); err != nil {
			return r, err
		}
	case "approve_cancel", "deny_cancel":
		if t.Cancel == nil || action.CancelRequestID != t.Cancel.ID {
			return r, platform.Fail(409, "CANCEL_REQUEST_CHANGED", "这份取消申请已处理或变化，请刷新")
		}
		status := "denied"
		if action.Action == "approve_cancel" {
			status = "approved"
			t.Status = "cancelled"
		}
		if _, err = tx.ExecContext(ctx, "UPDATE task_cancellations SET status=?,decided_at=? WHERE id=?", status, now, t.Cancel.ID); err != nil {
			return r, err
		}
	}
	if t.Status == "rejected" || t.Status == "cancelled" {
		r.Released, err = points.ReleaseTask(ctx, tx, couple, id, now)
		if err != nil {
			return r, err
		}
	}
	if !Active(t.Status) {
		r.Reserved = 0
		if err = voidCancellation(ctx, tx, id, now); err != nil {
			return r, err
		}
	}
	if err = save(ctx, tx, t, now); err != nil {
		return r, err
	}
	current, err := Get(ctx, tx, couple, user, id)
	if err != nil {
		return r, err
	}
	return r, record(ctx, tx, couple, user, current, r, now)
}
func save(ctx context.Context, tx *sql.Tx, t Task, now time.Time) error {
	_, err := tx.ExecContext(ctx, "UPDATE tasks SET status=?,correction_deadline=?,submitted_by=?,updated_at=? WHERE id=?", t.Status, t.CorrectionDeadline, t.SubmittedBy, now, t.ID)
	return err
}
func voidCancellation(ctx context.Context, tx *sql.Tx, id string, now time.Time) error {
	_, err := tx.ExecContext(ctx, "UPDATE task_cancellations SET status='void',decided_at=? WHERE task_id=? AND status='pending'", now, id)
	return err
}
func record(ctx context.Context, tx *sql.Tx, couple, user string, t Task, r Receipt, processed time.Time) error {
	data, err := json.Marshal(r)
	if err != nil {
		return err
	}
	var actor any
	if user != "" {
		actor = user
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO task_history(task_id,actor_id,action,occurred_at,processed_at,result) VALUES (?,?,?,?,?,?)", t.ID, actor, r.Action, r.OccurredAt, processed, data); err != nil {
		return err
	}
	t.AllowedActions = nil
	return eventbus.Save(ctx, tx, couple, user, "TaskChanged", map[string]any{"task": t, "result": r}, r.OccurredAt)
}
func Timeline(ctx context.Context, tx *sql.Tx, id string) ([]History, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,actor_id,action,occurred_at,result FROM task_history WHERE task_id=? ORDER BY id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []History{}
	for rows.Next() {
		var h History
		var n int64
		if err = rows.Scan(&n, &h.ActorID, &h.Action, &h.OccurredAt, &h.Result); err != nil {
			return nil, err
		}
		h.ID = strconv.FormatInt(n, 10)
		out = append(out, h)
	}
	return out, rows.Err()
}
func SettleDue(ctx context.Context, tx *sql.Tx, couple string, now time.Time) (int, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+columns+fromTables+" WHERE t.couple_id=? AND t.kind='partner' AND t.status IN ('pending','active') AND COALESCE(t.correction_deadline,t.deadline)<=? ORDER BY COALESCE(t.correction_deadline,t.deadline),t.id", couple, now)
	if err != nil {
		return 0, err
	}
	due := []Task{}
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			rows.Close()
			return 0, err
		}
		due = append(due, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	for _, t := range due {
		effective := *t.EffectiveDeadline
		r := Receipt{TaskID: t.ID, Name: t.Name, Reward: t.Reward, OccurredAt: effective, Awards: []points.Award{}}
		r.Released, err = points.ReleaseTask(ctx, tx, couple, t.ID, effective)
		if err != nil {
			return 0, err
		}
		r.Action = "expired"
		if t.Status == "active" {
			r.Action = "timed_out"
			r.Penalty = (t.Reward + 1) / 2
			penaltyBalance, accountErr := points.TaskAccount(ctx, tx, t.PartnerID, t.ID, "task_timeout", -r.Penalty, effective)
			if accountErr != nil {
				return 0, accountErr
			}
			r.PenaltyBalance = &penaltyBalance
			if err = points.TaskPenaltyPool(ctx, tx, couple, t.PartnerID, t.ID, r.Penalty, effective); err != nil {
				return 0, err
			}
		}
		t.Status = r.Action
		t.Reserved = 0
		t.Cancel = nil
		t.UpdatedAt = effective
		if err = voidCancellation(ctx, tx, t.ID, effective); err != nil {
			return 0, err
		}
		if err = save(ctx, tx, t, effective); err != nil {
			return 0, err
		}
		if err = record(ctx, tx, couple, "", t, r, now); err != nil {
			return 0, err
		}
	}
	return len(due), nil
}

type Page struct {
	Items      []Task `json:"items"`
	NextCursor string `json:"nextCursor"`
}

func List(ctx context.Context, tx *sql.Tx, couple, user, kind, filter, cursor string) (Page, error) {
	out := Page{Items: []Task{}}
	if kind != "joint" && kind != "partner" {
		return out, platform.Fail(422, "INVALID_FILTER", "任务类型无效")
	}
	query := "SELECT " + columns + fromTables + " WHERE t.couple_id=? AND t.kind=?"
	args := []any{couple, kind}
	switch filter {
	case "active":
		query += " AND t.status IN ('pending','active','awaiting')"
	case "history":
		query += " AND t.status NOT IN ('pending','active','awaiting')"
	case "todo":
		query += " AND t.status IN ('pending','active','awaiting') AND ((t.status='pending' AND t.partner_id=?) OR (t.status='active' AND (t.kind='joint' OR t.partner_id=?)) OR (t.status='awaiting' AND t.submitted_by<>?) OR (c.id IS NOT NULL AND c.requester_id<>?))"
		args = append(args, user, user, user, user)
	default:
		return out, platform.Fail(422, "INVALID_FILTER", "任务筛选无效")
	}
	if cursor != "" {
		data, err := base64.RawURLEncoding.DecodeString(cursor)
		parts := strings.Split(string(data), "|")
		if err != nil || len(parts) != 2 || len(parts[1]) != 32 {
			return out, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
		}
		at, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return out, platform.Fail(422, "INVALID_CURSOR", "分页位置无效")
		}
		query += " AND (t.created_at<? OR (t.created_at=? AND t.id<?))"
		args = append(args, at, at, parts[1])
	}
	rows, err := tx.QueryContext(ctx, query+" ORDER BY t.created_at DESC,t.id DESC LIMIT 51", args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return out, err
		}
		t.AllowedActions = Actions(t, user)
		out.Items = append(out.Items, t)
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
func Todos(ctx context.Context, tx *sql.Tx, couple, user string) ([]Task, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+columns+fromTables+" WHERE t.couple_id=? AND t.status IN ('pending','active','awaiting') ORDER BY t.created_at,t.id", couple)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}
		if NeedsAction(t, user) {
			t.AllowedActions = Actions(t, user)
			out = append(out, t)
		}
	}
	return out, rows.Err()
}
