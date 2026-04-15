package catalog

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

//go:embed fixtures/on_search.json
var onSearchRaw []byte

// Load returns a parsed DHP on_search response. Panics on malformed fixture —
// this is programmer error, not runtime error.
func Load() beckn.OnSearchResponse {
	var resp beckn.OnSearchResponse
	if err := json.Unmarshal(onSearchRaw, &resp); err != nil {
		panic(fmt.Sprintf("catalog fixture malformed: %v", err))
	}
	return resp
}
