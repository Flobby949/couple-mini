package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	schema "couple-mini/backend"
	"couple-mini/backend/internal/platform"
	"github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

type result struct {
	status int
	body   map[string]any
	raw    string
}
type fixture struct {
	t       *testing.T
	server  *Server
	handler http.Handler
	clock   atomic.Int64
}

func (f *fixture) call(token, method, path, key string, body any) result {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, req)
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		f.t.Errorf("invalid JSON %s", w.Body.String())
	}
	return result{w.Code, out, w.Body.String()}
}
func (f *fixture) must(token, method, path string, body any) map[string]any {
	f.t.Helper()
	r := f.call(token, method, path, platform.ID(), body)
	if r.status != 200 {
		f.t.Fatalf("%s %s: %d %s", method, path, r.status, r.raw)
	}
	return r.body
}
func (f *fixture) login(name string) string {
	return f.must("", "POST", "/login", map[string]string{"devIdentity": name})["token"].(string)
}
func (f *fixture) error(r result, status int, code string) {
	f.t.Helper()
	if r.status != status || r.body["error"].(map[string]any)["code"] != code {
		f.t.Fatalf("want %d %s, got %d %s", status, code, r.status, r.raw)
	}
}

func TestIntegration(t *testing.T) {
	if os.Getenv("INTEGRATION") != "1" {
		t.Skip("set INTEGRATION=1 to use an isolated real MySQL database and Redis")
	}
	_ = godotenv.Load("../../.env")
	cfg, err := mysql.ParseDSN(os.Getenv("MYSQL_DSN"))
	if err != nil {
		t.Fatal(err)
	}
	cfg.DBName = ""
	admin, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	database := "couple_test_" + platform.ID()
	if _, err = admin.Exec("CREATE DATABASE " + database + " CHARACTER SET utf8mb4"); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec("DROP DATABASE " + database)
	cfg.DBName = database
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(16)
	if err = platform.Migrate(context.Background(), db, schema.Migrations); err != nil {
		t.Fatal(err)
	}
	if err = platform.Migrate(context.Background(), db, schema.Migrations); err != nil {
		t.Fatal(err)
	}
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "127.0.0.1:6379"
	}
	cache := redis.NewClient(&redis.Options{Addr: addr, Password: os.Getenv("REDIS_PASSWORD")})
	defer cache.Close()
	f := &fixture{t: t}
	f.clock.Store(time.Date(2026, 10, 20, 15, 59, 59, 0, time.UTC).UnixNano())
	f.server = &Server{DB: db, Redis: cache, Config: Config{Env: "development", Address: "127.0.0.1:8080", DevLogin: true}, Now: func() time.Time { return time.Unix(0, f.clock.Load()).UTC() }, Client: &http.Client{Timeout: time.Second}}
	f.handler = f.server.Router()
	// Delete only the sessions created by this isolated suite, never flush the user's Redis.
	tokens := []string{}
	defer func() {
		for _, token := range tokens {
			cache.Del(context.Background(), "couple:session:"+platform.Hash(token))
		}
	}()
	login := func(name string) string { token := f.login(name); tokens = append(tokens, token); return token }
	alice, bob, charlie := login("Alice"), login("Bob"), login("Charlie")
	if f.must(alice, "GET", "/context", nil)["stage"] != "binding" {
		t.Fatal("unbound gate")
	}
	f.error(f.call(alice, "GET", "/home", "", nil), 403, "BINDING_REQUIRED")
	invitation := f.must(alice, "POST", "/invitations", map[string]any{})["code"].(string)
	f.error(f.call(alice, "POST", "/binding", platform.ID(), map[string]string{"code": invitation}), 422, "SELF_BINDING")
	// Simultaneous attempts to consume one invitation produce one relationship.
	var wg sync.WaitGroup
	binding := make(chan struct {
		token string
		r     result
	}, 2)
	for _, token := range []string{bob, charlie} {
		wg.Add(1)
		go func(token string) {
			defer wg.Done()
			binding <- struct {
				token string
				r     result
			}{token, f.call(token, "POST", "/binding", platform.ID(), map[string]string{"code": invitation})}
		}(token)
	}
	wg.Wait()
	close(binding)
	partner, outsider := "", ""
	for b := range binding {
		if b.r.status == 200 {
			if partner != "" {
				t.Fatal("double bind")
			}
			partner = b.token
		} else {
			outsider = b.token
		}
	}
	if partner == "" || outsider == "" {
		t.Fatal("binding race did not yield one winner")
	}
	state := f.must(alice, "GET", "/context", nil)
	couple := state["couple"].(map[string]any)["id"].(string)
	var accounts, stores, available int
	db.QueryRow("SELECT COUNT(*) FROM accounts").Scan(&accounts)
	db.QueryRow("SELECT COUNT(*) FROM stores").Scan(&stores)
	db.QueryRow("SELECT available FROM pools WHERE couple_id=?", couple).Scan(&available)
	if accounts != 2 || stores != 2 || available != 100 {
		t.Fatalf("initialization %d %d %d", accounts, stores, available)
	}
	f.error(f.call(alice, "POST", "/checkins", platform.ID(), map[string]any{}), 403, "RULES_REQUIRED")
	first := f.must(alice, "POST", "/rules", map[string]string{"dailyLimit": "0"})["id"].(string)
	second := f.must(alice, "POST", "/rules", map[string]string{"dailyLimit": "103.4"})["id"].(string)
	f.error(f.call(alice, "POST", "/rules/"+first+"/confirm", platform.ID(), map[string]any{}), 403, "PARTNER_CONFIRM_REQUIRED")
	f.error(f.call(outsider, "POST", "/rules/"+first+"/confirm", platform.ID(), map[string]any{}), 403, "BINDING_REQUIRED")
	f.must(partner, "POST", "/rules/"+first+"/confirm", map[string]any{})
	f.error(f.call(partner, "POST", "/rules/"+second+"/confirm", platform.ID(), map[string]any{}), 409, "PROPOSAL_INACTIVE")
	if f.must(alice, "GET", "/context", nil)["stage"] != "ready" {
		t.Fatal("zero limit must open gate")
	}
	for _, bad := range []string{"-0.1", "1000000000.5", "NaN"} {
		f.error(f.call(alice, "POST", "/rules", platform.ID(), map[string]string{"dailyLimit": bad}), 422, "INVALID_POINTS")
	}
	// Same-key concurrent writes replay one immutable receipt and credit once.
	key := platform.ID()
	responses := make(chan result, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); responses <- f.call(alice, "POST", "/checkins", key, map[string]any{}) }()
	}
	wg.Wait()
	close(responses)
	var receipt map[string]any
	for r := range responses {
		if r.status != 200 {
			t.Fatal(r.raw)
		}
		if receipt != nil && !reflect.DeepEqual(receipt, r.body) {
			t.Fatal("receipt changed")
		}
		receipt = r.body
	}
	f.must(partner, "POST", "/checkins", map[string]any{})
	f.error(f.call(alice, "POST", "/checkins", platform.ID(), map[string]any{}), 409, "ALREADY_CHECKED_IN")
	f.error(f.call(alice, "POST", "/checkins", key, map[string]any{"changed": true}), 409, "IDEMPOTENCY_CONFLICT")
	h := f.must(alice, "GET", "/home", nil)
	p := h["points"].(map[string]any)
	if p["total"] != float64(130) || p["balance"] != float64(0) || p["earned"] != float64(0) {
		t.Fatalf("checkin must only credit pool: %v", p)
	}
	// One second crosses Beijing midnight despite UTC still being October 20.
	f.clock.Add(int64(time.Second))
	f.must(alice, "POST", "/checkins", map[string]any{})
	f.must(partner, "POST", "/checkins", map[string]any{})
	if f.must(alice, "GET", "/context", nil)["businessDate"] != "2026-10-21" {
		t.Fatal("wrong business date")
	}
	for day := 2; day < 7; day++ {
		f.clock.Add(int64(24 * time.Hour))
		f.must(alice, "POST", "/checkins", map[string]any{})
		f.must(partner, "POST", "/checkins", map[string]any{})
	}
	h = f.must(alice, "GET", "/home", nil)
	p = h["points"].(map[string]any)
	if p["total"] != float64(340) {
		t.Fatalf("7 double days = 100+210+30, got %v", p)
	}
	// A gap does not reset accumulated double days, and no milestone is repeated.
	f.clock.Add(int64(3 * 24 * time.Hour))
	f.must(alice, "POST", "/checkins", map[string]any{})
	f.must(partner, "POST", "/checkins", map[string]any{})
	var days, milestones int
	db.QueryRow("SELECT double_days FROM couples WHERE id=?", couple).Scan(&days)
	db.QueryRow("SELECT COUNT(*) FROM milestones WHERE couple_id=?", couple).Scan(&milestones)
	if days != 8 || milestones != 1 {
		t.Fatalf("days=%d milestones=%d", days, milestones)
	}
	// Future rule changes neither reset earned totals nor credit the initial pool again.
	me := state["me"].(map[string]any)["id"].(string)
	db.Exec("INSERT INTO daily_points(user_id,business_date,earned,gifts_sent) VALUES (?,?,20,2)", me, platform.Date(f.server.Now()))
	proposal := f.must(alice, "POST", "/rules", map[string]string{"dailyLimit": "2"})["id"].(string)
	f.must(partner, "POST", "/rules/"+proposal+"/confirm", map[string]any{})
	h = f.must(alice, "GET", "/home", nil)
	p = h["points"].(map[string]any)
	if p["earned"] != float64(20) || p["remaining"] != float64(0) {
		t.Fatalf("rule change rewrote daily totals %v", p)
	}
	// Closing an absent operation fences off any delayed original request.
	closed := platform.ID()
	f.must(alice, "POST", "/operations/"+closed+"/close", map[string]any{})
	f.error(f.call(alice, "POST", "/rules", closed, map[string]string{"dailyLimit": "50"}), 409, "OPERATION_CLOSED")
	if f.must(partner, "GET", "/operations/"+closed, nil)["status"] != "absent" {
		t.Fatal("operation leaked across actors")
	}
	// Race close with execute. The final state is success or closed, never both.
	for i := 0; i < 8; i++ {
		race := platform.ID()
		var execute, close result
		wg.Add(2)
		go func() {
			defer wg.Done()
			execute = f.call(alice, "POST", "/rules", race, map[string]string{"dailyLimit": "8"})
		}()
		go func() {
			defer wg.Done()
			close = f.call(alice, "POST", "/operations/"+race+"/close", "", map[string]any{})
		}()
		wg.Wait()
		if close.status != 200 {
			t.Fatal(close.raw)
		}
		status := f.must(alice, "GET", "/operations/"+race, nil)["status"]
		if status == "succeeded" && execute.status != 200 || status == "closed" && execute.status != 409 {
			t.Fatalf("race inconsistent: %s %s", execute.raw, close.raw)
		}
	}
	// Domain and receipt must roll back together when outbox persistence fails.
	f.clock.Add(int64(24 * time.Hour))
	if _, err = db.Exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test failure'"); err != nil {
		t.Fatal(err)
	}
	rollbackKey := platform.ID()
	failed := f.call(alice, "POST", "/checkins", rollbackKey, map[string]any{})
	if failed.status != 500 {
		t.Fatal(failed.raw)
	}
	if _, err = db.Exec("DROP TRIGGER fail_outbox"); err != nil {
		t.Fatal(err)
	}
	if f.must(alice, "GET", "/operations/"+rollbackKey, nil)["status"] != "absent" {
		t.Fatal("failed transaction retained receipt")
	}
	f.call(alice, "POST", "/checkins", rollbackKey, map[string]any{})
	var ledger, total int64
	db.QueryRow("SELECT SUM(amount) FROM pool_ledger WHERE couple_id=?", couple).Scan(&ledger)
	db.QueryRow("SELECT available+reserved FROM pools WHERE couple_id=?", couple).Scan(&total)
	if ledger != total {
		t.Fatalf("ledger %d != pool %d", ledger, total)
	}
	t.Run("commerce", func(t *testing.T) { f.t = t; testCommerce(f, alice, partner, outsider, couple) })
	f.t = t
	f.server.Config.DevLogin = false
	f.error(f.call("", "POST", "/login", "", map[string]string{"devIdentity": "disabled"}), 403, "DEV_LOGIN_DISABLED")
	f.error(f.call("bad", "GET", "/context", "", nil), 401, "UNAUTHENTICATED")
	t.Log(fmt.Sprintf("real MySQL/Redis verified: pool=%d, doubleDays=%d, one milestone; isolated DB removed", total, days))
}

func TestProductionConfigRejectsDevelopmentLogin(t *testing.T) {
	for _, c := range []Config{{Env: "production", DSN: "configured", Address: "127.0.0.1:8080", DevLogin: true}, {Env: "development", DSN: "configured", Address: "0.0.0.0:8080", DevLogin: true}} {
		if err := ValidateConfig(c); err == nil || !strings.Contains(err.Error(), "DEV_LOGIN") {
			t.Fatal("unsafe development login accepted")
		}
	}
}
