package checkin

import (
	"testing"
	"time"
)

func TestMonthRangeAndCalendar(t *testing.T) {
	start, end, err := MonthRange("2028-02", "2026-10", "2028-03-01")
	if err != nil || end.Sub(start) != 29*24*time.Hour {
		t.Fatal("leap February", start, end, err)
	}
	happy, calm := "happy", "calm"
	rows := []Row{
		{UserID: "a", Date: "2028-02-29", Entry: Entry{Mood: &happy}},
		{UserID: "b", Date: "2028-02-29", Entry: Entry{Mood: &calm}},
		{UserID: "b", Date: "2028-02-01", Entry: Entry{}},
	}
	days := CalendarDays(rows, "a", start, end)
	if len(days) != 29 || days[0].Me != nil || days[0].Partner == nil || days[0].Partner.Mood != nil || *days[28].Me.Mood != happy || *days[28].Partner.Mood != calm {
		t.Fatal("empty, legacy and both moods must remain distinct", days)
	}
	other := CalendarDays(rows, "b", start, end)
	if *other[28].Me.Mood != calm || *other[28].Partner.Mood != happy {
		t.Fatal("viewer mapping reversed")
	}
	if status := Today(rows, "a", "2028-03-01", 3); status.Me || status.Partner || status.Revision != 3 {
		t.Fatal("old moods leaked into a new day", status)
	}
	for _, month := range []string{"2028-2", "2028-00", "2028-13", "2028-02-01", "2026-09", "2028-04", "bad"} {
		if _, _, err := MonthRange(month, "2026-10", "2028-03-01"); err == nil {
			t.Errorf("accepted invalid/out-of-range month %q", month)
		}
	}
}

func TestMoodWhitelist(t *testing.T) {
	for _, mood := range []string{"happy", "calm", "loving", "missing", "tired", "sad", "irritated", "energetic"} {
		if !ValidMood(mood) {
			t.Fatal(mood)
		}
	}
	for _, mood := range []string{"", "Happy", "开心", "happy ", "neutral", "../happy"} {
		if ValidMood(mood) {
			t.Fatal("unexpected mood", mood)
		}
	}
}
