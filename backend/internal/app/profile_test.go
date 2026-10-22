package app

import (
	"bytes"
	"image"
	"image/png"
	"reflect"
	"strings"

	"couple-mini/backend/internal/platform"
)

func testProfile(f *fixture, alice, bob, outsider string) {
	t := f.t
	f.server.Config.MediaRoot = t.TempDir()
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 20, 20))); err != nil {
		t.Fatal(err)
	}
	initial := f.must(alice, "GET", "/context", nil)["me"].(map[string]any)
	if initial["avatarId"] != "" {
		t.Fatalf("new user must have no avatar: %v", initial)
	}
	upload := f.uploadTo(alice, "/profile/avatar", encoded.Bytes())
	if upload.status != 200 {
		t.Fatalf("unbound avatar upload: %s", upload.raw)
	}
	avatar := upload.body["fileId"].(string)
	f.error(f.call("", "POST", "/profile", platform.ID(), map[string]string{}), 401, "UNAUTHENTICATED")
	f.error(f.call(bob, "POST", "/profile", platform.ID(), map[string]string{"nickname": "Bob", "avatarId": avatar}), 422, "INVALID_AVATAR")
	f.error(f.call(alice, "POST", "/profile", platform.ID(), map[string]string{"nickname": strings.Repeat("名", 41)}), 422, "INVALID_NICKNAME")
	f.error(f.call(alice, "POST", "/profile", platform.ID(), map[string]string{"nickname": "换\n行"}), 422, "INVALID_NICKNAME")
	f.error(f.call(alice, "POST", "/profile", platform.ID(), map[string]string{"avatarId": "wxfile://temporary"}), 422, "INVALID_AVATAR")
	key := platform.ID()
	body := map[string]string{"nickname": "  我的昵称 🌷  ", "avatarId": avatar}
	saved := f.call(alice, "POST", "/profile", key, body)
	if saved.status != 200 || saved.body["nickname"] != "我的昵称 🌷" || saved.body["avatarId"] != avatar {
		t.Fatalf("save profile: %s", saved.raw)
	}
	if replay := f.call(alice, "POST", "/profile", key, body); !reflect.DeepEqual(replay.body, saved.body) {
		t.Fatal("profile save must replay its receipt")
	}
	relogged := f.must("", "POST", "/login", map[string]string{"devIdentity": "ProfileAlice"})
	token := relogged["token"].(string)
	defer f.server.Redis.Del(t.Context(), "couple:session:"+platform.Hash(token))
	if user := relogged["user"].(map[string]any); user["nickname"] != "我的昵称 🌷" || user["avatarId"] != avatar {
		t.Fatalf("login lost saved profile: %v", user)
	}
	invite := f.must(alice, "POST", "/invitations", map[string]any{})["code"].(string)
	f.must(bob, "POST", "/binding", map[string]string{"code": invite})
	state := f.must(bob, "GET", "/context", nil)
	if user := state["partner"].(map[string]any); user["nickname"] != "我的昵称 🌷" || user["avatarId"] != avatar {
		t.Fatalf("partner did not receive saved profile: %v", user)
	}
	if f.image(bob, avatar) != 200 || f.image(outsider, avatar) != 404 {
		t.Fatal("avatar access boundary")
	}
	// Avatar upload is available before first rules; product uploads remain gated.
	if r := f.uploadTo(bob, "/profile/avatar", encoded.Bytes()); r.status != 200 {
		t.Fatal(r.raw)
	}
	f.error(f.upload(outsider, encoded.Bytes()), 403, "BINDING_REQUIRED")
	rule := f.must(alice, "POST", "/rules", map[string]string{"dailyLimit": "0"})["id"].(string)
	f.must(bob, "POST", "/rules/"+rule+"/confirm", map[string]any{})
	home := f.must(bob, "GET", "/home", nil)["context"].(map[string]any)
	if home["partner"].(map[string]any)["avatarId"] != avatar {
		t.Fatal("home did not use saved avatar")
	}
	reset := f.must(alice, "POST", "/profile", map[string]string{"nickname": " ", "avatarId": ""})
	if reset["nickname"] != "微信用户" || reset["avatarId"] != "" {
		t.Fatalf("unset profile must use defaults: %v", reset)
	}
}
