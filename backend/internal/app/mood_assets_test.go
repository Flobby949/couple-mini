package app

import (
	"bytes"
	"encoding/json"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"

	"couple-mini/backend/assets"
	"couple-mini/backend/internal/checkin"
	"couple-mini/backend/internal/platform"
)

func TestPublicMoodAssets(t *testing.T) {
	raw, err := assets.Moods.ReadFile("moods/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Revision string `json:"revision"`
		Files    []struct {
			ID, Scheme, URL, SHA256 string
			Bytes                   int
		} `json:"files"`
	}
	if err := json.Unmarshal(raw, &manifest); err != nil || len(manifest.Files) != 16 {
		t.Fatal("expected sixteen public assets", err)
	}
	router := (&Server{}).Router()
	for _, file := range manifest.Files {
		if !checkin.ValidMood(file.ID) {
			t.Fatal("asset/enum mismatch", file.ID)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, file.URL, nil))
		if response.Code != 200 || response.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" || response.Header().Get("Content-Type") != "image/png" {
			t.Fatal(file.URL, response.Code, response.Header())
		}
		config, err := png.DecodeConfig(bytes.NewReader(response.Body.Bytes()))
		if err != nil || config.Width != 336 || config.Height != 336 {
			t.Fatal("wrong runtime image", file.URL, config, err)
		}
		if platform.Hash(response.Body.String()) != file.SHA256 || response.Body.Len() != file.Bytes {
			t.Fatal("public bytes no longer match the immutable asset manifest", file.URL)
		}
		request := httptest.NewRequest(http.MethodGet, file.URL, nil)
		request.Header.Set("If-None-Match", response.Header().Get("ETag"))
		cached := httptest.NewRecorder()
		router.ServeHTTP(cached, request)
		if cached.Code != 304 || cached.Body.Len() != 0 {
			t.Fatal("conditional download did not hit HTTP cache", cached.Code)
		}
	}
	for _, invalid := range []string{"/assets/moods/bad/light/happy.png", "/assets/moods/0000000000000000/light/happy.png", "/assets/moods/" + manifest.Revision + "/dark/unknown.png", "/assets/moods/" + manifest.Revision + "/unknown/happy.png", "/assets/moods/" + manifest.Revision + "/light/happy.jpg"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, invalid, nil))
		if response.Code != 404 {
			t.Fatal("unexpected public resource", invalid, response.Code)
		}
	}
}
