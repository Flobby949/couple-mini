package platform

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"fmt"
	"time"
)

func ID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func Hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

var Beijing = time.FixedZone("Asia/Shanghai", 8*60*60)

func Date(t time.Time) string { return t.In(Beijing).Format("2006-01-02") }

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"-"`
}

func (e *Error) Error() string                    { return e.Message }
func Fail(status int, code, message string) error { return &Error{code, message, status} }

// Migrations run under a MySQL advisory lock on a dedicated connection.
func Migrate(ctx context.Context, db *sql.DB, files embed.FS) error {
	c, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer c.Close()
	var locked int
	if err = c.QueryRowContext(ctx, "SELECT GET_LOCK('couple_mini_migration', 10)").Scan(&locked); err != nil {
		return err
	}
	if locked != 1 {
		return fmt.Errorf("migration lock unavailable")
	}
	defer c.ExecContext(context.Background(), "SELECT RELEASE_LOCK('couple_mini_migration')")
	if _, err = c.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME(6) NOT NULL)`); err != nil {
		return err
	}
	entries, err := files.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, f := range entries {
		var n int
		if err = c.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", f.Name()).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		data, err := files.ReadFile("migrations/" + f.Name())
		if err != nil {
			return err
		}
		// MySQL DDL commits implicitly: each version is recorded only after all statements succeed.
		for _, statement := range splitSQL(string(data)) {
			if _, err = c.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("migration %s: %w", f.Name(), err)
			}
		}
		if _, err = c.ExecContext(ctx, "INSERT INTO schema_migrations VALUES (?,?)", f.Name(), time.Now().UTC()); err != nil {
			return err
		}
	}
	return nil
}
