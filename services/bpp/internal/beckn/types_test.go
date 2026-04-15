package beckn

import (
	"encoding/json"
	"os"
	"testing"
)

func TestOnSearchFixtureUnmarshals(t *testing.T) {
	data, err := os.ReadFile("../catalog/fixtures/on_search.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var resp OnSearchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Context.Action != "on_search" {
		t.Errorf("expected action=on_search, got %q", resp.Context.Action)
	}
	if len(resp.Message.Catalog.Providers) == 0 {
		t.Errorf("expected at least one provider")
	}
}

func TestSearchRequestRoundTrip(t *testing.T) {
	in := SearchRequest{
		Context: Context{
			Domain:        "dhp:diagnostics:0.1.0",
			Action:        "search",
			Version:       "1.1.0",
			BapID:         "test-bap",
			BapURI:        "https://test",
			TransactionID: "tx-1",
			MessageID:     "msg-1",
			Timestamp:     "2026-04-15T00:00:00Z",
		},
		Message: SearchMessage{Intent: Intent{}},
	}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	var out SearchRequest
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	if out.Context.TransactionID != "tx-1" {
		t.Errorf("round trip lost transaction_id")
	}
}
