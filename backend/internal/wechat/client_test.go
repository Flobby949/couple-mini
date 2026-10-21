package wechat

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestPlatformOutcomesAndCachedCredential(t *testing.T) {
	tokens, sends := 0, 0
	response := `{"errcode":0}`
	c := &Client{AppID: "test", Secret: "test", HTTP: &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		body := response
		if strings.Contains(r.URL.Path, "stable_token") {
			tokens++
			body = `{"access_token":"test_token","expires_in":7200}`
		} else {
			sends++
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}}
	for _, test := range []struct{ body, status string }{{`{"errcode":0}`, "succeeded"}, {`{"errcode":43101}`, "unavailable"}, {`{"errcode":45009}`, "retry"}, {`{"errcode":47003}`, "unavailable"}, {`broken`, "unknown"}, {`{}`, "unknown"}} {
		response = test.body
		if got := c.Send(context.Background(), []byte(`{}`)); got.Status != test.status {
			t.Fatal(test.body, got)
		}
	}
	if tokens != 1 || sends != 6 {
		t.Fatal("credential cache or send count wrong", tokens, sends)
	}
}
