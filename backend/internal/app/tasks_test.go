package app

import (
	"bytes"
	"context"
	"couple-mini/backend/internal/platform"
	"image"
	"image/png"
	"strconv"
	"sync"
	"time"
)

func testTasksAndGifts(f *fixture, creator, partner, outsider, couple string) {
	t := f.t
	db := f.server.DB
	cID := f.must(creator, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	pID := f.must(partner, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	activate := func(limit string) {
		id := f.must(creator, "POST", "/rules", map[string]string{"dailyLimit": limit})["id"].(string)
		f.must(partner, "POST", "/rules/"+id+"/confirm", map[string]any{})
	}
	pool := func() (int64, int64) {
		var available, reserved int64
		if err := db.QueryRow("SELECT available,reserved FROM pools WHERE couple_id=?", couple).Scan(&available, &reserved); err != nil {
			t.Fatal(err)
		}
		return available, reserved
	}
	balance := func(user string) int64 {
		var n int64
		if err := db.QueryRow("SELECT balance FROM accounts WHERE user_id=?", user).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	create := func(kind, reward string, deadline *time.Time) map[string]any {
		in := map[string]any{"kind": kind, "name": "测试约定", "description": "双方确认后再开始", "reward": reward}
		if deadline != nil {
			in["deadline"] = deadline.Format(time.RFC3339Nano)
		}
		return f.must(creator, "POST", "/tasks", in)
	}
	detail := func(token, id string) map[string]any {
		return f.must(token, "GET", "/tasks/"+id, nil)["task"].(map[string]any)
	}
	act := func(token, id, action string, extra map[string]any) map[string]any {
		in := map[string]any{"action": action}
		for k, v := range extra {
			in[k] = v
		}
		return f.must(token, "POST", "/tasks/"+id+"/actions", in)
	}
	gift := func(token, amount, key string) result {
		return f.call(token, "POST", "/gifts", key, map[string]string{"amount": amount})
	}
	nextDay := func() {
		now := f.server.Now().In(platform.Beijing)
		f.clock.Store(time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, platform.Beijing).UnixNano())
	}
	// Commerce seeded no task awards; use a fresh Beijing date for shared caps and gifting counts.
	nextDay()
	activate("103")
	if f.must(creator, "GET", "/gifts/preview", nil)["singleMax"] != float64(21) {
		t.Fatal("103-point rule must allow a 21-point gift")
	}
	activate("100")
	p0, r0 := pool()
	if r0 != 0 {
		t.Fatal("unexpected reservation")
	}
	f.error(gift(creator, "-0.1", platform.ID()), 422, "INVALID_POINTS")
	f.error(gift(creator, "21", platform.ID()), 422, "GIFT_LIMIT")
	key := platform.ID()
	first := gift(creator, "20", key)
	if first.status != 200 {
		t.Fatal(first.raw)
	}
	replay := gift(creator, "20", key)
	if replay.status != 200 || replay.body["id"] != first.body["id"] {
		t.Fatal("gift replay counted twice")
	}
	for i := 0; i < 2; i++ {
		if r := gift(creator, "20", platform.ID()); r.status != 200 {
			t.Fatal(r.raw)
		}
	}
	f.error(gift(creator, "0", platform.ID()), 409, "GIFT_COUNT_LIMIT")
	if current, _ := pool(); current != p0 {
		t.Fatal("gift changed shared pool")
	}
	joint := create("joint", "50", nil)["taskId"].(string)
	a, r := pool()
	if a != p0-100 || r != 100 {
		t.Fatalf("reserve: %d %d", a, r)
	}
	f.error(f.call(creator, "POST", "/tasks/"+joint+"/actions", platform.ID(), map[string]string{"action": "accept"}), 409, "TASK_STATE_CHANGED")
	f.error(f.call(outsider, "GET", "/tasks/"+joint, "", nil), 403, "BINDING_REQUIRED")
	act(partner, joint, "accept", nil)
	act(creator, joint, "submit", nil)
	f.error(f.call(creator, "POST", "/tasks/"+joint+"/actions", platform.ID(), map[string]string{"action": "confirm"}), 409, "TASK_STATE_CHANGED")
	completed := act(partner, joint, "confirm", nil)
	awards := completed["awards"].([]any)
	if awards[0].(map[string]any)["actual"] != float64(50) || awards[1].(map[string]any)["actual"] != float64(40) || completed["released"] != float64(10) {
		t.Fatal(completed)
	}
	a, r = pool()
	if a != p0-90 || r != 0 {
		t.Fatal("over-cap task points did not return to available")
	}
	for i := 0; i < 3; i++ {
		g := gift(partner, "20", platform.ID())
		if g.status != 200 {
			t.Fatal(g.raw)
		}
		if i == 2 && (g.body["actual"] != float64(10) || g.body["discarded"] != float64(10)) {
			t.Fatal(g.raw)
		}
	}
	if current, _ := pool(); current != a {
		t.Fatal("gift excess entered pool")
	}
	var earned int64
	if err := db.QueryRow("SELECT earned FROM daily_points WHERE user_id=? AND business_date=?", cID, platform.Date(f.server.Now())).Scan(&earned); err != nil || earned != 100 {
		t.Fatal("task and gift must share one daily earning cap", earned, err)
	}
	// Editing reserves only the difference and cannot overwrite accepted tasks.
	editable := create("joint", "10", nil)["taskId"].(string)
	before, _ := pool()
	input := map[string]any{"kind": "joint", "name": "修改约定", "description": "修改奖励", "reward": "15"}
	f.must(creator, "POST", "/tasks/"+editable, input)
	after, reserved := pool()
	if after != before-10 || reserved != 30 {
		t.Fatal("edit reserved full amount twice")
	}
	if f.must(creator, "POST", "/tasks/"+editable, input)["action"] != "unchanged" {
		t.Fatal("unchanged edit emitted a new mutation")
	}
	input["reward"] = strconv.FormatInt(p0+1, 10)
	f.error(f.call(creator, "POST", "/tasks/"+editable, platform.ID(), input), 409, "INSUFFICIENT_POOL")
	if detail(creator, editable)["reward"] != float64(15) {
		t.Fatal("failed edit changed task")
	}
	input["reward"] = "5"
	f.must(creator, "POST", "/tasks/"+editable, input)
	act(partner, editable, "accept", nil)
	f.error(f.call(creator, "POST", "/tasks/"+editable, platform.ID(), input), 409, "TASK_STATE_CHANGED")
	// A cancellation request does not freeze submission; rejecting it preserves the latest stage.
	act(creator, editable, "request_cancel", nil)
	request := detail(creator, editable)["cancelRequest"].(map[string]any)["id"].(string)
	act(partner, editable, "submit", nil)
	act(partner, editable, "deny_cancel", map[string]any{"cancelRequestId": request})
	if detail(creator, editable)["status"] != "awaiting" {
		t.Fatal("denying cancellation restored stale stage")
	}
	final := act(creator, editable, "confirm", nil)
	if final["released"] != float64(10) {
		t.Fatal("exhausted caps should release full reservation")
	}
	for _, a := range final["awards"].([]any) {
		if a.(map[string]any)["actual"] != float64(0) {
			t.Fatal("daily cap exceeded")
		}
	}
	// Unaccepted deadlines release budget without any penalty.
	deadline := f.server.Now().Add(time.Minute)
	unaccepted := create("partner", "21", &deadline)["taskId"].(string)
	oldBalance := balance(pID)
	f.clock.Store(deadline.UnixNano())
	f.error(f.call(partner, "POST", "/tasks/"+unaccepted+"/actions", platform.ID(), map[string]string{"action": "accept"}), 409, "TASK_STATE_CHANGED")
	if detail(creator, unaccepted)["status"] != "expired" || balance(pID) != oldBalance {
		t.Fatal("unaccepted expiry penalized executor")
	}
	// Accepted timeout must commit before a failing FREE order and invalidate its pending cancellation.
	reward := 2*balance(pID) + 1
	if reward < 1 {
		reward = 21
	}
	available, _ := pool()
	if reward > available {
		t.Fatal("fixture budget unexpectedly low")
	}
	deadline = f.server.Now().Add(time.Minute)
	late := create("partner", strconv.FormatInt(reward, 10), &deadline)["taskId"].(string)
	act(partner, late, "accept", nil)
	act(creator, late, "request_cancel", nil)
	request = detail(creator, late)["cancelRequest"].(map[string]any)["id"].(string)
	var imageData bytes.Buffer
	png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 3, 3)))
	file := f.upload(creator, imageData.Bytes())
	if file.status != 200 {
		t.Fatal(file.raw)
	}
	free := f.must(creator, "POST", "/products", map[string]any{"name": "超时后免费单", "description": "检查负余额门禁", "price": "0", "stock": 1, "coverId": file.body["fileId"]})["id"].(string)
	f.clock.Store(deadline.Add(30 * time.Second).UnixNano())
	f.error(f.call(partner, "POST", "/orders", platform.ID(), map[string]string{"productId": free, "confirmedPrice": "0"}), 409, "NEGATIVE_BALANCE")
	if detail(creator, late)["status"] != "timed_out" || detail(creator, late)["cancelRequest"] != nil || balance(pID) >= 0 {
		t.Fatal("failed order rolled back overdue penalty")
	}
	f.error(f.call(partner, "POST", "/tasks/"+late+"/actions", platform.ID(), map[string]any{"action": "approve_cancel", "cancelRequestId": request}), 409, "TASK_STATE_CHANGED")
	var occurred time.Time
	db.QueryRow("SELECT created_at FROM account_ledger WHERE task_id=? AND reason='task_timeout'", late).Scan(&occurred)
	if !occurred.Equal(deadline) {
		t.Fatal("timeout took processing time instead of deadline")
	}
	if err := f.server.SettleDue(context.Background()); err != nil {
		t.Fatal(err)
	}
	var count int
	db.QueryRow("SELECT COUNT(*) FROM account_ledger WHERE task_id=? AND reason='task_timeout'", late).Scan(&count)
	if count != 1 {
		t.Fatal("duplicate penalty")
	}
	// Submission freezes timeout, while rejection requires a new future correction deadline.
	deadline = f.server.Now().Add(time.Hour)
	correction := create("partner", "41", &deadline)["taskId"].(string)
	act(partner, correction, "accept", nil)
	act(partner, correction, "submit", nil)
	f.clock.Store(deadline.Add(time.Hour).UnixNano())
	if detail(creator, correction)["status"] != "awaiting" {
		t.Fatal("awaiting confirmation timed out")
	}
	act(partner, correction, "request_cancel", nil)
	request = detail(creator, correction)["cancelRequest"].(map[string]any)["id"].(string)
	f.error(f.call(creator, "POST", "/tasks/"+correction+"/actions", platform.ID(), map[string]string{"action": "reject_completion"}), 422, "INVALID_DEADLINE")
	newDeadline := f.server.Now().Add(time.Minute)
	act(creator, correction, "reject_completion", map[string]any{"correctionDeadline": newDeadline.Format(time.RFC3339)})
	act(creator, correction, "deny_cancel", map[string]any{"cancelRequestId": request})
	if detail(creator, correction)["effectiveDeadline"] != newDeadline.Format(time.RFC3339) {
		t.Fatal("cancellation rejection restored old deadline")
	}
	oldBalance = balance(pID)
	f.clock.Store(newDeadline.UnixNano())
	if err := f.server.SettleDue(context.Background()); err != nil {
		t.Fatal(err)
	}
	if detail(creator, correction)["status"] != "timed_out" || balance(pID) != oldBalance-21 {
		t.Fatal("41-point timeout must penalize 21")
	}
	// Only one completion/cancellation terminal outcome wins a race.
	deadline = f.server.Now().Add(time.Hour)
	race := create("partner", "20", &deadline)["taskId"].(string)
	act(partner, race, "accept", nil)
	act(creator, race, "request_cancel", nil)
	request = detail(creator, race)["cancelRequest"].(map[string]any)["id"].(string)
	act(partner, race, "submit", nil)
	results := make(chan result, 2)
	var wg sync.WaitGroup
	for _, name := range []string{"confirm", "approve_cancel"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			actor := creator
			if name == "approve_cancel" {
				actor = partner
			}
			results <- f.call(actor, "POST", "/tasks/"+race+"/actions", platform.ID(), map[string]any{"action": name, "cancelRequestId": request})
		}(name)
	}
	wg.Wait()
	close(results)
	won := 0
	for r := range results {
		if r.status == 200 {
			won++
		} else {
			f.error(r, 409, "TASK_STATE_CHANGED")
		}
	}
	if won != 1 {
		t.Fatal("multiple terminal transitions")
	}
	// Zero pool and zero rules are valid; zero gifts count, and midnight provides new independent counters.
	for _, limit := range []string{"0", "1", "2"} {
		nextDay()
		activate(limit)
		preview := f.must(creator, "GET", "/gifts/preview", nil)
		if preview["singleMax"] != float64(0) || preview["sendsRemaining"] != float64(3) {
			t.Fatal(preview)
		}
		results = make(chan result, 4)
		for i := 0; i < 4; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); results <- gift(creator, "0", platform.ID()) }()
		}
		wg.Wait()
		close(results)
		won = 0
		for r := range results {
			if r.status == 200 {
				won++
				if r.body["actual"] != float64(0) {
					t.Fatal(r.raw)
				}
			} else {
				f.error(r, 409, "GIFT_COUNT_LIMIT")
			}
		}
		if won != 3 {
			t.Fatal("wrong daily gift count")
		}
	}
	available, reserved = pool()
	if reserved != 0 {
		t.Fatal("unclosed reservation")
	}
	db.Exec("UPDATE pools SET available=0 WHERE couple_id=?", couple)
	zero := create("joint", "0", nil)["taskId"].(string)
	if len(f.must(creator, "GET", "/pool/reservations", nil)["items"].([]any)) != 1 {
		t.Fatal("zero task omitted from active reservations")
	}
	act(partner, zero, "accept", nil)
	f.clock.Add(int64(400 * 24 * time.Hour))
	if detail(creator, zero)["status"] != "active" {
		t.Fatal("joint task timed out")
	}
	act(creator, zero, "submit", nil)
	act(partner, zero, "reject_completion", nil)
	act(partner, zero, "submit", nil)
	done := act(creator, zero, "confirm", nil)
	if done["released"] != float64(0) || len(done["awards"].([]any)) != 2 {
		t.Fatal("zero-reward workflow failed")
	}
	db.Exec("UPDATE pools SET available=? WHERE couple_id=?", available, couple)
	// Different actors race a gift and a task award for the same receiver's final ten points.
	nextDay()
	activate("100")
	baseTask := create("joint", "90", nil)["taskId"].(string)
	act(partner, baseTask, "accept", nil)
	act(creator, baseTask, "submit", nil)
	act(partner, baseTask, "confirm", nil)
	capRace := create("joint", "20", nil)["taskId"].(string)
	act(partner, capRace, "accept", nil)
	act(partner, capRace, "submit", nil)
	var taskResult, giftResult result
	wg.Add(2)
	go func() {
		defer wg.Done()
		taskResult = f.call(creator, "POST", "/tasks/"+capRace+"/actions", platform.ID(), map[string]string{"action": "confirm"})
	}()
	go func() { defer wg.Done(); giftResult = gift(partner, "20", platform.ID()) }()
	wg.Wait()
	if taskResult.status != 200 || giftResult.status != 200 {
		t.Fatal(taskResult.raw, giftResult.raw)
	}
	credited := giftResult.body["actual"].(float64)
	for _, award := range taskResult.body["awards"].([]any) {
		a := award.(map[string]any)
		if a["userId"] == cID {
			credited += a["actual"].(float64)
		}
	}
	if credited != 10 {
		t.Fatal("concurrent task and gift exceeded shared daily cap", taskResult.raw, giftResult.raw)
	}
	// Outbox failure rolls back gift counters and task reservation together with domain data.
	nextDay()
	activate("100")
	failedConfirm := create("joint", "5", nil)["taskId"].(string)
	act(partner, failedConfirm, "accept", nil)
	act(creator, failedConfirm, "submit", nil)
	before, reserved = pool()
	beforeReserved := reserved
	beforeBalance := balance(cID)
	preview := f.must(creator, "GET", "/gifts/preview", nil)
	if _, err := db.Exec("CREATE TRIGGER fail_task_events BEFORE INSERT ON outbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='task test failure'"); err != nil {
		t.Fatal(err)
	}
	failed := f.call(creator, "POST", "/tasks", platform.ID(), map[string]any{"kind": "joint", "name": "失败预留", "description": "回滚", "reward": "10"})
	if failed.status != 500 {
		t.Fatal(failed.raw)
	}
	confirmKey := platform.ID()
	failed = f.call(partner, "POST", "/tasks/"+failedConfirm+"/actions", confirmKey, map[string]string{"action": "confirm"})
	if failed.status != 500 {
		t.Fatal(failed.raw)
	}
	g := gift(creator, "20", platform.ID())
	if g.status != 500 {
		t.Fatal(g.raw)
	}
	if _, err := db.Exec("DROP TRIGGER fail_task_events"); err != nil {
		t.Fatal(err)
	}
	after, reserved = pool()
	if after != before || reserved != beforeReserved || balance(cID) != beforeBalance || detail(creator, failedConfirm)["status"] != "awaiting" || f.must(creator, "GET", "/gifts/preview", nil)["sendsRemaining"] != preview["sendsRemaining"] {
		t.Fatal("outbox failure retained assets or gift count")
	}
	if r := f.call(partner, "POST", "/tasks/"+failedConfirm+"/actions", confirmKey, map[string]string{"action": "confirm"}); r.status != 200 {
		t.Fatal(r.raw)
	}
	var sum int64
	db.QueryRow("SELECT COALESCE(SUM(amount),0) FROM task_reservations WHERE couple_id=? AND status='active'", couple).Scan(&sum)
	_, reserved = pool()
	if sum != reserved {
		t.Fatal("pool reservation invariant")
	}
	f.must(creator, "GET", "/points/history", nil)
	f.must(creator, "GET", "/tasks?kind=partner&filter=history", nil)
	t.Log("tasks/gifts: capped asymmetric awards, reservation edits, strict deadlines, cancellation races, independent penalties, zero cases, midnight and rollback verified")
}
