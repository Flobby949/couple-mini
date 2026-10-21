// Package events contains immutable values shared by producers and consumers.
package events

import "time"

type Target struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}
type Recipient struct {
	UserID   string `json:"userId"`
	Template string `json:"template"`
	Channel  string `json:"channel"`
}
type Snapshot struct {
	Names      map[string]string `json:"names"`
	Recipients []Recipient       `json:"recipients"`
}
type Order struct {
	ID, BuyerID, SellerID, Status, EndedReason string
	AutoConfirmAt                              *time.Time
	Snapshot                                   struct {
		Name  string
		Price int64
	}
}
type Task struct {
	ID, Kind, CreatorID, PartnerID, Name, Status string
	Reward                                       int64
	EffectiveDeadline                            *time.Time
	SubmittedBy                                  *string
	CancelRequest                                *struct{ RequesterID string }
}
type Result struct {
	Action, Name                             string
	Reward, Released, Penalty, SellerBalance int64
	PenaltyBalance                           *int64
	Awards                                   []struct {
		UserID                 string
		Agreed, Actual, Unpaid int64
	}
}
type OrderChange struct {
	Order  Order
	Result Result
}
type TaskChange struct {
	Task   Task
	Result Result
}
type Gift struct {
	ID, SenderID, ReceiverID     string
	Requested, Actual, Discarded int64
}
type Rule struct {
	ID, ProposalID, ProposerID string
	PreviousLimit              *int64
	DailyLimit                 int64
	VoidedCount                int
}
type Checkin struct {
	DoubleBonus, MilestoneBonus int64
	DoubleDays                  int
}
