package app

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"testing"
	"time"

	"couple-mini/backend/internal/platform"
	"github.com/redis/go-redis/v9"
)

func TestReadCacheUnavailable(t *testing.T) {
	cache := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	cache.Close()
	s := &Server{Redis: cache}
	value, err := cachedRead(s, t.Context(), "test", "value", stableCacheTTL, func() (int, error) { return 42, nil })
	if value != 42 || err != nil {
		t.Fatal("cache failure must use the source", value, err)
	}
	want := errors.New("source failed")
	_, err = cachedRead(s, t.Context(), "test", "value", stableCacheTTL, func() (int, error) { return 0, want })
	if !errors.Is(err, want) {
		t.Fatal("source error was hidden", err)
	}
}

func testReadCaches(f *fixture, alice, bob, outsider, otherPartner string) {
	t := f.t
	ctx := context.Background()
	f.server.Config.MediaRoot = t.TempDir()
	a := f.must(alice, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	b := f.must(bob, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	if f.server.Redis.Exists(ctx, readCacheKey("membership", a)).Val() != 0 {
		t.Fatal("unbound membership was cached")
	}
	var encoded bytes.Buffer
	png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 20, 20)))
	upload := f.uploadTo(alice, "/profile/avatar", encoded.Bytes())
	if upload.status != 200 {
		t.Fatal(upload.raw)
	}
	cover := upload.body["fileId"].(string)
	if f.image(bob, cover) != 404 || f.image(alice, cover) != 200 {
		t.Fatal("unbound media access")
	}
	invite := f.must(alice, "POST", "/invitations", map[string]any{})["code"].(string)
	// Hold an unbound read snapshot while another request completes binding.
	tx, locked, readAt, err := f.server.beginRelation(ctx, a, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	couple := f.must(bob, "POST", "/binding", map[string]string{"code": invite})["coupleId"].(string)
	if _, err := f.server.cachedCoupleID(ctx, a); err != nil {
		t.Fatal(err)
	}
	beforeBinding, err := f.server.cachedContext(ctx, tx, a, locked, readAt)
	tx.Rollback()
	if err != nil || beforeBinding.Couple != nil || f.server.Redis.HExists(ctx, readCacheKey("context", couple), a).Val() {
		t.Fatal("unlocked pre-binding snapshot entered the bound context cache", beforeBinding, err)
	}
	if f.image(bob, cover) != 200 {
		t.Fatal("cached denial hid newly granted access")
	}
	// Warm both perspectives before every mutation, including the first rule.
	f.must(alice, "GET", "/context", nil)
	f.must(bob, "GET", "/context", nil)
	if len(f.must(alice, "GET", "/rules", nil)["proposals"].([]any)) != 0 {
		t.Fatal("unexpected initial rules")
	}
	rule := f.must(alice, "POST", "/rules", map[string]string{"dailyLimit": "100"})["id"].(string)
	if len(f.must(bob, "GET", "/rules", nil)["proposals"].([]any)) != 1 {
		t.Fatal("new rule hidden by cache")
	}
	f.must(alice, "GET", "/rules?id="+rule, nil)
	f.must(bob, "POST", "/rules/"+rule+"/confirm", map[string]any{})
	for _, token := range []string{alice, bob} {
		if f.must(token, "GET", "/context", nil)["stage"] != "ready" || f.must(token, "GET", "/rules?id="+rule, nil)["proposals"].([]any)[0].(map[string]any)["status"] != "active" {
			t.Fatal("rule confirmation did not refresh both users")
		}
	}
	f.must(alice, "POST", "/profile", map[string]string{"nickname": "缓存更新后的昵称"})
	if f.must(bob, "GET", "/context", nil)["partner"].(map[string]any)["nickname"] != "缓存更新后的昵称" || f.must(alice, "GET", "/context", nil)["me"].(map[string]any)["nickname"] != "缓存更新后的昵称" {
		t.Fatal("profile change did not refresh both users")
	}
	// Hits must work without any database, including membership discovery.
	hits := &Server{Redis: f.server.Redis}
	if id, err := hits.cachedCoupleID(ctx, a); err != nil || id != couple {
		t.Fatal("membership queried the database on a cache hit", id, err)
	}
	tx, locked, readAt, err = f.server.beginRelation(ctx, a, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	state, err := hits.cachedContext(ctx, nil, a, locked, readAt)
	tx.Rollback()
	if err != nil || state.Partner.ID != b {
		t.Fatal("context queried the database on a cache hit", state, err)
	}
	if proposals, err := hits.cachedRules(ctx, nil, couple); err != nil || len(proposals) != 1 {
		t.Fatal("rules queried the database on a cache hit", proposals, err)
	}
	preference := func(token string) string {
		t.Helper()
		for _, item := range f.must(token, "GET", "/notification-preferences", nil)["items"].([]any) {
			row := item.(map[string]any)
			if row["code"] == "P01" {
				return row["channel"].(string)
			}
		}
		t.Fatal("missing notification preference")
		return ""
	}
	if preference(alice) != "in_app" || preference(bob) != "in_app" {
		t.Fatal("unexpected notification defaults")
	}
	f.must(alice, "POST", "/notification-preferences/P01", map[string]string{"channel": "off"})
	if preference(alice) != "off" || preference(bob) != "in_app" {
		t.Fatal("notification preference cache was stale or shared across users")
	}
	// Sign-in changes both perspectives; advancing the business date must not
	// reuse yesterday's status or the cached server timestamp.
	now := f.server.Now().In(platform.Beijing)
	f.clock.Store(time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, platform.Beijing).UnixNano())
	f.must(alice, "GET", "/home", nil)
	f.must(bob, "GET", "/home", nil)
	f.must(alice, "POST", "/checkins", map[string]any{})
	if !f.must(bob, "GET", "/home", nil)["checkin"].(map[string]any)["partner"].(bool) {
		t.Fatal("partner sign-in remained cached")
	}
	f.must(bob, "POST", "/checkins", map[string]any{})
	if f.must(alice, "GET", "/context", nil)["couple"].(map[string]any)["doubleDays"] != float64(1) {
		t.Fatal("double sign-in days remained cached")
	}
	f.clock.Add(int64(2 * time.Second))
	home := f.must(alice, "GET", "/home", nil)
	if checked := home["checkin"].(map[string]any); checked["me"] != false || checked["partner"] != false {
		t.Fatal("yesterday's sign-in leaked into today", checked)
	}
	if current := home["context"].(map[string]any); current["businessDate"] != platform.Date(f.server.Now()) || current["serverTime"] != f.server.Now().Format(time.RFC3339Nano) {
		t.Fatal("cached context froze the clock", current)
	}
	// Gift lists refresh on append; individual receipts remain immutable.
	f.must(alice, "GET", "/gifts", nil)
	gift := f.must(alice, "POST", "/gifts", map[string]string{"amount": "0"})["id"].(string)
	if len(f.must(bob, "GET", "/gifts", nil)["items"].([]any)) != 1 || f.must(bob, "GET", "/gifts/"+gift, nil)["id"] != gift {
		t.Fatal("new gift hidden by cache")
	}
	f.must(alice, "POST", "/gifts", map[string]string{"amount": "0"})
	if len(f.must(alice, "GET", "/gifts", nil)["items"].([]any)) != 2 {
		t.Fatal("gift list was not invalidated")
	}
	// Cache active and history lists before a due transition. Both foreground
	// reads and the scheduled settler must invalidate them before committing.
	for i, scheduled := range []bool{false, true} {
		deadline := f.server.Now().Add(time.Minute)
		f.must(bob, "GET", "/tasks", nil)
		created := f.must(alice, "POST", "/tasks", map[string]any{"kind": "partner", "name": "到期缓存验证", "reward": "0", "deadline": deadline.Format(time.RFC3339Nano)})["taskId"].(string)
		if len(f.must(bob, "GET", "/tasks", nil)["items"].([]any)) != 1 || len(f.must(bob, "GET", "/home", nil)["taskTodos"].([]any)) != 1 {
			t.Fatal("new task hidden by cached lists or todos")
		}
		f.must(bob, "GET", "/tasks/"+created, nil)
		wantStatus := "expired"
		if !scheduled {
			f.must(alice, "POST", "/tasks/"+created, map[string]any{"kind": "partner", "name": "修改后任务", "reward": "0", "deadline": deadline.Format(time.RFC3339Nano)})
			if f.must(bob, "GET", "/tasks", nil)["items"].([]any)[0].(map[string]any)["name"] != "修改后任务" {
				t.Fatal("task edit left a cached list")
			}
			f.must(bob, "POST", "/tasks/"+created+"/actions", map[string]string{"action": "accept"})
			if f.must(bob, "GET", "/tasks", nil)["items"].([]any)[0].(map[string]any)["status"] != "active" {
				t.Fatal("task action left a cached list")
			}
			f.must(bob, "GET", "/tasks/"+created, nil)
			wantStatus = "timed_out"
		}
		f.must(bob, "GET", "/tasks?filter=history", nil)
		f.clock.Store(deadline.UnixNano())
		if scheduled {
			if err := f.server.SettleDue(ctx); err != nil {
				t.Fatal(err)
			}
		}
		if task := f.must(bob, "GET", "/tasks/"+created, nil)["task"].(map[string]any); task["status"] != wantStatus {
			t.Fatal("due task detail remained cached", task)
		}
		if len(f.must(bob, "GET", "/tasks", nil)["items"].([]any)) != 0 || len(f.must(bob, "GET", "/home", nil)["taskTodos"].([]any)) != 0 {
			t.Fatal("due task remained in active lists or todos")
		}
		if len(f.must(bob, "GET", "/tasks?filter=history", nil)["items"].([]any)) != i+1 {
			t.Fatal("due task missing from cached history")
		}
	}
	// List keys include the user and role; detail actions differ by viewer.
	product := f.must(alice, "POST", "/products", map[string]any{"name": "订单缓存验证", "coverId": cover, "stock": 2, "price": "0"})["id"].(string)
	f.must(bob, "GET", "/orders", nil)
	f.must(alice, "GET", "/orders?role=seller", nil)
	order := f.must(bob, "POST", "/orders", map[string]string{"productId": product, "confirmedPrice": "0"})["orderId"].(string)
	if len(f.must(bob, "GET", "/orders", nil)["items"].([]any)) != 1 || len(f.must(alice, "GET", "/orders?role=seller", nil)["items"].([]any)) != 1 || len(f.must(alice, "GET", "/orders", nil)["items"].([]any)) != 0 {
		t.Fatal("order list was stale or leaked across roles")
	}
	f.must(alice, "GET", "/orders/"+order, nil)
	if actions := f.must(bob, "GET", "/orders/"+order, nil)["order"].(map[string]any)["allowedActions"].([]any); len(actions) != 1 || actions[0] != "cancel" {
		t.Fatal("seller actions leaked to buyer", actions)
	}
	for _, action := range []string{"accept", "fulfill"} {
		f.must(alice, "POST", "/orders/"+order+"/actions", map[string]string{"action": action})
		f.must(bob, "GET", "/orders/"+order, nil)
	}
	detail := f.must(bob, "GET", "/orders/"+order, nil)["order"].(map[string]any)
	f.must(bob, "GET", "/orders", nil)
	f.must(bob, "GET", "/home", nil)
	at, err := time.Parse(time.RFC3339Nano, detail["autoConfirmAt"].(string))
	if err != nil {
		t.Fatal(err)
	}
	f.clock.Store(at.UnixNano())
	if f.must(bob, "GET", "/orders/"+order, nil)["order"].(map[string]any)["status"] != "completed" || f.must(bob, "GET", "/orders", nil)["items"].([]any)[0].(map[string]any)["status"] != "completed" || len(f.must(bob, "GET", "/home", nil)["orderTodos"].([]any)) != 0 {
		t.Fatal("automatic confirmation left cached order state")
	}
	if _, err := f.server.DB.Exec("UPDATE accounts SET balance=42 WHERE user_id=?", b); err != nil {
		t.Fatal(err)
	}
	if f.must(bob, "GET", "/orders/"+order, nil)["balance"] != float64(42) {
		t.Fatal("order detail cached the live balance")
	}
	// A separate bound couple must not see warmed records from this couple.
	invite = f.must(outsider, "POST", "/invitations", map[string]any{})["code"].(string)
	f.must(otherPartner, "POST", "/binding", map[string]string{"code": invite})
	if len(f.must(outsider, "GET", "/rules", nil)["proposals"].([]any)) != 0 {
		t.Fatal("rules leaked across couples")
	}
	f.error(f.call(outsider, "GET", "/rules?id="+rule, "", nil), 404, "NOT_FOUND")
	if f.image(outsider, cover) != 404 {
		t.Fatal("cached media authorization leaked across users")
	}
	for _, entry := range []struct {
		kind, scope string
		ttl         time.Duration
	}{
		{"membership", a, stableCacheTTL}, {"context", couple, stableCacheTTL},
		{"rules", couple, stableCacheTTL}, {"media", a, stableCacheTTL},
		{"preferences", a, stableCacheTTL},
		{"gift-details", couple, stableCacheTTL}, {"gifts", couple, activityCacheTTL},
		{"checkins", couple, activityCacheTTL}, {"tasks", couple, activityCacheTTL}, {"orders", couple, activityCacheTTL},
	} {
		ttl, err := f.server.Redis.TTL(ctx, readCacheKey(entry.kind, entry.scope)).Result()
		if err != nil || ttl < entry.ttl-time.Minute || ttl > entry.ttl {
			t.Fatal("incorrect cache lifetime", entry.kind, ttl, err)
		}
	}
}
