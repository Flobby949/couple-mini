package app

import (
	"context"
	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/points"
	"couple-mini/backend/internal/tasks"
	"database/sql"
	"github.com/gin-gonic/gin"
	"time"
)

func (s *Server) taskRoutes(a *gin.RouterGroup) {
	a.GET("/tasks", s.listTasks)
	a.POST("/tasks", s.saveTask)
	a.GET("/tasks/:id", s.task)
	a.POST("/tasks/:id", s.saveTask)
	a.POST("/tasks/:id/actions", s.taskAction)
	a.GET("/gifts/preview", s.giftPreview)
	a.GET("/gifts", s.gifts)
	a.POST("/gifts", s.give)
	a.GET("/gifts/:id", s.gift)
	a.GET("/pool/reservations", s.reservations)
}
func (s *Server) listTasks(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		kind, filter := c.DefaultQuery("kind", "partner"), c.DefaultQuery("filter", "active")
		load := func() (tasks.Page, error) {
			return tasks.List(ctx, tx, state.Couple.ID, state.Me.ID, kind, filter, c.Query("cursor"))
		}
		if c.Query("cursor") != "" {
			return load()
		}
		return cachedRead(s, ctx, readCacheKey("tasks", state.Couple.ID), "list:"+state.Me.ID+":"+kind+":"+filter, activityCacheTTL, load)
	})
}
func (s *Server) saveTask(c *gin.Context) {
	var body tasks.Input
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		state, err := identity.ReadContext(ctx, tx, user, now)
		if err != nil {
			return nil, err
		}
		receipt, err := tasks.Save(ctx, tx, couple.ID, user, state.Partner.ID, c.Param("id"), body, now)
		if err == nil {
			s.invalidateReadCache(ctx, couple.ID, "tasks")
		}
		return receipt, err
	})
}
func (s *Server) task(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		t, err := cachedRead(s, ctx, readCacheKey("tasks", state.Couple.ID), "id:"+state.Me.ID+":"+c.Param("id"), activityCacheTTL, func() (tasks.Task, error) {
			return tasks.Get(ctx, tx, state.Couple.ID, state.Me.ID, c.Param("id"))
		})
		if err != nil {
			return nil, err
		}
		history, err := cachedRead(s, ctx, readCacheKey("tasks", state.Couple.ID), "history:"+t.ID, activityCacheTTL, func() ([]tasks.History, error) {
			return tasks.Timeline(ctx, tx, t.ID)
		})
		if err != nil {
			return nil, err
		}
		preview, err := tasks.Preview(ctx, tx, t, *state.Couple.DailyLimit, state.ServerTime)
		if err != nil {
			return nil, err
		}
		balance, err := points.Balance(ctx, tx, state.Me.ID)
		return gin.H{"task": t, "history": history, "preview": preview, "balance": balance, "serverTime": state.ServerTime}, err
	})
}
func (s *Server) taskAction(c *gin.Context) {
	var body tasks.Action
	if err := bodyForWrite(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		receipt, err := tasks.Apply(ctx, tx, couple.ID, user, c.Param("id"), body, *couple.DailyLimit, now)
		if err == nil {
			s.invalidateReadCache(ctx, couple.ID, "tasks")
		}
		return receipt, err
	})
}
func (s *Server) giftPreview(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		return points.PreviewGift(ctx, tx, state.Couple.ID, state.Me.ID, *state.Couple.DailyLimit, state.ServerTime)
	})
}
func (s *Server) give(c *gin.Context) {
	var body struct {
		Amount string `json:"amount"`
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
		amount, err := points.Parse(body.Amount)
		if err != nil {
			return nil, err
		}
		gift, err := points.Give(ctx, tx, couple.ID, user, amount, *couple.DailyLimit, now)
		if err == nil {
			s.invalidateReadCache(ctx, couple.ID, "gifts")
		}
		return gift, err
	})
}
func (s *Server) gifts(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		gifts, err := cachedRead(s, ctx, readCacheKey("gifts", state.Couple.ID), "list", activityCacheTTL, func() ([]points.Gift, error) {
			return points.Gifts(ctx, tx, state.Couple.ID)
		})
		return gin.H{"items": gifts}, err
	})
}
func (s *Server) gift(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		g, err := cachedRead(s, ctx, readCacheKey("gift-details", state.Couple.ID), c.Param("id"), stableCacheTTL, func() (points.Gift, error) {
			var gift points.Gift
			err := tx.QueryRowContext(ctx, "SELECT id,sender_id,receiver_id,requested,actual,discarded,daily_limit,created_at FROM point_gifts WHERE id=? AND couple_id=?", c.Param("id"), state.Couple.ID).Scan(&gift.ID, &gift.SenderID, &gift.ReceiverID, &gift.Requested, &gift.Actual, &gift.Discarded, &gift.DailyLimit, &gift.CreatedAt)
			return gift, err
		})
		if err == sql.ErrNoRows {
			return nil, platform.Fail(404, "NOT_FOUND", "赠送记录不存在或无权查看")
		}
		return g, err
	})
}
func (s *Server) reservations(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		rows, err := tx.QueryContext(ctx, "SELECT t.id,t.name,t.kind,t.reward,r.amount,t.status FROM task_reservations r JOIN tasks t ON t.id=r.task_id WHERE r.couple_id=? AND r.status='active' ORDER BY t.created_at,t.id", state.Couple.ID)
		if err != nil {
			return nil, err
		}
		items := []gin.H{}
		for rows.Next() {
			var id, name, kind, status string
			var reward, amount int64
			if err = rows.Scan(&id, &name, &kind, &reward, &amount, &status); err != nil {
				rows.Close()
				return nil, err
			}
			items = append(items, gin.H{"taskId": id, "name": name, "kind": kind, "reward": reward, "amount": amount, "status": status})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
		rows, err = tx.QueryContext(ctx, "SELECT h.id,h.task_id,t.name,h.delta,h.reason,h.occurred_at FROM reservation_history h JOIN tasks t ON t.id=h.task_id WHERE h.couple_id=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 100", state.Couple.ID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		history := []gin.H{}
		for rows.Next() {
			var id, task, name, reason string
			var delta int64
			var at time.Time
			if err = rows.Scan(&id, &task, &name, &delta, &reason, &at); err != nil {
				return nil, err
			}
			history = append(history, gin.H{"id": id, "taskId": task, "name": name, "delta": delta, "reason": reason, "occurredAt": at})
		}
		return gin.H{"items": items, "history": history}, rows.Err()
	})
}
