package notifications

import (
	"couple-mini/backend/internal/events"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestThirtyTemplatesAndRecipientResults(t *testing.T) {
	at := time.Date(2026, 10, 21, 2, 0, 0, 0, time.UTC)
	s := events.Snapshot{Names: map[string]string{"a": "甲", "b": "乙"}}
	order := map[string]any{"order": map[string]any{"id": "order", "buyerId": "a", "sellerId": "b", "status": "awaiting_receipt", "autoConfirmAt": at, "snapshot": map[string]any{"name": "旧商品", "price": 21}}, "result": map[string]any{"penalty": 11, "sellerBalance": -6}}
	task := map[string]any{"task": map[string]any{"id": "task", "kind": "partner", "creatorId": "a", "partnerId": "b", "name": "原任务", "reward": 20, "effectiveDeadline": at, "status": "awaiting"}, "result": map[string]any{"released": 10, "penalty": 10, "penaltyBalance": -5, "awards": []map[string]any{{"userId": "a", "agreed": 20, "actual": 10, "unpaid": 10}, {"userId": "b", "agreed": 20, "actual": 20, "unpaid": 0}}}}
	seen := map[string]bool{}
	for _, tpl := range Templates {
		if seen[tpl.Code] {
			t.Fatal("duplicate template")
		}
		seen[tpl.Code] = true
		var input any
		switch tpl.Code[0] {
		case 'O':
			input = order
		case 'T':
			input = task
		case 'P':
			if tpl.Code == "P01" {
				input = map[string]any{"id": "gift", "senderId": "a", "receiverId": "b", "requested": 20, "actual": 0, "discarded": 20}
			} else {
				input = map[string]any{"doubleBonus": 10, "doubleDays": 7, "milestoneBonus": 30}
			}
		case 'R':
			input = map[string]any{"id": "proposal", "proposalId": "proposal", "dailyLimit": 100, "previousLimit": 20, "voidedCount": 1}
		}
		payload, _ := json.Marshal(input)
		m, err := Render(tpl.Code, "b", "a", payload, s, at)
		if err != nil || m.Title == "" || m.Body == "" || m.Target.Type == "" {
			t.Fatalf("%s: %+v %v", tpl.Code, m, err)
		}
		if tpl.Code == "T12" && (!strings.Contains(m.Body, "继续等待完成确认") || strings.Contains(m.Body, "补正")) {
			t.Fatal(m.Body)
		}
	}
	if len(seen) != 30 {
		t.Fatal("template coverage changed")
	}
	b, _ := json.Marshal(task)
	a, _ := Render("T08", "a", "a", b, s, at)
	other, _ := Render("T08", "b", "a", b, s, at)
	if !strings.Contains(a.Body, "到账 10") || !strings.Contains(a.Body, "未到账的 10") || !strings.Contains(other.Body, "到账 20") || strings.Contains(other.Body, "额度不足") {
		t.Fatal("mixed recipient awards", a.Body, other.Body)
	}
	b, _ = json.Marshal(order)
	buyer, _ := Render("O12", "a", "b", b, s, at)
	seller, _ := Render("O12", "b", "b", b, s, at)
	if !strings.Contains(buyer.Body, "21") || !strings.Contains(seller.Body, "11") || !strings.Contains(seller.Body, "-6") {
		t.Fatal("order result not actual", buyer.Body, seller.Body)
	}
	b = []byte(`{"requested":0,"actual":0,"discarded":0,"senderId":"a"}`)
	zero, _ := Render("P01", "b", "a", b, s, at)
	if strings.Contains(zero.Body, "额度限制") {
		t.Fatal("zero gift misreported")
	}
}
