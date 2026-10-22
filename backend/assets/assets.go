package assets

import "embed"

// Mood illustrations are public, versioned assets, separate from private media.
//
//go:embed moods
var Moods embed.FS
