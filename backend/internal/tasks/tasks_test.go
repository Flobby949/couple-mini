package tasks

import (
	"testing"
	"time"
)

func TestStrictTimezoneDeadline(t *testing.T) {
	now := time.Date(2026, 10, 21, 2, 0, 0, 0, time.UTC)
	for _, raw := range []string{"2026-10-21T10:00:00+08:00", "2026-10-21T09:59:59+08:00", "2026-10-21T10:00:01"} {
		if _, err := Future(&raw, now); err == nil {
			t.Fatal("invalid or non-future deadline accepted", raw)
		}
	}
	future := "2026-10-21T10:00:01+08:00"
	at, err := Future(&future, now)
	if err != nil || !at.Equal(now.Add(time.Second)) {
		t.Fatal(at, err)
	}
}
func TestTaskCancellationDoesNotFreezeMainActions(t *testing.T) {
	task := Task{Kind: "partner", CreatorID: "a", PartnerID: "b", Status: "active", Cancel: &Cancellation{ID: "request", RequesterID: "b"}}
	has := func(actions []string, want string) bool {
		for _, a := range actions {
			if a == want {
				return true
			}
		}
		return false
	}
	if !has(Actions(task, "b"), "submit") || has(Actions(task, "b"), "approve_cancel") || !has(Actions(task, "a"), "approve_cancel") {
		t.Fatal("cancellation changed main action permissions")
	}
	task.Status = "awaiting"
	submitter := "b"
	task.SubmittedBy = &submitter
	if !has(Actions(task, "a"), "confirm") || !NeedsAction(task, "a") || NeedsAction(task, "b") {
		t.Fatal("awaiting task or todo role lost")
	}
	task.Status = "completed"
	if len(Actions(task, "a")) != 0 || NeedsAction(task, "a") {
		t.Fatal("ended task remained actionable")
	}
}
