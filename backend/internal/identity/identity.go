package identity

import (
	"context"
	"database/sql"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"couple-mini/backend/internal/platform"
)

type User struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	AvatarID string `json:"avatarId"`
}
type Couple struct {
	ID         string `json:"id"`
	DailyLimit *int64 `json:"dailyLimit"`
	DoubleDays int    `json:"doubleDays"`
}
type Context struct {
	Me           User      `json:"me"`
	Partner      *User     `json:"partner"`
	Couple       *Couple   `json:"couple"`
	Stage        string    `json:"stage"`
	ServerTime   time.Time `json:"serverTime"`
	BusinessDate string    `json:"businessDate"`
}

func Login(ctx context.Context, db *sql.DB, openid, nickname string, now time.Time) (User, error) {
	id := platform.ID()
	_, err := db.ExecContext(ctx, "INSERT INTO users (id,openid,nickname,created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE openid=openid", id, openid, nickname, now)
	if err != nil {
		return User{}, err
	}
	var u User
	err = db.QueryRowContext(ctx, "SELECT id,nickname,COALESCE(avatar_id,'') FROM users WHERE openid=?", openid).Scan(&u.ID, &u.Nickname, &u.AvatarID)
	return u, err
}

type ProfileInput struct {
	Nickname string `json:"nickname"`
	AvatarID string `json:"avatarId"`
}

var avatarID = regexp.MustCompile(`^[a-f0-9]{32}$`)

func SaveProfile(ctx context.Context, tx *sql.Tx, user string, in ProfileInput) (User, error) {
	in.Nickname = strings.TrimSpace(in.Nickname)
	if !utf8.ValidString(in.Nickname) || utf8.RuneCountInString(in.Nickname) > 40 || strings.ContainsFunc(in.Nickname, unicode.IsControl) {
		return User{}, platform.Fail(422, "INVALID_NICKNAME", "昵称不能超过 40 个字符，且不能包含换行或控制字符")
	}
	if in.Nickname == "" {
		in.Nickname = "微信用户"
	}
	if in.AvatarID != "" {
		if !avatarID.MatchString(in.AvatarID) {
			return User{}, platform.Fail(422, "INVALID_AVATAR", "请选择并上传自己的头像")
		}
		var owned int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM media_files WHERE id=? AND owner_id=?", in.AvatarID, user).Scan(&owned); err != nil {
			return User{}, err
		}
		if owned != 1 {
			return User{}, platform.Fail(422, "INVALID_AVATAR", "请选择并上传自己的头像")
		}
	}
	_, err := tx.ExecContext(ctx, "UPDATE users SET nickname=?,avatar_id=NULLIF(?,'') WHERE id=?", in.Nickname, in.AvatarID, user)
	return User{ID: user, Nickname: in.Nickname, AvatarID: in.AvatarID}, err
}

func LockUsers(ctx context.Context, tx *sql.Tx, ids ...string) error {
	sort.Strings(ids)
	for i, id := range ids {
		if i > 0 && id == ids[i-1] {
			continue
		}
		var found string
		if err := tx.QueryRowContext(ctx, "SELECT id FROM users WHERE id=? FOR UPDATE", id).Scan(&found); err != nil {
			return err
		}
	}
	return nil
}

func ReadContext(ctx context.Context, tx *sql.Tx, user string, now time.Time) (Context, error) {
	out := Context{Stage: "binding", ServerTime: now, BusinessDate: platform.Date(now)}
	if err := tx.QueryRowContext(ctx, "SELECT id,nickname,COALESCE(avatar_id,'') FROM users WHERE id=?", user).Scan(&out.Me.ID, &out.Me.Nickname, &out.Me.AvatarID); err != nil {
		return out, err
	}
	var c Couple
	err := tx.QueryRowContext(ctx, "SELECT c.id,c.daily_limit,c.double_days FROM members m JOIN couples c ON c.id=m.couple_id WHERE m.user_id=?", user).Scan(&c.ID, &c.DailyLimit, &c.DoubleDays)
	if err == sql.ErrNoRows {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	out.Couple = &c
	out.Stage = "rules"
	if c.DailyLimit != nil {
		out.Stage = "ready"
	}
	var p User
	err = tx.QueryRowContext(ctx, "SELECT u.id,u.nickname,COALESCE(u.avatar_id,'') FROM members m JOIN users u ON u.id=m.user_id WHERE m.couple_id=? AND m.user_id<>?", c.ID, user).Scan(&p.ID, &p.Nickname, &p.AvatarID)
	if err != nil {
		return out, err
	}
	out.Partner = &p
	return out, nil
}

func LockCouple(ctx context.Context, tx *sql.Tx, user string, ready bool) (Couple, error) {
	var c Couple
	err := tx.QueryRowContext(ctx, "SELECT c.id,c.daily_limit,c.double_days FROM members m JOIN couples c ON c.id=m.couple_id WHERE m.user_id=? FOR UPDATE", user).Scan(&c.ID, &c.DailyLimit, &c.DoubleDays)
	if err == sql.ErrNoRows {
		return c, platform.Fail(403, "BINDING_REQUIRED", "请先绑定伴侣")
	}
	if err != nil {
		return c, err
	}
	if ready && c.DailyLimit == nil {
		return c, platform.Fail(403, "RULES_REQUIRED", "请先由双方确认共同规则")
	}
	return c, nil
}
func LockCoupleID(ctx context.Context, tx *sql.Tx, id string) (Couple, error) {
	var c Couple
	err := tx.QueryRowContext(ctx, "SELECT id,daily_limit,double_days FROM couples WHERE id=? FOR UPDATE", id).Scan(&c.ID, &c.DailyLimit, &c.DoubleDays)
	return c, err
}

func Invite(ctx context.Context, tx *sql.Tx, user string, now time.Time) (any, error) {
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM members WHERE user_id=?", user).Scan(&n); err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, platform.Fail(409, "ALREADY_BOUND", "你已经绑定伴侣")
	}
	code := platform.ID()[:12]
	expires := now.Add(24 * time.Hour)
	if _, err := tx.ExecContext(ctx, "INSERT INTO invitations VALUES (?,?,?,NULL)", platform.Hash(code), user, expires); err != nil {
		return nil, err
	}
	return map[string]any{"code": code, "expiresAt": expires}, nil
}

func InviteOwner(ctx context.Context, db *sql.DB, code string) (string, error) {
	var owner string
	err := db.QueryRowContext(ctx, "SELECT owner_id FROM invitations WHERE code_hash=?", platform.Hash(code)).Scan(&owner)
	if err == sql.ErrNoRows {
		return "", platform.Fail(404, "INVITE_INVALID", "邀请码无效或已过期")
	}
	return owner, err
}

func Bind(ctx context.Context, tx *sql.Tx, user, code string, now time.Time) (string, error) {
	var owner string
	var expires time.Time
	var used sql.NullString
	err := tx.QueryRowContext(ctx, "SELECT owner_id,expires_at,used_by FROM invitations WHERE code_hash=? FOR UPDATE", platform.Hash(code)).Scan(&owner, &expires, &used)
	if err == sql.ErrNoRows {
		return "", platform.Fail(404, "INVITE_INVALID", "邀请码无效或已过期")
	}
	if err != nil {
		return "", err
	}
	if used.Valid || !now.Before(expires) {
		return "", platform.Fail(409, "INVITE_INVALID", "邀请码已使用或已过期")
	}
	if owner == user {
		return "", platform.Fail(422, "SELF_BINDING", "不能绑定自己")
	}
	var n int
	if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM members WHERE user_id IN (?,?)", owner, user).Scan(&n); err != nil {
		return "", err
	}
	if n > 0 {
		return "", platform.Fail(409, "ALREADY_BOUND", "你或对方已经绑定伴侣")
	}
	couple := platform.ID()
	if _, err = tx.ExecContext(ctx, "INSERT INTO couples(id,created_at) VALUES (?,?)", couple, now); err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO members VALUES (?,?),(?,?)", owner, couple, user, couple); err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE invitations SET used_by=? WHERE code_hash=?", user, platform.Hash(code)); err != nil {
		return "", err
	}
	return couple, nil
}
