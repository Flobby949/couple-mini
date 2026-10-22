package app

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

func testCatalogCache(f *fixture, buyer, seller, outsider, couple, owner, product string) {
	t := f.t
	ctx := context.Background()
	key := catalogCacheKey(couple)
	t.Cleanup(func() { f.server.Redis.Del(ctx, key) })
	f.error(f.call(outsider, "GET", "/catalog", "", nil), 403, "BINDING_REQUIRED")
	f.error(f.call(buyer, "GET", "/catalog?view=invalid", "", nil), 422, "INVALID_FILTER")
	// A list from the previous cache format must not bypass detail warmup.
	if err := f.server.Redis.HSet(ctx, key, owner, "[]").Err(); err != nil {
		t.Fatal(err)
	}
	if err := f.server.Redis.Expire(ctx, key, catalogCacheTTL).Err(); err != nil {
		t.Fatal(err)
	}
	listed := f.must(buyer, "GET", "/catalog", nil)
	if listed["ownerId"] != owner || len(listed["products"].([]any)) != 1 {
		t.Fatal("wrong store", listed)
	}
	// A hit must work without a SQL transaction: it cannot query products again.
	products, err := f.server.cachedProducts(ctx, nil, couple, owner)
	if err != nil || len(products) != 1 || products[0].ID != product {
		t.Fatal("catalog cache miss after warming", products, err)
	}
	// The first detail request must already hit a cache populated by the list.
	detail, err := f.server.cachedProduct(ctx, nil, couple, product)
	if err != nil || detail != products[0] {
		t.Fatal("list did not prewarm product detail", detail, err)
	}
	if f.must(buyer, "GET", "/products/"+product, nil)["balance"] != float64(100) || f.must(seller, "GET", "/products/"+product, nil)["balance"] != float64(5) {
		t.Fatal("shared product detail cached a viewer's balance")
	}
	ttl, err := f.server.Redis.TTL(ctx, key).Result()
	if err != nil || ttl <= 0 || ttl > catalogCacheTTL {
		t.Fatal("catalog cache must expire", ttl, err)
	}
	if err = f.server.Redis.Expire(ctx, key, 15*time.Second).Err(); err != nil {
		t.Fatal(err)
	}
	if len(f.must(buyer, "GET", "/catalog?view=mine", nil)["products"].([]any)) != 0 {
		t.Fatal("store owners share cached products")
	}
	ttl, err = f.server.Redis.TTL(ctx, key).Result()
	if err != nil || ttl <= 0 || ttl > 15*time.Second {
		t.Fatal("reading another store extended the cache lifetime", ttl, err)
	}
	// Empty stores are cacheable too, and both views address the same owner's data.
	buyerID := f.must(buyer, "GET", "/context", nil)["me"].(map[string]any)["id"].(string)
	products, err = f.server.cachedProducts(ctx, nil, couple, buyerID)
	if err != nil || products == nil || len(products) != 0 {
		t.Fatal("empty catalog was not cached", products, err)
	}
	f.must(seller, "GET", "/catalog?view=mine", nil)
	if err = f.server.Redis.HSet(ctx, key, "list:"+owner, "invalid JSON").Err(); err != nil {
		t.Fatal(err)
	}
	f.must(buyer, "GET", "/catalog", nil)
	if products, err = f.server.cachedProducts(ctx, nil, couple, owner); err != nil || len(products) != 1 {
		t.Fatal("corrupt cache did not recover", products, err)
	}
	ttl, err = f.server.Redis.TTL(ctx, key).Result()
	if err != nil || ttl <= 0 || ttl > 15*time.Second {
		t.Fatal("detail warmup extended the cache lifetime", ttl, err)
	}
	if err = f.server.Redis.Expire(ctx, key, -time.Second).Err(); err != nil {
		t.Fatal(err)
	}
	f.must(buyer, "GET", "/catalog", nil)
	if products, err = f.server.cachedProducts(ctx, nil, couple, owner); err != nil || len(products) != 1 {
		t.Fatal("expired cache did not reload", products, err)
	}
	if detail, err = f.server.cachedProduct(ctx, nil, couple, product); err != nil || detail.ID != product {
		t.Fatal("expired list did not prewarm details again", detail, err)
	}
	// A deep link loads one product without having to load the store list.
	f.server.invalidateCatalog(ctx, couple)
	loaded := f.must(buyer, "GET", "/products/"+product, nil)["product"].(map[string]any)
	if loaded["id"] != product || f.server.Redis.HExists(ctx, key, "list:"+owner).Val() {
		t.Fatal("direct detail unexpectedly loaded the catalog", loaded)
	}
	if detail, err = f.server.cachedProduct(ctx, nil, couple, product); err != nil || detail.ID != product {
		t.Fatal("direct detail request did not fill the cache", detail, err)
	}
	if err = f.server.Redis.HSet(ctx, key, "product:"+product, "invalid JSON").Err(); err != nil {
		t.Fatal(err)
	}
	f.must(buyer, "GET", "/products/"+product, nil)
	if detail, err = f.server.cachedProduct(ctx, nil, couple, product); err != nil || detail.ID != product {
		t.Fatal("corrupt detail cache did not recover", detail, err)
	}
	f.error(f.call("", "GET", "/products/"+product, "", nil), 401, "UNAUTHENTICATED")
	f.error(f.call(outsider, "GET", "/products/"+product, "", nil), 403, "BINDING_REQUIRED")
	f.error(f.call(buyer, "GET", "/products/missing-product", "", nil), 404, "NOT_FOUND")
	if f.server.Redis.HExists(ctx, key, "product:missing-product").Val() {
		t.Fatal("missing product was cached")
	}
	// Cache failures must not prevent a database-backed catalog response.
	cache := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	cache.Close()
	uncached := &Server{Redis: cache}
	tx, err := f.server.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	products, err = uncached.cachedProducts(ctx, tx, couple, owner)
	if err != nil || len(products) != 1 || products[0].ID != product {
		t.Fatal("cache failure prevented catalog read", products, err)
	}
	detail, err = uncached.cachedProduct(ctx, tx, couple, product)
	if err != nil || detail.ID != product {
		t.Fatal("cache failure prevented product read", detail, err)
	}
}
