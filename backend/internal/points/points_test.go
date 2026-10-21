package points

import "testing"

func TestParseNonnegativeBeforeRounding(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want int64
		ok   bool
	}{
		{"0", 0, true}, {"0.49", 0, true}, {"0.50", 1, true}, {"21.5", 22, true}, {"103", 103, true},
		{"1000000000", 1000000000, true}, {"999999999.5", 1000000000, true},
		{"-0.1", 0, false}, {"-1", 0, false}, {"", 0, false}, {" ", 0, false}, {"1e2", 0, false},
		{"1.1234567", 0, false}, {"NaN", 0, false}, {"1000000000.5", 0, false}, {"999999999999999999999", 0, false},
	} {
		t.Run(test.raw, func(t *testing.T) {
			got, err := Parse(test.raw)
			if (err == nil) != test.ok || err == nil && got != test.want {
				t.Fatalf("Parse(%q)=(%d,%v), want (%d,%v)", test.raw, got, err, test.want, test.ok)
			}
		})
	}
}
