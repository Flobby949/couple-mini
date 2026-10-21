package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	schema "couple-mini/backend"
	"couple-mini/backend/internal/app"
	"couple-mini/backend/internal/notifications"
	"couple-mini/backend/internal/platform"
	"couple-mini/backend/internal/scheduler"
	"couple-mini/backend/internal/wechat"
	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func env(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		return err
	}
	config := app.Config{Env: env("APP_ENV", "production"), Address: env("HTTP_ADDR", "127.0.0.1:8080"), DSN: os.Getenv("MYSQL_DSN"), RedisAddress: env("REDIS_ADDR", "127.0.0.1:6379"), RedisPassword: os.Getenv("REDIS_PASSWORD"), WechatID: os.Getenv("WECHAT_APP_ID"), WechatSecret: os.Getenv("WECHAT_APP_SECRET"), Origin: os.Getenv("CORS_ORIGIN"), DevLogin: os.Getenv("DEV_LOGIN") == "true"}
	config.MediaRoot = env("MEDIA_ROOT", "uploads")
	if err := os.MkdirAll(config.MediaRoot, 0700); err != nil {
		return err
	}
	if err := app.ValidateConfig(config); err != nil {
		return err
	}
	db, err := sql.Open("mysql", config.DSN)
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetConnMaxLifetime(3 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		return err
	}
	if err = platform.Migrate(ctx, db, schema.Migrations); err != nil {
		return err
	}
	cache := redis.NewClient(&redis.Options{Addr: config.RedisAddress, Password: config.RedisPassword})
	defer cache.Close()
	if err = cache.Ping(ctx).Err(); err != nil {
		return err
	}
	service := &app.Server{DB: db, Redis: cache, Config: config, Now: time.Now, Client: &http.Client{Timeout: 8 * time.Second}}
	service.NotificationMappings, err = notifications.LoadMappings(os.Getenv("WECHAT_NOTIFICATION_MAPPINGS"))
	if err != nil {
		return err
	}
	service.Config.MiniProgramState = env("WECHAT_MINIPROGRAM_STATE", "trial")
	if service.Config.MiniProgramState != "trial" && service.Config.MiniProgramState != "developer" && service.Config.MiniProgramState != "formal" {
		return fmt.Errorf("invalid WECHAT_MINIPROGRAM_STATE")
	}
	if config.WechatID != "" && config.WechatSecret != "" {
		service.Wechat = &wechat.Client{AppID: config.WechatID, Secret: config.WechatSecret, HTTP: service.Client}
	}
	if err = service.Subscription().Validate(); err != nil {
		return err
	}
	server := &http.Server{Addr: config.Address, Handler: service.Router(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	stopped, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	jobsDone := make(chan struct{})
	go func() {
		defer close(jobsDone)
		var jobs sync.WaitGroup
		for _, job := range []struct {
			interval time.Duration
			name     string
			run      func(context.Context) error
		}{{30 * time.Second, "due-settlement", service.SettleDue}, {3 * time.Second, "event-dispatch", service.DispatchNotifications}, {5 * time.Second, "wechat-delivery", service.DeliverNotifications}} {
			jobs.Add(1)
			go func(interval time.Duration, name string, run func(context.Context) error) {
				defer jobs.Done()
				scheduler.Run(stopped, interval, name, run)
			}(job.interval, job.name, job.run)
		}
		jobs.Wait()
	}()
	failure := make(chan error, 1)
	go func() { failure <- server.ListenAndServe() }()
	slog.Info("server ready", "address", config.Address, "environment", config.Env)
	select {
	case err = <-failure:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-stopped.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := server.Shutdown(shutdown)
		<-jobsDone
		return err
	}
}
