package app

import (
	"context"
	"errors"
	"net"
	"reflect"
	"sync"
	"testing"
	"time"

	"couple-mini/backend/internal/platform"
	"github.com/redis/go-redis/v9"
)

func TestCheckinInput(t *testing.T) {
	for _, raw := range []string{"", "{}", " { } "} {
		if mood, err := checkinMood([]byte(raw), "2026-10-22"); err != nil || mood != nil {
			t.Fatal("legacy request", raw, mood, err)
		}
	}
	if mood, err := checkinMood([]byte(`{"mood":"happy","expectedDate":"2026-10-22"}`), "2026-10-22"); err != nil || mood == nil || *mood != "happy" {
		t.Fatal(mood, err)
	}
	for _, raw := range []string{`null`, `[]`, `false`, `{"mood":null,"expectedDate":"2026-10-22"}`, `{"mood":"happy"}`, `{"expectedDate":"2026-10-22"}`, `{"mood":"happy","expectedDate":null}`, `{"mood":"happy","expectedDate":"2026-1-1"}`, `{"mood":"happy","expectedDate":"2026-02-30"}`, `{"mood":"happy","expectedDate":"2026-10-22","userId":"b"}`} {
		if _, err := checkinMood([]byte(raw), "2026-10-22"); err == nil {
			t.Error("accepted invalid request", raw)
		}
	}
	_, err := checkinMood([]byte(`{"mood":"happy","expectedDate":"2026-10-21"}`), "2026-10-22")
	var failure *platform.Error
	if !errors.As(err, &failure) || failure.Code != "CHECKIN_DATE_CHANGED" {
		t.Fatal("old picker must not sign into a new day", err)
	}
}

// Only DEL fails; session lookups and all other Redis operations still work.
type failedCheckinDelete struct{}

func (failedCheckinDelete) DialHook(next redis.DialHook) redis.DialHook {
	return func(ctx context.Context, network, addr string) (net.Conn, error) { return next(ctx, network, addr) }
}
func (failedCheckinDelete) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		if cmd.Name() == "del" {
			return errors.New("injected cache deletion failure")
		}
		return next(ctx, cmd)
	}
}
func (failedCheckinDelete) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

func testMoodCheckins(f *fixture, alice, bob, outsider, otherPartner string) {
	t := f.t
	before := f.clock.Load()
	defer f.clock.Store(before)
	setDay := func(day int) { f.clock.Store(time.Date(2026, 10, day, 10, 0, 0, 0, platform.Beijing).UnixNano()) }
	setDay(1)
	ctx := context.Background()
	bind := func(a, b string) string {
		invite := f.must(a, "POST", "/invitations", map[string]any{})["code"].(string)
		id := f.must(b, "POST", "/binding", map[string]string{"code": invite})["coupleId"].(string)
		f.error(f.call(a, "GET", "/checkins/calendar", "", nil), 403, "RULES_REQUIRED")
		rule := f.must(a, "POST", "/rules", map[string]string{"dailyLimit": "100"})["id"].(string)
		f.must(b, "POST", "/rules/"+rule+"/confirm", map[string]any{})
		return id
	}
	f.error(f.call(outsider, "GET", "/checkins/calendar", "", nil), 403, "BINDING_REQUIRED")
	couple := bind(alice, bob)
	bind(outsider, otherPartner)
	legacy := f.must(alice, "POST", "/checkins", map[string]any{})
	if legacy["mood"] != nil || legacy["revision"] != float64(1) {
		t.Fatal("legacy sign-in must remain real, without an invented mood", legacy)
	}
	setDay(22)
	month := func(token string) map[string]any {
		return f.must(token, "GET", "/checkins/calendar?month=2026-10", nil)
	}
	days := func(response map[string]any) []any { return response["days"].([]any) }
	oldMonth := month(alice)
	if days(oldMonth)[0].(map[string]any)["me"].(map[string]any)["mood"] != nil || len(days(oldMonth)) != 31 {
		t.Fatal("legacy/calendar shape", oldMonth)
	}
	for _, token := range []string{alice, bob} {
		month(token)
		f.must(token, "GET", "/home", nil)
	}
	cache := f.server.Redis
	failing := redis.NewClient(cache.Options())
	failing.AddHook(failedCheckinDelete{})
	f.server.Redis = failing
	defer func() { f.server.Redis = cache; failing.Close() }()
	key := platform.ID()
	body := map[string]string{"mood": "happy", "expectedDate": "2026-10-22"}
	results := make(chan result, 4)
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() { defer wg.Done(); results <- f.call(alice, "POST", "/checkins", key, body) }()
	}
	wg.Wait()
	close(results)
	var receipt map[string]any
	for result := range results {
		if result.status != 200 || result.body["mood"] != "happy" || result.body["revision"] != float64(2) || receipt != nil && !reflect.DeepEqual(receipt, result.body) {
			t.Fatal("replay changed mood/revision/receipt", result)
		}
		receipt = result.body
	}
	f.error(f.call(alice, "POST", "/checkins", key, map[string]string{"mood": "sad", "expectedDate": "2026-10-22"}), 409, "IDEMPOTENCY_CONFLICT")
	f.error(f.call(alice, "POST", "/checkins", platform.ID(), body), 409, "ALREADY_CHECKED_IN")
	partnerHome := f.must(bob, "GET", "/home", nil)["checkin"].(map[string]any)
	if partnerHome["partnerEntry"].(map[string]any)["mood"] != "happy" || partnerHome["me"] != false || partnerHome["revision"] != float64(2) {
		t.Fatal("failed DEL hid new mood or mixed viewers", partnerHome)
	}
	if got := days(month(bob))[21].(map[string]any); got["me"] != nil || got["partner"].(map[string]any)["mood"] != "happy" {
		t.Fatal("month stayed stale after failed DEL", got)
	}
	if !cache.HExists(ctx, readCacheKey("checkins", couple), "v2:month:2026-10-01:r1").Val() {
		t.Fatal("fault did not actually preserve the obsolete cache")
	}
	f.must(bob, "POST", "/checkins", map[string]string{"mood": "energetic", "expectedDate": "2026-10-22"})
	current := month(alice)
	if row := days(current)[21].(map[string]any); row["me"].(map[string]any)["mood"] != "happy" || row["partner"].(map[string]any)["mood"] != "energetic" || current["revision"] != float64(3) {
		t.Fatal("both moods missing", current)
	}
	if pool := f.must(alice, "GET", "/home", nil)["points"].(map[string]any)["total"]; pool != float64(140) {
		t.Fatal("moods changed the existing reward rules", pool)
	}
	foreign := f.must(outsider, "GET", "/checkins/calendar?month=2026-10&coupleId="+couple, nil)
	for _, row := range days(foreign) {
		if day := row.(map[string]any); day["me"] != nil || day["partner"] != nil {
			t.Fatal("relationship data leaked", day)
		}
	}
	for _, bad := range []string{"2026-9", "2026-13", "2026-10-01"} {
		f.error(f.call(alice, "GET", "/checkins/calendar?month="+bad, "", nil), 422, "INVALID_MONTH")
	}
	for _, outside := range []string{"2026-09", "2026-11"} {
		f.error(f.call(alice, "GET", "/checkins/calendar?month="+outside, "", nil), 422, "MONTH_OUT_OF_RANGE")
	}
	setDay(23)
	f.error(f.call(alice, "POST", "/checkins", platform.ID(), body), 409, "CHECKIN_DATE_CHANGED")
	if replay := f.must(alice, "GET", "/operations/"+key, nil); !reflect.DeepEqual(replay["response"], receipt) {
		t.Fatal("old successful receipt changed after midnight", replay)
	}
	if replay := f.call(alice, "POST", "/checkins", key, body); replay.status != 200 || !reflect.DeepEqual(replay.body, receipt) {
		t.Fatal("date validation blocked immutable replay", replay)
	}
	if got := f.must(alice, "GET", "/home", nil)["checkin"].(map[string]any); got["me"] != false || got["meEntry"] != nil {
		t.Fatal("yesterday's mood leaked into today", got)
	}
	for i, mood := range []string{"calm", "loving", "missing", "tired", "sad", "irritated"} {
		setDay(23 + i)
		f.must(alice, "POST", "/checkins", map[string]string{"mood": mood, "expectedDate": platform.Date(f.server.Now())})
	}
	setDay(29)
	if _, err := f.server.DB.Exec("CREATE TRIGGER fail_mood_outbox BEFORE INSERT ON outbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='mood test rollback'"); err != nil {
		t.Fatal(err)
	}
	failure := f.call(alice, "POST", "/checkins", platform.ID(), map[string]string{"mood": "happy", "expectedDate": "2026-10-29"})
	if _, err := f.server.DB.Exec("DROP TRIGGER fail_mood_outbox"); err != nil {
		t.Fatal(err)
	}
	if failure.status != 500 {
		t.Fatal("fault did not roll back", failure)
	}
	var revision, count int
	f.server.DB.QueryRow("SELECT checkin_revision FROM couples WHERE id=?", couple).Scan(&revision)
	f.server.DB.QueryRow("SELECT COUNT(*) FROM checkins WHERE couple_id=? AND business_date='2026-10-29'", couple).Scan(&count)
	if revision != 9 || count != 0 {
		t.Fatal("record/revision escaped rollback", revision, count)
	}
	setDay(30)
	concurrent := make(chan result, 2)
	for _, token := range []string{alice, bob} {
		wg.Add(1)
		go func(token string) {
			defer wg.Done()
			concurrent <- f.call(token, "POST", "/checkins", platform.ID(), map[string]string{"mood": "calm", "expectedDate": "2026-10-30"})
		}(token)
	}
	wg.Wait()
	close(concurrent)
	credited, bonuses := float64(0), float64(0)
	for response := range concurrent {
		if response.status != 200 {
			t.Fatal("concurrent partners could not sign in", response)
		}
		credited += response.body["total"].(float64)
		bonuses += response.body["doubleBonus"].(float64)
	}
	if credited != 30 || bonuses != 10 {
		t.Fatal("concurrent partners received a duplicate double reward", credited, bonuses)
	}
	if status := f.must(alice, "GET", "/home", nil)["checkin"].(map[string]any); status["revision"] != float64(11) || status["me"] != true || status["partner"] != true {
		t.Fatal("concurrent partners did not advance one revision per record", status)
	}
	// The first historical read must not promote an earlier partial month cache.
	f.clock.Store(time.Date(2026, 11, 1, 0, 0, 1, 0, platform.Beijing).UnixNano())
	sealed := month(alice)
	if sealed["businessDate"] != "2026-11-01" || days(sealed)[27].(map[string]any)["me"].(map[string]any)["mood"] != "irritated" {
		t.Fatal("sealed month incomplete or cached time frozen", sealed)
	}
	if ttl := cache.TTL(ctx, readCacheKey("checkin-history", couple)).Val(); ttl <= 71*time.Hour || ttl > stableCacheTTL {
		t.Fatal("history TTL", ttl)
	}
	f.server.Redis = cache
}
