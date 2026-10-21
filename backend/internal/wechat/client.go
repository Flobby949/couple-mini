package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

type Outcome struct{ Status, Reason string }
type Client struct {
	AppID, Secret string
	HTTP          *http.Client
	mu            sync.Mutex
	token         string
	expires       time.Time
}

// A token failure happens before sending, so it is safe to retry. A failed send response is not assumed unsent.
func (c *Client) accessToken(ctx context.Context) (string, Outcome) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.expires) {
		return c.token, Outcome{}
	}
	b, _ := json.Marshal(map[string]any{"grant_type": "client_credential", "appid": c.AppID, "secret": c.Secret, "force_refresh": false})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.weixin.qq.com/cgi-bin/stable_token", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", Outcome{"retry", "credential_request_failed"}
	}
	defer res.Body.Close()
	var result struct {
		AccessToken string `json:"access_token"`
		Expires     int    `json:"expires_in"`
		Code        int    `json:"errcode"`
	}
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&result) != nil {
		return "", Outcome{"retry", "credential_response_failed"}
	}
	if result.Code != 0 || result.AccessToken == "" {
		if result.Code == -1 || result.Code == 45009 {
			return "", Outcome{"retry", "credential_busy"}
		}
		return "", Outcome{"unavailable", "invalid_credentials"}
	}
	c.token = result.AccessToken
	c.expires = time.Now().Add(time.Duration(max(0, result.Expires-120)) * time.Second)
	return c.token, Outcome{}
}
func (c *Client) Send(ctx context.Context, payload []byte) Outcome {
	token, result := c.accessToken(ctx)
	if token == "" {
		return result
	}
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token="+token, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return Outcome{"unknown", "send_result_unknown"}
	}
	defer res.Body.Close()
	var response struct {
		Code *int `json:"errcode"`
	}
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&response) != nil || response.Code == nil {
		return Outcome{"unknown", "send_response_unknown"}
	}
	switch *response.Code {
	case 0:
		return Outcome{"succeeded", ""}
	case -1, 45009:
		return Outcome{"retry", "platform_busy"}
	case 40001, 40014, 42001:
		c.mu.Lock()
		if c.token == token {
			c.token = ""
		}
		c.mu.Unlock()
		return Outcome{"retry", "token_expired"}
	case 43101:
		return Outcome{"unavailable", "subscription_unavailable"}
	case 40037, 47003, 41030:
		return Outcome{"unavailable", "template_or_page_invalid"}
	default:
		return Outcome{"unavailable", "platform_rejected"}
	}
}
