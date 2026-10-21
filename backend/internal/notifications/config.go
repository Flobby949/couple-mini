package notifications

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

type Mapping struct {
	TemplateID string            `json:"templateId"`
	Fields     map[string]string `json:"fields"`
}
type Mappings map[string]Mapping

var fieldName = regexp.MustCompile(`^(thing|time|number|phrase|character_string)[1-9][0-9]*$`)

func LoadMappings(path string) (Mappings, error) {
	mappings := Mappings{}
	if path == "" {
		return mappings, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(b, &mappings); err != nil {
		return nil, err
	}
	for code, m := range mappings {
		if !Known(code) || m.TemplateID == "" || len(m.TemplateID) > 128 || len(m.Fields) == 0 {
			return nil, fmt.Errorf("invalid notification mapping %s", code)
		}
		for key, source := range m.Fields {
			if !fieldName.MatchString(key) {
				return nil, fmt.Errorf("invalid platform field %s", key)
			}
			switch source {
			case "title", "name", "actor", "amount", "occurredAt":
			default:
				return nil, fmt.Errorf("invalid notification field source")
			}
		}
	}
	return mappings, nil
}
