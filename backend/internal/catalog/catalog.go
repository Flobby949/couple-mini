package catalog

import (
	"context"
	"couple-mini/backend/internal/platform"
	"database/sql"
)

func Initialize(ctx context.Context, tx *sql.Tx, users ...string) error {
	for _, u := range users {
		if _, err := tx.ExecContext(ctx, "INSERT INTO stores VALUES (?,?)", platform.ID(), u); err != nil {
			return err
		}
	}
	return nil
}
