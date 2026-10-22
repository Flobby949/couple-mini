package app

import (
	"context"
	"couple-mini/backend/internal/notifications"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/wechat"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

func testNotifications(f *fixture, creator, partner, outsider, couple string) {
	t := f.t
	f.clock.Add(int64(24 * time.Hour))
	ctx := context.Background()
	db := f.server.DB
	cID := f.must(creator, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	pID := f.must(partner, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	dispatch := func() {
		for i := 0; i < 15; i++ {
			if err := f.server.DispatchNotifications(ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	count := func(query string, args ...any) int {
		var n int
		if err := db.QueryRow(query, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	pref := func(token, code, channel string) {
		f.must(token, "POST", "/notification-preferences/"+code, map[string]string{"channel": channel})
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- f.server.DispatchNotifications(ctx) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	dispatch()
	if n := count("SELECT COUNT(*) FROM event_consumptions WHERE status<>'succeeded'"); n != 0 {
		t.Fatalf("initial event consumption failures: %d", n)
	}
	if count("SELECT COUNT(*) FROM outbox") != count("SELECT COUNT(*) FROM event_consumptions") {
		t.Fatal("missing consumption receipts")
	}
	before := count("SELECT COUNT(*) FROM notifications")
	dispatch()
	if count("SELECT COUNT(*) FROM notifications") != before {
		t.Fatal("repeated delivery duplicated internal messages")
	}
	items := f.must(partner, "GET", "/notification-preferences", nil)["items"].([]any)
	if len(items) != 30 {
		t.Fatal("missing templates")
	}
	for _, item := range items {
		if item.(map[string]any)["channel"] != "in_app" {
			t.Fatal("incorrect default")
		}
	}
	f.error(f.call(outsider, "GET", "/notifications", "", nil), 403, "BINDING_REQUIRED")
	pref(partner, "P01", "both")
	g := f.must(creator, "POST", "/gifts", map[string]string{"amount": "0"})
	giftID := g["id"].(string)
	var originalName string
	if err := db.QueryRow("SELECT nickname FROM users WHERE id=?", cID).Scan(&originalName); err != nil {
		t.Fatal(err)
	}
	pref(partner, "P01", "off")
	if _, err := db.Exec("UPDATE users SET nickname='changed after event' WHERE id=?", cID); err != nil {
		t.Fatal(err)
	}
	dispatch()
	var id, body, status, reason string
	if err := db.QueryRow("SELECT n.id,n.body,d.status,d.reason FROM notifications n JOIN notification_deliveries d ON d.notification_id=n.id WHERE n.user_id=? AND n.target_id=?", pID, giftID).Scan(&id, &body, &status, &reason); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, originalName) || strings.Contains(body, "changed after event") || strings.Contains(body, "额度限制") || status != "unavailable" || reason != "template_unmapped" {
		t.Fatalf("snapshot or zero gift wrong: %s %s %s", body, status, reason)
	}
	db.Exec("UPDATE users SET nickname=? WHERE id=?", originalName, cID)
	f.error(f.call(creator, "GET", "/notifications/"+id, "", nil), 404, "NOT_FOUND")
	f.must(partner, "POST", "/notifications/read", map[string]any{"ids": []string{id}})
	// A message not generated yet is not part of all-read, even if its business time is older.
	f.clock.Add(-int64(time.Minute))
	late := f.must(creator, "POST", "/rules", map[string]string{"dailyLimit": "100"})["id"].(string)
	f.clock.Add(int64(time.Minute))
	f.must(partner, "POST", "/notifications/read-all", map[string]any{})
	dispatch()
	if count("SELECT COUNT(*) FROM notifications WHERE user_id=? AND target_id=? AND read_at IS NULL", pID, late) != 1 {
		t.Fatal("all-read swallowed late event")
	}
	// Closing all channels is frozen; reopening before consumption never backfills it.
	g = f.must(creator, "POST", "/gifts", map[string]string{"amount": "0"})
	pref(partner, "P01", "in_app")
	dispatch()
	if count("SELECT COUNT(*) FROM notifications WHERE target_id=?", g["id"]) != 0 {
		t.Fatal("off event backfilled")
	}
	// WeChat-only remains absent from the station even when the platform mapping is unavailable.
	pref(creator, "P01", "wechat")
	g = f.must(partner, "POST", "/gifts", map[string]string{"amount": "0"})
	dispatch()
	var hiddenID string
	if err := db.QueryRow("SELECT id FROM notifications WHERE target_id=? AND in_app=FALSE", g["id"]).Scan(&hiddenID); err != nil {
		t.Fatal(err)
	}
	f.error(f.call(creator, "GET", "/notifications/"+hiddenID, "", nil), 404, "NOT_FOUND")
	// Consumer failure cannot undo a committed business; its partial station rows roll back with the receipt.
	if _, err := db.Exec("CREATE TRIGGER fail_notification BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rendering failure'"); err != nil {
		t.Fatal(err)
	}
	next := f.must(creator, "POST", "/rules", map[string]string{"dailyLimit": "99"})["id"].(string)
	dispatch()
	if count("SELECT COUNT(*) FROM rule_proposals WHERE id=?", next) != 1 || count("SELECT COUNT(*) FROM notifications WHERE target_id=?", next) != 0 {
		t.Fatal("consumer changed committed business or retained partial notification")
	}
	if count("SELECT COUNT(*) FROM event_consumptions WHERE status='retry'") == 0 {
		t.Fatal("failed handler not retained for retry")
	}
	db.Exec("DROP TRIGGER fail_notification")
	f.clock.Add(int64(2 * time.Minute))
	dispatch()
	if count("SELECT COUNT(*) FROM notifications WHERE target_id=?", next) != 1 {
		t.Fatal("retry did not generate original notification exactly once")
	}
	// Success receipt failure must also roll back all notification inserts.
	last := f.must(creator, "POST", "/rules", map[string]string{"dailyLimit": "98"})["id"].(string)
	if _, err := db.Exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON event_consumptions FOR EACH ROW BEGIN IF NEW.status='succeeded' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test receipt failure'; END IF; END"); err != nil {
		t.Fatal(err)
	}
	if err := f.server.DispatchNotifications(ctx); err == nil {
		t.Fatal("receipt failure was hidden")
	}
	if count("SELECT COUNT(*) FROM notifications WHERE target_id=?", last) != 0 {
		t.Fatal("station committed without receipt")
	}
	db.Exec("DROP TRIGGER fail_receipt")
	dispatch()
	if count("SELECT COUNT(*) FROM notifications WHERE target_id=?", last) != 1 {
		t.Fatal("receipt retry duplicated or lost message")
	}
	// Preference changes settle due tasks first and capture the pre-change setting.
	pref(partner, "T09", "in_app")
	deadline := f.server.Now().Add(time.Minute)
	task := f.must(creator, "POST", "/tasks", map[string]any{"kind": "partner", "name": "deadline snapshot", "description": "", "reward": "0", "deadline": deadline.Format(time.RFC3339Nano)})["taskId"].(string)
	f.must(partner, "POST", "/tasks/"+task+"/actions", map[string]string{"action": "accept"})
	f.clock.Add(int64(2 * time.Minute))
	pref(partner, "T09", "off")
	dispatch()
	if count("SELECT COUNT(*) FROM notifications WHERE user_id=? AND target_id=? AND template_code='T09'", pID, task) != 1 {
		t.Fatal("due event used new preference")
	}
	// Client report retries use a stable report ID beyond the request key; credits cannot duplicate.
	f.server.NotificationMappings = notifications.Mappings{
		"P01": {TemplateID: "platform-test", Fields: map[string]string{"thing1": "name", "number2": "amount"}},
		"P02": {TemplateID: "platform-test", Fields: map[string]string{"thing1": "name", "number2": "amount"}},
	}
	f.server.Wechat = &wechat.Client{}
	report := map[string]string{"platformTemplateId": "platform-test", "result": "accept", "reportId": platform.ID()}
	f.must(partner, "POST", "/notification-authorizations/P02", report)
	f.must(partner, "POST", "/notification-authorizations/P02", report)
	if count("SELECT COUNT(*) FROM subscription_authorizations WHERE user_id=? AND used=FALSE", pID) != 1 {
		t.Fatal("authorization resync minted credits")
	}
	for _, item := range f.must(partner, "GET", "/notification-preferences", nil)["items"].([]any) {
		p := item.(map[string]any)
		if (p["code"] == "P01" || p["code"] == "P02") && p["reportedRemaining"] != float64(1) {
			t.Fatal("shared templates did not expose the same credit", p)
		}
	}
	// A real platform identity with an accepted one-shot report can be claimed once.
	if _, err := db.Exec("UPDATE users SET openid=? WHERE id=?", "test-platform-"+pID, pID); err != nil {
		t.Fatal(err)
	}
	pref(partner, "P01", "both")
	f.clock.Add(int64(24 * time.Hour))
	pendingGift := f.must(creator, "POST", "/gifts", map[string]string{"amount": "0"})
	dispatch()
	if count("SELECT COUNT(*) FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.target_id=? AND d.status='pending'", pendingGift["id"]) != 1 {
		t.Fatal("authorized delivery not queued")
	}
	if count("SELECT COUNT(*) FROM subscription_authorizations WHERE user_id=? AND template_code='P02' AND used=TRUE", pID) != 1 {
		t.Fatal("gift did not consume the shared sign-in subscription")
	}
	sender := &unknownSender{}
	if err := notifications.Deliver(ctx, db, sender, f.server.Now()); err != nil {
		t.Fatal(err)
	}
	if err := notifications.Deliver(ctx, db, sender, f.server.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if sender.calls != 1 {
		t.Fatal("unknown platform request was automatically repeated", sender.calls)
	}
	report["result"] = "reject"
	f.error(f.call(partner, "POST", "/notification-authorizations/P01", platform.ID(), report), 409, "AUTHORIZATION_CONFLICT")
	report["reportId"] = platform.ID()
	f.must(partner, "POST", "/notification-authorizations/P01", report)
	if count("SELECT COUNT(*) FROM subscription_authorizations WHERE user_id=? AND result='accept' AND used=FALSE", pID) != 0 {
		t.Fatal("reject retained unused authorization")
	}
	f.server.Wechat = nil
	// Delivery leases distinguish safe pre-send recovery from unknown in-flight results.
	var delivery string
	if err := db.QueryRow("SELECT notification_id FROM notification_deliveries LIMIT 1").Scan(&delivery); err != nil {
		t.Fatal(err)
	}
	for _, state := range []string{"claimed", "sending"} {
		db.Exec("UPDATE notification_deliveries SET status=?,lease_until=? WHERE notification_id=?", state, f.server.Now().Add(-time.Minute), delivery)
		if err := notifications.Deliver(ctx, db, nil, f.server.Now()); err != nil {
			t.Fatal(err)
		}
		want := "retry"
		if state == "sending" {
			want = "unknown"
		}
		if count("SELECT COUNT(*) FROM notification_deliveries WHERE notification_id=? AND status=?", delivery, want) != 1 {
			t.Fatal("unsafe lease recovery")
		}
	}
	// Frozen data remains valid JSON; no consumer re-reads mutable task/order state.
	var raw []byte
	if err := db.QueryRow("SELECT notification_context FROM outbox ORDER BY occurred_at DESC LIMIT 1").Scan(&raw); err != nil || !json.Valid(raw) {
		t.Fatal("snapshot missing", err)
	}
	if count("SELECT COUNT(*) FROM notifications WHERE user_id NOT IN (?,?)", cID, pID) != 0 {
		t.Fatal("recipient escaped relationship")
	}
	t.Log("notifications: 30 defaults, immutable snapshots, independent transactional consumption, dual-channel isolation, late all-read, deadline-before-preference, report dedup and lease recovery verified")
}

func testFirstRuleMessages(f *fixture, proposer, receiver, proposal string) {
	for i := 0; i < 2; i++ {
		if err := f.server.DispatchNotifications(context.Background()); err != nil {
			f.t.Fatal(err)
		}
	}
	f.error(f.call(receiver, "GET", "/notifications", "", nil), 403, "RULES_REQUIRED")
	f.must(receiver, "GET", "/rules?id="+proposal, nil)
	f.must(receiver, "POST", "/rules/"+proposal+"/read-notification", map[string]any{})
	var count int
	f.server.DB.QueryRow("SELECT COUNT(*) FROM notifications WHERE target_id=? AND template_code='R02' AND read_at IS NOT NULL", proposal).Scan(&count)
	if count != 1 {
		f.t.Fatal("first rule message not marked after opening")
	}
	f.must(proposer, "POST", "/rules/"+proposal+"/read-notification", map[string]any{})
	// No matching in-app notification for the proposer: marking must never create one.
	var rows int
	f.server.DB.QueryRow("SELECT COUNT(*) FROM notifications WHERE target_id=?", proposal).Scan(&rows)
	if rows != 1 {
		f.t.Fatal("rule mark created notification")
	}
}

type unknownSender struct{ calls int }

func (s *unknownSender) Send(context.Context, []byte) wechat.Outcome {
	s.calls++
	return wechat.Outcome{Status: "unknown", Reason: "send_result_unknown"}
}
