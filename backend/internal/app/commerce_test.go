package app

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"time"

	"couple-mini/backend/internal/media"
	"couple-mini/backend/internal/platform"
)

func (f *fixture) upload(token string, data []byte) result {
	return f.uploadTo(token, "/media", data)
}
func (f *fixture) uploadTo(token, path string, data []byte) result {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	file, err := form.CreateFormFile("file", "cover.png")
	if err != nil {
		f.t.Fatal(err)
	}
	file.Write(data)
	form.Close()
	req := httptest.NewRequest("POST", "/api/v1"+path, &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, req)
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return result{w.Code, out, w.Body.String()}
}
func (f *fixture) image(token, id string) int {
	req := httptest.NewRequest("GET", "/api/v1/media/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, req)
	return w.Code
}
func testCommerce(f *fixture, buyer, seller, outsider, couple string) {
	t := f.t
	db := f.server.DB
	f.server.Config.MediaRoot = t.TempDir()
	me := f.must(buyer, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	partner := f.must(seller, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	if _, err := db.Exec("UPDATE accounts SET balance=CASE user_id WHEN ? THEN 100 ELSE 5 END WHERE user_id IN (?,?)", me, me, partner); err != nil {
		t.Fatal(err)
	}
	img := image.NewRGBA(image.Rect(0, 0, 40, 40))
	img.Set(1, 1, color.RGBA{R: 200, A: 255})
	var encoded bytes.Buffer
	png.Encode(&encoded, img)
	f.error(f.upload(outsider, encoded.Bytes()), 403, "BINDING_REQUIRED")
	f.error(f.upload(seller, []byte("not an image")), 422, "INVALID_IMAGE")
	for _, path := range []string{"/media", "/profile/avatar"} {
		for _, size := range []int{5<<20 + 1, 6<<20 + 1} {
			f.error(f.uploadTo(seller, path, bytes.Repeat([]byte{0}, size)), 413, "IMAGE_TOO_LARGE")
		}
	}
	upload := f.upload(seller, encoded.Bytes())
	if upload.status != 200 {
		t.Fatal(upload.raw)
	}
	cover := upload.body["fileId"].(string)
	stored, err := os.Stat(filepath.Join(f.server.Config.MediaRoot, cover))
	if err != nil {
		t.Fatal(err)
	}
	var size int
	if err := db.QueryRow("SELECT size_bytes FROM media_files WHERE id=?", cover).Scan(&size); err != nil {
		t.Fatal(err)
	}
	if size != int(stored.Size()) || upload.body["size"] != float64(size) || size > encoded.Len() || size > media.MaxBytes {
		t.Fatal("stored size differs from upload response or database", upload.body, size, stored.Size())
	}
	second := f.upload(seller, encoded.Bytes())
	if second.status != 200 {
		t.Fatal(second.raw)
	}
	newCover := second.body["fileId"].(string)
	if f.image(buyer, cover) != 200 || f.image(outsider, cover) != 404 || f.image(seller, "..") != 404 {
		t.Fatal("media access boundary")
	}
	productBody := func(name, price string, stock int, cover string) map[string]any {
		return map[string]any{"name": name, "price": price, "stock": stock, "coverId": cover, "description": "原来的兑现约定"}
	}
	f.error(f.call(buyer, "POST", "/products", platform.ID(), productBody("越权封面", "1", 1, cover)), 422, "INVALID_COVER")
	f.error(f.call(seller, "POST", "/products", platform.ID(), productBody("负数", "-0.1", 1, cover)), 422, "INVALID_POINTS")
	f.error(f.call(seller, "POST", "/products", platform.ID(), productBody("库存", "0", -1, cover)), 422, "INVALID_STOCK")
	if len(f.must(buyer, "GET", "/catalog", nil)["products"].([]any)) != 0 {
		t.Fatal("new store is not empty")
	}
	p := f.must(seller, "POST", "/products", productBody("一份心意", "21", 2, cover))
	id := p["id"].(string)
	testCatalogCache(f, buyer, seller, outsider, couple, partner, id)
	assertCatalog := func(name string, stock int, balance int64) {
		t.Helper()
		// Check detail before reloading the list can prewarm it again.
		detail := f.must(buyer, "GET", "/products/"+id, nil)
		productDetail := detail["product"].(map[string]any)
		if productDetail["name"] != name || productDetail["stock"] != float64(stock) || detail["balance"] != float64(balance) {
			t.Fatal("stale product detail or balance", detail)
		}
		listed := f.must(buyer, "GET", "/catalog", nil)
		products := listed["products"].([]any)
		if len(products) != 1 {
			t.Fatal("unexpected catalog", listed)
		}
		product := products[0].(map[string]any)
		if product["name"] != name || product["stock"] != float64(stock) || listed["balance"] != float64(balance) {
			t.Fatal("stale catalog or balance", listed)
		}
	}
	assertCatalog("一份心意", 2, 100)
	if len(f.must(outsider, "GET", "/context", nil)) == 0 {
		t.Fatal("outsider context unavailable")
	}
	f.error(f.call(seller, "POST", "/cart/"+id+"/add", platform.ID(), map[string]any{}), 403, "OWN_PRODUCT")
	f.must(buyer, "POST", "/cart/"+id+"/add", map[string]any{})
	f.must(buyer, "POST", "/cart/"+id+"/add", map[string]any{})
	cart := f.must(buyer, "GET", "/cart", nil)
	if len(cart["items"].([]any)) != 1 || cart["balance"] != float64(100) {
		t.Fatalf("cart reserved assets: %v", cart)
	}
	place := func(token, id, price, key string) result {
		return f.call(token, "POST", "/orders", key, map[string]string{"productId": id, "confirmedPrice": price})
	}
	action := func(token, id, name string) map[string]any {
		return f.must(token, "POST", "/orders/"+id+"/actions", map[string]string{"action": name})
	}
	detail := func(token, id string) map[string]any {
		return f.must(token, "GET", "/orders/"+id, nil)["order"].(map[string]any)
	}
	orderKey := platform.ID()
	placed := place(buyer, id, "21", orderKey)
	if placed.status != 200 {
		t.Fatal(placed.raw)
	}
	orderID := placed.body["orderId"].(string)
	if placed.body["buyerBalance"] != float64(79) {
		t.Fatal(placed.raw)
	}
	assertCatalog("一份心意", 1, 79)
	if len(f.must(buyer, "GET", "/cart", nil)["items"].([]any)) != 0 {
		t.Fatal("ordered candidate not removed")
	}
	f.error(f.call(buyer, "POST", "/orders/"+orderID+"/actions", platform.ID(), map[string]string{"action": "accept"}), 403, "FORBIDDEN")
	f.must(seller, "POST", "/products/"+id, productBody("后来改名", "100", 1, newCover))
	assertCatalog("后来改名", 1, 79)
	snapshot := detail(buyer, orderID)["snapshot"].(map[string]any)
	if snapshot["name"] != "一份心意" || snapshot["price"] != float64(21) || snapshot["coverId"] != cover || f.image(buyer, cover) != 200 {
		t.Fatalf("historical snapshot changed: %v", snapshot)
	}
	f.error(place(buyer, id, "21", platform.ID()), 409, "PRICE_CHANGED")
	var poolBefore int64
	db.QueryRow("SELECT available FROM pools WHERE couple_id=?", couple).Scan(&poolBefore)
	action(seller, orderID, "accept")
	cancelled := action(seller, orderID, "cancel")
	if cancelled["refunded"] != float64(21) || cancelled["penalty"] != float64(11) || cancelled["sellerBalance"] != float64(-6) || cancelled["buyerBalance"] != float64(100) {
		t.Fatal(cancelled)
	}
	assertCatalog("后来改名", 2, 100)
	var poolAfter int64
	db.QueryRow("SELECT available FROM pools WHERE couple_id=?", couple).Scan(&poolAfter)
	if poolAfter != poolBefore+11 {
		t.Fatal("penalty did not enter pool once")
	}
	replay := place(buyer, id, "21", orderKey)
	if replay.status != 200 || replay.body["charged"] != float64(21) || detail(buyer, orderID)["status"] != "cancelled" {
		t.Fatal("historical receipt overwritten")
	}
	// A zero-balance user may buy a free product, but a negative balance cannot.
	free := f.must(seller, "POST", "/products", productBody("零积分", "0", 1, cover))["id"].(string)
	db.Exec("UPDATE accounts SET balance=-1 WHERE user_id=?", me)
	f.error(place(buyer, free, "0", platform.ID()), 409, "NEGATIVE_BALANCE")
	db.Exec("UPDATE accounts SET balance=0 WHERE user_id=?", me)
	var wg sync.WaitGroup
	results := make(chan result, 8)
	key := platform.ID()
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- place(buyer, free, "0", key) }()
	}
	wg.Wait()
	close(results)
	freeOrder := ""
	for r := range results {
		if r.status != 200 {
			t.Fatal(r.raw)
		}
		if freeOrder != "" && freeOrder != r.body["orderId"] {
			t.Fatal("duplicate orders")
		}
		freeOrder = r.body["orderId"].(string)
	}
	f.error(place(buyer, free, "0", platform.ID()), 409, "OUT_OF_STOCK")
	action(seller, freeOrder, "reject")
	if detail(buyer, freeOrder)["status"] != "rejected" {
		t.Fatal("refusal failed")
	}
	// Distinct intents still cannot oversell the last unit.
	results = make(chan result, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- place(buyer, free, "0", platform.ID()) }()
	}
	wg.Wait()
	close(results)
	successes := 0
	for r := range results {
		if r.status == 200 {
			successes++
			freeOrder = r.body["orderId"].(string)
		} else {
			f.error(r, 409, "OUT_OF_STOCK")
		}
	}
	if successes != 1 {
		t.Fatal("oversold")
	}
	action(buyer, freeOrder, "cancel")
	// Cancellation holds awaiting-receipt orders, then resets the full 72-hour window.
	r := place(buyer, free, "0", platform.ID())
	if r.status != 200 {
		t.Fatal(r.raw)
	}
	held := r.body["orderId"].(string)
	action(seller, held, "accept")
	action(seller, held, "fulfill")
	action(buyer, held, "request_cancel")
	f.error(f.call(seller, "POST", "/orders/"+held+"/actions", platform.ID(), map[string]string{"action": "fulfill"}), 409, "ORDER_STATE_CHANGED")
	f.clock.Add(int64(4 * 24 * time.Hour))
	if err := f.server.SettleDue(context.Background()); err != nil {
		t.Fatal(err)
	}
	heldState := detail(buyer, held)
	if heldState["status"] != "awaiting_receipt" || heldState["autoConfirmAt"] != nil || heldState["cancelPending"] != true {
		t.Fatal(heldState)
	}
	action(seller, held, "deny_cancel")
	deadline := f.server.Now().Add(72 * time.Hour)
	renewed := detail(buyer, held)
	parsed, err := time.Parse(time.RFC3339Nano, renewed["autoConfirmAt"].(string))
	if err != nil || !parsed.Equal(deadline) {
		t.Fatal("did not renew deadline")
	}
	f.clock.Store(deadline.Add(-time.Microsecond).UnixNano())
	if detail(buyer, held)["status"] != "awaiting_receipt" {
		t.Fatal("completed early")
	}
	f.clock.Store(deadline.UnixNano())
	f.error(f.call(seller, "POST", "/orders/"+held+"/actions", platform.ID(), map[string]string{"action": "cancel"}), 409, "ORDER_STATE_CHANGED")
	if detail(buyer, held)["endedReason"] != "auto_confirmed" {
		t.Fatal("failed action rolled back due completion")
	}
	if err = f.server.SettleDue(context.Background()); err != nil {
		t.Fatal(err)
	}
	var n int
	db.QueryRow("SELECT COUNT(*) FROM order_history WHERE order_id=? AND action='auto_confirm'", held).Scan(&n)
	if n != 1 {
		t.Fatal("duplicate auto confirmation")
	}
	// Rejected fulfillment invalidates its old timer; a later submission starts a new one.
	f.must(seller, "POST", "/products/"+free, productBody("零积分", "0", 2, cover))
	r = place(buyer, free, "0", platform.ID())
	rework := r.body["orderId"].(string)
	action(seller, rework, "accept")
	action(seller, rework, "fulfill")
	action(buyer, rework, "reject_fulfillment")
	f.clock.Add(int64(4 * 24 * time.Hour))
	if detail(buyer, rework)["status"] != "fulfilling" {
		t.Fatal("old timer survived rejection")
	}
	action(seller, rework, "fulfill")
	action(buyer, rework, "request_cancel")
	approved := action(seller, rework, "approve_cancel")
	if approved["penalty"] != float64(0) || detail(buyer, rework)["status"] != "cancelled" {
		t.Fatal("approved cancellation penalized seller")
	}
	r = place(buyer, free, "0", platform.ID())
	normal := r.body["orderId"].(string)
	action(seller, normal, "accept")
	action(seller, normal, "fulfill")
	action(buyer, normal, "confirm")
	stock := f.must(buyer, "GET", "/products/"+free, nil)["product"].(map[string]any)["stock"]
	if stock != float64(1) || detail(buyer, normal)["status"] != "completed" {
		t.Fatal("completion restored inventory")
	}
	// No account or inventory mutation may survive a failed order outbox insert.
	if _, err = db.Exec("CREATE TRIGGER fail_order_event BEFORE INSERT ON outbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test order failure'"); err != nil {
		t.Fatal(err)
	}
	failed := place(buyer, free, "0", platform.ID())
	if failed.status != 500 {
		t.Fatal(failed.raw)
	}
	if _, err = db.Exec("DROP TRIGGER fail_order_event"); err != nil {
		t.Fatal(err)
	}
	if f.must(buyer, "GET", "/products/"+free, nil)["product"].(map[string]any)["stock"] != stock {
		t.Fatal("failed order consumed inventory")
	}
	if len(f.must(buyer, "GET", "/orders?role=buyer", nil)["items"].([]any)) < 5 {
		t.Fatal("order history missing")
	}
	if len(f.must(seller, "GET", "/points/history", nil)["entries"].([]any)) < 1 {
		t.Fatal("penalty ledger missing")
	}
	t.Log("commerce: bounded media, snapshots, carts, concurrent stock, refund/penalty, cancellation holds and strict auto-confirm verified")
}
