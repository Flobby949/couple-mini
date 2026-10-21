package app

import (
	"context"
	"database/sql"
	"io"
	"os"
	"strings"
	"time"

	"couple-mini/backend/internal/catalog"
	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/media"
	"couple-mini/backend/internal/orders"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/points"
	"github.com/gin-gonic/gin"
)

func (s *Server) commerceRoutes(a *gin.RouterGroup) {
	a.POST("/media", s.uploadMedia)
	a.GET("/media/:id", s.readMedia)
	a.GET("/catalog", s.listProducts)
	a.GET("/products/:id", s.product)
	a.POST("/products", s.saveProduct)
	a.POST("/products/:id", s.saveProduct)
	a.GET("/cart", s.cart)
	a.POST("/cart/:id/add", s.cartChange)
	a.POST("/cart/:id/remove", s.cartChange)
	a.POST("/orders", s.placeOrder)
	a.GET("/orders", s.listOrders)
	a.GET("/orders/:id", s.order)
	a.POST("/orders/:id/actions", s.orderAction)
	a.GET("/points/history", s.accountHistory)
}
func bodyForWrite(c *gin.Context, out any) error {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return platform.Fail(400, "INVALID_BODY", "请求内容过大")
	}
	c.Request.Body = io.NopCloser(strings.NewReader(string(raw)))
	err = decode(c, out)
	c.Request.Body = io.NopCloser(strings.NewReader(string(raw)))
	return err
}
func (s *Server) listProducts(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		owner := state.Partner.ID
		if c.Query("view") == "mine" {
			owner = state.Me.ID
		} else if c.Query("view") != "" && c.Query("view") != "partner" {
			return nil, platform.Fail(422, "INVALID_FILTER", "小店视角无效")
		}
		products, err := catalog.List(ctx, tx, owner)
		if err != nil {
			return nil, err
		}
		balance, err := points.Balance(ctx, tx, state.Me.ID)
		return gin.H{"products": products, "ownerId": owner, "balance": balance}, err
	})
}
func (s *Server) product(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		p, err := catalog.Get(ctx, tx, c.Param("id"), state.Couple.ID)
		if err != nil {
			return nil, err
		}
		balance, err := points.Balance(ctx, tx, state.Me.ID)
		return gin.H{"product": p, "balance": balance}, err
	})
}
func (s *Server) saveProduct(c *gin.Context) {
	var body catalog.Input
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		price, err := points.Parse(body.Price)
		if err != nil {
			return nil, err
		}
		return catalog.Save(ctx, tx, user, c.Param("id"), couple.ID, body, price, now)
	})
}
func (s *Server) cart(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		items, err := catalog.Cart(ctx, tx, state.Me.ID, state.Couple.ID)
		if err != nil {
			return nil, err
		}
		balance, err := points.Balance(ctx, tx, state.Me.ID)
		return gin.H{"items": items, "balance": balance}, err
	})
}
func (s *Server) cartChange(c *gin.Context) {
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		if strings.HasSuffix(c.Request.URL.Path, "/remove") {
			return gin.H{"removed": c.Param("id")}, catalog.RemoveCart(ctx, tx, user, c.Param("id"))
		}
		return catalog.AddCart(ctx, tx, user, couple.ID, c.Param("id"), now)
	})
}
func (s *Server) placeOrder(c *gin.Context) {
	var body struct {
		ProductID      string `json:"productId"`
		ConfirmedPrice string `json:"confirmedPrice"`
	}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		price, err := points.Parse(body.ConfirmedPrice)
		if err != nil {
			return nil, err
		}
		return orders.Place(ctx, tx, couple.ID, user, body.ProductID, price, now)
	})
}
func (s *Server) listOrders(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		role := c.DefaultQuery("role", "buyer")
		return orders.List(ctx, tx, state.Couple.ID, state.Me.ID, role, c.Query("status"), c.Query("cursor"))
	})
}
func (s *Server) order(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		o, err := orders.Get(ctx, tx, state.Couple.ID, state.Me.ID, c.Param("id"))
		if err != nil {
			return nil, err
		}
		history, err := orders.Timeline(ctx, tx, o.ID)
		if err != nil {
			return nil, err
		}
		balance, err := points.Balance(ctx, tx, state.Me.ID)
		return gin.H{"order": o, "history": history, "balance": balance, "serverTime": state.ServerTime}, err
	})
}
func (s *Server) orderAction(c *gin.Context) {
	var body struct {
		Action string `json:"action"`
	}
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		return orders.Apply(ctx, tx, couple.ID, user, c.Param("id"), body.Action, now)
	})
}
func (s *Server) accountHistory(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		rows, err := tx.QueryContext(ctx, "SELECT id,order_id,reason,amount,balance_after,created_at FROM account_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100", state.Me.ID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []gin.H{}
		for rows.Next() {
			var id, order, reason string
			var amount, balance int64
			var at time.Time
			if err = rows.Scan(&id, &order, &reason, &amount, &balance, &at); err != nil {
				return nil, err
			}
			out = append(out, gin.H{"id": id, "orderId": order, "reason": reason, "amount": amount, "balanceAfter": balance, "createdAt": at})
		}
		return gin.H{"entries": out}, rows.Err()
	})
}

func (s *Server) uploadMedia(c *gin.Context) {
	if s.Config.MediaRoot == "" {
		s.fail(c, platform.Fail(503, "MEDIA_NOT_CONFIGURED", "尚未配置图片存储"))
		return
	}
	// Authorize before parsing an image; no database lock is held during CPU or file work.
	tx, _, err := s.beginRelation(c.Request.Context(), c.GetString("user"), nil)
	if err != nil {
		s.fail(c, err)
		return
	}
	_, err = identity.LockCouple(c.Request.Context(), tx, c.GetString("user"), true)
	tx.Rollback()
	if err != nil {
		s.fail(c, err)
		return
	}
	file, err := c.FormFile("file")
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	if err != nil {
		s.fail(c, platform.Fail(422, "INVALID_IMAGE", "请选择一张 PNG 或 JPEG 图片，大小不超过 5 MiB"))
		return
	}
	if file.Size > media.MaxBytes {
		s.fail(c, platform.Fail(413, "IMAGE_TOO_LARGE", "图片不能超过 5 MiB"))
		return
	}
	reader, err := file.Open()
	if err != nil {
		s.fail(c, err)
		return
	}
	defer reader.Close()
	stored, err := media.Store(s.Config.MediaRoot, reader)
	if err != nil {
		s.fail(c, err)
		return
	}
	path, _ := media.Path(s.Config.MediaRoot, stored.ID)
	tx, now, err := s.beginRelation(c.Request.Context(), c.GetString("user"), nil)
	if err != nil {
		os.Remove(path)
		s.fail(c, err)
		return
	}
	defer tx.Rollback()
	err = media.Register(c.Request.Context(), tx, c.GetString("user"), stored, now)
	if err != nil {
		os.Remove(path)
		s.fail(c, err)
		return
	}
	// An ambiguous commit must not remove a file whose metadata may be durable.
	if err = tx.Commit(); err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, stored)
}
func (s *Server) readMedia(c *gin.Context) {
	f, err := media.Authorized(c.Request.Context(), s.DB, c.GetString("user"), c.Param("id"))
	if err != nil {
		s.fail(c, err)
		return
	}
	path, err := media.Path(s.Config.MediaRoot, f.ID)
	if err != nil {
		s.fail(c, err)
		return
	}
	if _, err = os.Stat(path); err != nil {
		s.fail(c, platform.Fail(503, "MEDIA_UNAVAILABLE", "图片暂时无法读取，请重试"))
		return
	}
	c.Header("Content-Type", f.MIME)
	c.Header("X-Content-Type-Options", "nosniff")
	c.File(path)
}

// Locks precede the shared business timestamp. A due transition is committed before
// the caller's savepoint, so rejecting the user's next action cannot undo it.
func (s *Server) beginRelation(ctx context.Context, user string, users []string) (*sql.Tx, time.Time, error) {
	for {
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return nil, time.Time{}, err
		}
		if len(users) > 0 {
			if err = identity.LockUsers(ctx, tx, users...); err != nil {
				tx.Rollback()
				return nil, time.Time{}, err
			}
		}
		couple, err := identity.LockCouple(ctx, tx, user, false)
		if e, ok := err.(*platform.Error); ok && e.Code == "BINDING_REQUIRED" {
			return tx, s.Now().UTC(), nil
		}
		if err != nil {
			tx.Rollback()
			return nil, time.Time{}, err
		}
		now := s.Now().UTC()
		count, err := orders.SettleDue(ctx, tx, couple.ID, now)
		if err != nil {
			tx.Rollback()
			return nil, time.Time{}, err
		}
		if count == 0 {
			return tx, now, nil
		}
		if err = tx.Commit(); err != nil {
			return nil, time.Time{}, err
		}
	}
}
func (s *Server) SettleOrders(ctx context.Context) error {
	rows, err := s.DB.QueryContext(ctx, "SELECT DISTINCT couple_id FROM orders WHERE status=? AND cancel_pending=FALSE AND auto_confirm_at<=?", orders.Awaiting, s.Now().UTC())
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		var found string
		err = tx.QueryRowContext(ctx, "SELECT id FROM couples WHERE id=? FOR UPDATE", id).Scan(&found)
		if err == nil {
			_, err = orders.SettleDue(ctx, tx, id, s.Now().UTC())
		}
		if err == nil {
			err = tx.Commit()
		}
		tx.Rollback()
		if err != nil {
			return err
		}
	}
	return nil
}
