package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"couple-mini/backend/internal/catalog"
	"couple-mini/backend/internal/checkin"
	"couple-mini/backend/internal/eventbus"
	"couple-mini/backend/internal/identity"
	"couple-mini/backend/internal/notifications"
	"couple-mini/backend/internal/orders"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/points"
	"couple-mini/backend/internal/rules"
	"couple-mini/backend/internal/tasks"
	"couple-mini/backend/internal/wechat"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type Config struct {
	Env, Address, DSN, RedisAddress, RedisPassword, WechatID, WechatSecret, Origin, MediaRoot string
	DevLogin                                                                                  bool
	MiniProgramState                                                                          string
}
type Server struct {
	DB                   *sql.DB
	Redis                *redis.Client
	Config               Config
	Now                  func() time.Time
	Client               *http.Client
	NotificationMappings notifications.Mappings
	Wechat               *wechat.Client
}
type mutation func(context.Context, *sql.Tx, string, time.Time) (any, error)

var operationKey = regexp.MustCompile(`^[A-Za-z0-9_-]{16,80}$`)
var developmentID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(eventbus.WithCapture(c.Request.Context(), notifications.Capture))
		c.Next()
	})
	r.Use(func(c *gin.Context) {
		c.Header("X-Request-ID", platform.ID())
		c.Header("Cache-Control", "no-store")
		if s.Config.Origin != "" && c.GetHeader("Origin") == s.Config.Origin {
			c.Header("Access-Control-Allow-Origin", s.Config.Origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key")
			c.Header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		}
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		limit := int64(16 << 10)
		if c.Request.URL.Path == "/api/v1/media" || c.Request.URL.Path == "/api/v1/profile/avatar" {
			limit = 6 << 20
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	})
	r.GET("/health/live", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	r.GET("/health/ready", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if s.DB.PingContext(ctx) != nil || s.Redis.Ping(ctx).Err() != nil {
			c.JSON(503, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(200, gin.H{"status": "ready"})
	})
	r.POST("/api/v1/login", s.login)
	a := r.Group("/api/v1", s.authenticate)
	a.GET("/context", s.readContext)
	a.POST("/profile", s.saveProfile)
	a.POST("/profile/avatar", s.uploadAvatar)
	a.GET("/home", s.home)
	a.GET("/rules", s.listRules)
	a.GET("/history", s.history)
	a.GET("/operations/:key", s.operation)
	a.POST("/operations/:key/close", s.closeOperation)
	a.POST("/invitations", func(c *gin.Context) {
		s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
			return identity.Invite(ctx, tx, user, now)
		})
	})
	a.POST("/binding", s.bind)
	a.POST("/rules", s.propose)
	a.POST("/rules/:id/confirm", s.confirm)
	a.POST("/checkins", s.checkin)
	s.commerceRoutes(a)
	s.taskRoutes(a)
	s.notificationRoutes(a)
	return r
}

func (s *Server) fail(c *gin.Context, err error) {
	var e *platform.Error
	if errors.As(err, &e) {
		c.JSON(e.Status, gin.H{"error": e})
		return
	}
	slog.Error("request failed", "requestId", c.Writer.Header().Get("X-Request-ID"), "error", err)
	c.JSON(500, gin.H{"error": gin.H{"code": "INTERNAL", "message": "服务暂时不可用，请稍后核查操作结果"}})
}
func decode(c *gin.Context, out any) error {
	d := json.NewDecoder(c.Request.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(out); err != nil {
		return platform.Fail(400, "INVALID_BODY", "请求格式不正确")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return platform.Fail(400, "INVALID_BODY", "请求只能包含一个 JSON 对象")
	}
	return nil
}
func (s *Server) authenticate(c *gin.Context) {
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if !strings.HasPrefix(c.GetHeader("Authorization"), "Bearer ") || len(token) != 64 {
		s.fail(c, platform.Fail(401, "UNAUTHENTICATED", "请重新登录"))
		c.Abort()
		return
	}
	user, err := s.Redis.Get(c.Request.Context(), "couple:session:"+platform.Hash(token)).Result()
	if err == redis.Nil {
		s.fail(c, platform.Fail(401, "UNAUTHENTICATED", "登录已过期，请重新登录"))
		c.Abort()
		return
	}
	if err != nil {
		s.fail(c, err)
		c.Abort()
		return
	}
	c.Set("user", user)
	c.Next()
}
func (s *Server) login(c *gin.Context) {
	var body struct {
		Code        string `json:"code"`
		DevIdentity string `json:"devIdentity"`
	}
	if err := decode(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	openid, nickname := "", "微信用户"
	if body.DevIdentity != "" {
		if !s.Config.DevLogin || s.Config.Env != "development" {
			s.fail(c, platform.Fail(403, "DEV_LOGIN_DISABLED", "本环境不支持开发登录"))
			return
		}
		if !developmentID.MatchString(body.DevIdentity) {
			s.fail(c, platform.Fail(422, "INVALID_IDENTITY", "开发身份格式不正确"))
			return
		}
		openid = "dev:" + body.DevIdentity
		nickname = "开发用户 " + body.DevIdentity
	} else {
		if body.Code == "" || len(body.Code) > 256 {
			s.fail(c, platform.Fail(422, "LOGIN_CODE_REQUIRED", "请提供微信登录凭证"))
			return
		}
		if s.Config.WechatID == "" || s.Config.WechatSecret == "" {
			s.fail(c, platform.Fail(503, "WECHAT_NOT_CONFIGURED", "尚未配置微信登录，请联系开发者"))
			return
		}
		query := url.Values{"appid": {s.Config.WechatID}, "secret": {s.Config.WechatSecret}, "js_code": {body.Code}, "grant_type": {"authorization_code"}}
		req, err := http.NewRequestWithContext(c.Request.Context(), "GET", "https://api.weixin.qq.com/sns/jscode2session?"+query.Encode(), nil)
		if err != nil {
			s.fail(c, err)
			return
		}
		response, err := s.Client.Do(req)
		if err != nil {
			s.fail(c, platform.Fail(502, "WECHAT_LOGIN_FAILED", "微信登录暂不可用，请重试"))
			return
		}
		defer response.Body.Close()
		var result struct {
			OpenID  string `json:"openid"`
			ErrCode int    `json:"errcode"`
		}
		if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 8192)).Decode(&result) != nil || result.ErrCode != 0 || result.OpenID == "" {
			s.fail(c, platform.Fail(401, "WECHAT_LOGIN_FAILED", "微信登录凭证无效，请重试"))
			return
		}
		openid = result.OpenID
	}
	user, err := identity.Login(c.Request.Context(), s.DB, openid, nickname, s.Now())
	if err != nil {
		s.fail(c, err)
		return
	}
	token := platform.ID() + platform.ID()
	expires := s.Now().Add(7 * 24 * time.Hour)
	if err = s.Redis.Set(c.Request.Context(), "couple:session:"+platform.Hash(token), user.ID, 7*24*time.Hour).Err(); err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"token": token, "expiresAt": expires, "user": user})
}

// Every actor's writes and close requests share this user-row arbitration lock.
// Binding additionally locks both users in sorted order before touching the invitation.
// Bound requests acquire the relationship first, avoiding partner foreign-key lock cycles.
func (s *Server) write(c *gin.Context, extraUsers []string, fn mutation) {
	key := c.GetHeader("Idempotency-Key")
	if !operationKey.MatchString(key) {
		s.fail(c, platform.Fail(400, "IDEMPOTENCY_KEY_REQUIRED", "缺少有效的操作标识"))
		return
	}
	user := c.GetString("user")
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		s.fail(c, platform.Fail(400, "INVALID_BODY", "请求内容过大"))
		return
	}
	var canonical any
	if len(raw) > 0 {
		if err = json.Unmarshal(raw, &canonical); err != nil {
			s.fail(c, platform.Fail(400, "INVALID_BODY", "请求格式不正确"))
			return
		}
	}
	normalized, _ := json.Marshal(canonical)
	hash := platform.Hash(c.Request.Method + " " + c.Request.URL.Path + " " + string(normalized))
	ctx := c.Request.Context()
	tx, _, now, err := s.beginRelation(ctx, user, append(extraUsers, user))
	if err != nil {
		s.fail(c, err)
		return
	}
	defer tx.Rollback()
	var existingHash, status string
	var httpStatus int
	var response []byte
	err = tx.QueryRowContext(ctx, "SELECT request_hash,status,http_status,response FROM operations WHERE actor_id=? AND operation_key=?", user, key).Scan(&existingHash, &status, &httpStatus, &response)
	if err == nil {
		if status != "closed" && existingHash != hash {
			s.fail(c, platform.Fail(409, "IDEMPOTENCY_CONFLICT", "本次操作内容与原请求不一致"))
			return
		}
		c.Data(httpStatus, "application/json", response)
		return
	}
	if err != sql.ErrNoRows {
		s.fail(c, err)
		return
	}
	if _, err = tx.ExecContext(ctx, "SAVEPOINT business"); err != nil {
		s.fail(c, err)
		return
	}
	result, businessErr := fn(ctx, tx, user, now)
	httpStatus = 200
	status = "succeeded"
	if businessErr != nil {
		var e *platform.Error
		if !errors.As(businessErr, &e) {
			s.fail(c, businessErr)
			return
		}
		if _, err = tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT business"); err != nil {
			s.fail(c, err)
			return
		}
		httpStatus = e.Status
		status = "rejected"
		result = gin.H{"error": e}
	}
	response, err = json.Marshal(result)
	if err != nil {
		s.fail(c, err)
		return
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO operations VALUES (?,?,?,?,?,?,?)", user, key, hash, status, httpStatus, response, now); err != nil {
		s.fail(c, err)
		return
	}
	if err = tx.Commit(); err != nil {
		s.fail(c, err)
		return
	}
	c.Data(httpStatus, "application/json", response)
}
func (s *Server) operation(c *gin.Context) {
	key := c.Param("key")
	if !operationKey.MatchString(key) {
		s.fail(c, platform.Fail(400, "INVALID_OPERATION", "操作标识无效"))
		return
	}
	var status string
	var httpStatus int
	var response json.RawMessage
	err := s.DB.QueryRowContext(c.Request.Context(), "SELECT status,http_status,response FROM operations WHERE actor_id=? AND operation_key=?", c.GetString("user"), key).Scan(&status, &httpStatus, &response)
	if err == sql.ErrNoRows {
		c.JSON(200, gin.H{"status": "absent"})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"status": status, "httpStatus": httpStatus, "response": response})
}
func (s *Server) closeOperation(c *gin.Context) {
	key := c.Param("key")
	if !operationKey.MatchString(key) {
		s.fail(c, platform.Fail(400, "INVALID_OPERATION", "操作标识无效"))
		return
	}
	ctx := c.Request.Context()
	user := c.GetString("user")
	tx, _, _, err := s.lockRelation(ctx, user, []string{user})
	if err != nil {
		s.fail(c, err)
		return
	}
	defer tx.Rollback()
	var status string
	var httpStatus int
	var response json.RawMessage
	err = tx.QueryRowContext(ctx, "SELECT status,http_status,response FROM operations WHERE actor_id=? AND operation_key=?", user, key).Scan(&status, &httpStatus, &response)
	if err == sql.ErrNoRows {
		status = "closed"
		httpStatus = 409
		response = json.RawMessage(`{"error":{"code":"OPERATION_CLOSED","message":"原操作已关闭，未执行"}}`)
		_, err = tx.ExecContext(ctx, "INSERT INTO operations VALUES (?,?,?,?,?,?,?)", user, key, "", status, httpStatus, []byte(response), s.Now().UTC())
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	if err = tx.Commit(); err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"status": status, "httpStatus": httpStatus, "response": response})
}

func (s *Server) bind(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		s.fail(c, platform.Fail(400, "INVALID_BODY", "请求内容过大"))
		return
	}
	c.Request.Body = io.NopCloser(strings.NewReader(string(raw)))
	var body struct {
		Code string `json:"code"`
	}
	if err = decode(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	c.Request.Body = io.NopCloser(strings.NewReader(string(raw)))
	owner, lookupErr := identity.InviteOwner(c.Request.Context(), s.DB, body.Code)
	extra := []string{}
	if lookupErr == nil {
		extra = append(extra, owner)
	}
	s.write(c, extra, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		if lookupErr != nil {
			return nil, lookupErr
		}
		id, err := identity.Bind(ctx, tx, user, body.Code, now)
		if err != nil {
			return nil, err
		}
		if err = points.Initialize(ctx, tx, id, user, []string{owner, user}, now); err != nil {
			return nil, err
		}
		if err = catalog.Initialize(ctx, tx, owner, user); err != nil {
			return nil, err
		}
		result := gin.H{"coupleId": id, "boundAt": now}
		return result, eventbus.Save(ctx, tx, id, user, "CoupleBound", result, now)
	})
}
func (s *Server) propose(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		s.fail(c, platform.Fail(400, "INVALID_BODY", "请求内容过大"))
		return
	}
	c.Request.Body = io.NopCloser(strings.NewReader(string(raw)))
	var body struct {
		DailyLimit string `json:"dailyLimit"`
	}
	if err = decode(c, &body); err != nil {
		s.fail(c, err)
		return
	}
	c.Request.Body = io.NopCloser(strings.NewReader(string(raw)))
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		limit, err := points.Parse(body.DailyLimit)
		if err != nil {
			return nil, err
		}
		couple, err := identity.LockCouple(ctx, tx, user, false)
		if err != nil {
			return nil, err
		}
		result, err := rules.Propose(ctx, tx, user, couple, limit, now)
		if err != nil {
			return nil, err
		}
		s.invalidateReadCache(ctx, couple.ID, "rules")
		return result, eventbus.Save(ctx, tx, couple.ID, user, "RulesProposed", result, now)
	})
}
func (s *Server) confirm(c *gin.Context) {
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, false)
		if err != nil {
			return nil, err
		}
		result, err := rules.Confirm(ctx, tx, user, couple.ID, c.Param("id"), now)
		if err != nil {
			return nil, err
		}
		s.invalidateReadCache(ctx, couple.ID, "rules")
		return result, eventbus.Save(ctx, tx, couple.ID, user, "RulesActivated", result, now)
	})
}
func (s *Server) checkin(c *gin.Context) {
	s.write(c, nil, func(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
		couple, err := identity.LockCouple(ctx, tx, user, true)
		if err != nil {
			return nil, err
		}
		result, err := checkin.Record(ctx, tx, user, couple, now)
		if err != nil {
			return nil, err
		}
		s.invalidateReadCache(ctx, couple.ID, "checkins")
		return result, eventbus.Save(ctx, tx, couple.ID, user, "CheckinRecorded", result, now)
	})
}

func (s *Server) read(c *gin.Context, required string, fn func(context.Context, *sql.Tx, identity.Context) (any, error)) {
	ctx := c.Request.Context()
	tx, couple, now, err := s.beginRelation(ctx, c.GetString("user"), nil)
	if err != nil {
		s.fail(c, err)
		return
	}
	defer tx.Rollback()
	state, err := s.cachedContext(ctx, tx, c.GetString("user"), couple, now)
	if err != nil {
		s.fail(c, err)
		return
	}
	if required != "" && state.Couple == nil {
		s.fail(c, platform.Fail(403, "BINDING_REQUIRED", "请先绑定伴侣"))
		return
	}
	if required == "ready" && state.Stage != "ready" {
		s.fail(c, platform.Fail(403, "RULES_REQUIRED", "请先由双方确认共同规则"))
		return
	}
	result, err := fn(ctx, tx, state)
	if err != nil {
		s.fail(c, err)
		return
	}
	if err = tx.Commit(); err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, result)
}
func (s *Server) readContext(c *gin.Context) {
	s.read(c, "", func(_ context.Context, _ *sql.Tx, state identity.Context) (any, error) { return state, nil })
}
func (s *Server) listRules(c *gin.Context) {
	s.read(c, "bound", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		p, err := s.cachedRules(ctx, tx, state.Couple.ID)
		if id := c.Query("id"); id != "" {
			var selected rules.Proposal
			selected, err = cachedRead(s, ctx, readCacheKey("rules", state.Couple.ID), "id:"+id, stableCacheTTL, func() (rules.Proposal, error) {
				var proposal rules.Proposal
				err := tx.QueryRowContext(ctx, "SELECT id,proposer_id,previous_limit,daily_limit,status,created_at FROM rule_proposals WHERE id=? AND couple_id=?", id, state.Couple.ID).Scan(&proposal.ID, &proposal.ProposerID, &proposal.PreviousLimit, &proposal.DailyLimit, &proposal.Status, &proposal.CreatedAt)
				return proposal, err
			})
			if err == sql.ErrNoRows {
				return nil, platform.Fail(404, "NOT_FOUND", "规则提议不存在或无权查看")
			}
			p = []rules.Proposal{selected}
		}
		return gin.H{"proposals": p, "dailyLimit": state.Couple.DailyLimit}, err
	})
}
func (s *Server) home(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		summary, err := points.Read(ctx, tx, state.Me.ID, state.Couple.ID, state.BusinessDate, *state.Couple.DailyLimit)
		if err != nil {
			return nil, err
		}
		checked, err := cachedRead(s, ctx, readCacheKey("checkins", state.Couple.ID), state.BusinessDate+":"+state.Me.ID, activityCacheTTL, func() (checkin.Status, error) {
			return checkin.Read(ctx, tx, state.Me.ID, state.Couple.ID, state.BusinessDate)
		})
		if err != nil {
			return nil, err
		}
		proposals, err := s.cachedRules(ctx, tx, state.Couple.ID)
		if err != nil {
			return nil, err
		}
		todo := []rules.Proposal{}
		for _, p := range proposals {
			if p.Status == "pending" && p.ProposerID != state.Me.ID {
				todo = append(todo, p)
			}
		}
		orderTodos, err := cachedRead(s, ctx, readCacheKey("orders", state.Couple.ID), "todos:"+state.Me.ID, activityCacheTTL, func() ([]orders.Order, error) {
			return orders.Todos(ctx, tx, state.Couple.ID, state.Me.ID)
		})
		if err != nil {
			return nil, err
		}
		taskTodos, err := cachedRead(s, ctx, readCacheKey("tasks", state.Couple.ID), "todos:"+state.Me.ID, activityCacheTTL, func() ([]tasks.Task, error) {
			return tasks.Todos(ctx, tx, state.Couple.ID, state.Me.ID)
		})
		if err != nil {
			return nil, err
		}
		return gin.H{"context": state, "points": summary, "checkin": checked, "todos": todo, "orderTodos": orderTodos, "taskTodos": taskTodos, "milestones": checkin.Milestones}, nil
	})
}
func (s *Server) history(c *gin.Context) {
	s.read(c, "ready", func(ctx context.Context, tx *sql.Tx, state identity.Context) (any, error) {
		rows, err := tx.QueryContext(ctx, "SELECT id,actor_id,reason,amount,created_at,task_id FROM pool_ledger WHERE couple_id=? ORDER BY created_at DESC,id DESC LIMIT 100", state.Couple.ID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []gin.H{}
		for rows.Next() {
			var id, actor, reason string
			var amount int64
			var at time.Time
			var taskID *string
			if err = rows.Scan(&id, &actor, &reason, &amount, &at, &taskID); err != nil {
				return nil, err
			}
			out = append(out, gin.H{"id": id, "actorId": actor, "reason": reason, "amount": amount, "createdAt": at, "taskId": taskID})
		}
		return gin.H{"entries": out}, rows.Err()
	})
}

func ValidateConfig(c Config) error {
	if c.DSN == "" {
		return fmt.Errorf("MYSQL_DSN is required")
	}
	if c.DevLogin && (c.Env != "development" || (!strings.HasPrefix(c.Address, "127.0.0.1:") && !strings.HasPrefix(c.Address, "localhost:"))) {
		return fmt.Errorf("DEV_LOGIN requires development and a loopback HTTP_ADDR")
	}
	return nil
}
