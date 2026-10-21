package catalog

import (
	"context"
	"couple-mini/backend/internal/platform"
	"database/sql"
	"strings"
	"time"
	"unicode/utf8"
)

func Initialize(ctx context.Context, tx *sql.Tx, users ...string) error {
	for _, u := range users {
		if _, err := tx.ExecContext(ctx, "INSERT INTO stores VALUES (?,?)", platform.ID(), u); err != nil {
			return err
		}
	}
	return nil
}

type Product struct {
	ID          string    `json:"id"`
	OwnerID     string    `json:"ownerId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CoverID     string    `json:"coverId"`
	Price       int64     `json:"price"`
	Stock       int       `json:"stock"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
type Input struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CoverID     string `json:"coverId"`
	Price       string `json:"price"`
	Stock       *int   `json:"stock"`
}

const columns = "id,owner_id,name,description,cover_id,price,stock,created_at,updated_at"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Product, error) {
	var p Product
	err := row.Scan(&p.ID, &p.OwnerID, &p.Name, &p.Description, &p.CoverID, &p.Price, &p.Stock, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}
func Get(ctx context.Context, tx *sql.Tx, id, couple string) (Product, error) {
	p, err := scan(tx.QueryRowContext(ctx, "SELECT "+columns+" FROM products WHERE id=? AND owner_id IN (SELECT user_id FROM members WHERE couple_id=?)", id, couple))
	if err == sql.ErrNoRows {
		return p, platform.Fail(404, "NOT_FOUND", "商品不存在或无权查看")
	}
	return p, err
}
func List(ctx context.Context, tx *sql.Tx, owner string) ([]Product, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+columns+" FROM products WHERE owner_id=? ORDER BY created_at DESC,id DESC", owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Product{}
	for rows.Next() {
		p, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func Save(ctx context.Context, tx *sql.Tx, user, id, couple string, input Input, price int64, now time.Time) (Product, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || utf8.RuneCountInString(name) > 80 || utf8.RuneCountInString(input.Description) > 2000 {
		return Product{}, platform.Fail(422, "INVALID_PRODUCT", "名称须为 1–80 字，说明最多 2000 字")
	}
	if input.Stock == nil || *input.Stock < 0 || *input.Stock > 1000000 {
		return Product{}, platform.Fail(422, "INVALID_STOCK", "库存须为 0–1000000 的整数")
	}
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM media_files WHERE id=? AND owner_id=?", input.CoverID, user).Scan(&n); err != nil {
		return Product{}, err
	}
	if n != 1 {
		return Product{}, platform.Fail(422, "INVALID_COVER", "请先上传自己的商品封面")
	}
	if id == "" {
		id = platform.ID()
		if _, err := tx.ExecContext(ctx, "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)", id, user, name, input.Description, input.CoverID, price, *input.Stock, now, now); err != nil {
			return Product{}, err
		}
	} else {
		current, err := Get(ctx, tx, id, couple)
		if err != nil {
			return Product{}, err
		}
		if current.OwnerID != user {
			return Product{}, platform.Fail(403, "FORBIDDEN", "只能编辑自己的商品")
		}
		if _, err = tx.ExecContext(ctx, "UPDATE products SET name=?,description=?,cover_id=?,price=?,stock=?,updated_at=? WHERE id=?", name, input.Description, input.CoverID, price, *input.Stock, now, id); err != nil {
			return Product{}, err
		}
	}
	return Get(ctx, tx, id, couple)
}
func ChangeStock(ctx context.Context, tx *sql.Tx, id string, delta int, now time.Time) error {
	result, err := tx.ExecContext(ctx, "UPDATE products SET stock=stock+?,updated_at=? WHERE id=? AND stock+? >= 0", delta, now, id, delta)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return platform.Fail(409, "OUT_OF_STOCK", "刚刚没有库存了，请刷新商品")
	}
	return nil
}
func AddCart(ctx context.Context, tx *sql.Tx, user, couple, id string, now time.Time) (Product, error) {
	p, err := Get(ctx, tx, id, couple)
	if err != nil {
		return p, err
	}
	if p.OwnerID == user {
		return p, platform.Fail(403, "OWN_PRODUCT", "只能将伴侣的商品加入购物车")
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO cart_items VALUES (?,?,?) ON DUPLICATE KEY UPDATE product_id=product_id", user, id, now)
	return p, err
}
func RemoveCart(ctx context.Context, tx *sql.Tx, user, id string) error {
	_, err := tx.ExecContext(ctx, "DELETE FROM cart_items WHERE user_id=? AND product_id=?", user, id)
	return err
}
func Cart(ctx context.Context, tx *sql.Tx, user, couple string) ([]Product, error) {
	rows, err := tx.QueryContext(ctx, "SELECT p."+strings.ReplaceAll(columns, ",", ",p.")+" FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=? AND p.owner_id IN (SELECT user_id FROM members WHERE couple_id=?) ORDER BY c.added_at DESC,p.id DESC", user, couple)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Product{}
	for rows.Next() {
		p, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
