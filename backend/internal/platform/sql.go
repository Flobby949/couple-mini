package platform

import "strings"

func splitSQL(source string) []string {
	var statements []string
	for _, s := range strings.Split(source, ";") {
		if s = strings.TrimSpace(s); s != "" {
			statements = append(statements, s)
		}
	}
	return statements
}
