package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

func TestSearchReturnsCatalog(t *testing.T) {
	req := beckn.SearchRequest{
		Context: beckn.Context{
			Domain:        "dhp:diagnostics:0.1.0",
			Action:        "search",
			Version:       "1.1.0",
			BapID:         "test-bap",
			BapURI:        "https://test",
			TransactionID: "tx-1",
			MessageID:     "msg-1",
			Timestamp:     "2026-04-15T00:00:00Z",
			Location:      beckn.LocCC{Country: beckn.Country{Code: "IND"}, City: beckn.City{Code: "std:080"}},
		},
		Message: beckn.SearchMessage{Intent: beckn.Intent{}},
	}
	body, _ := json.Marshal(req)

	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()

	NewSearchHandler("lab-alpha").ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp beckn.OnSearchResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Context.Action != "on_search" {
		t.Errorf("expected action=on_search, got %q", resp.Context.Action)
	}
	if resp.Context.TransactionID != "tx-1" {
		t.Errorf("expected transaction_id echo, got %q", resp.Context.TransactionID)
	}
	if len(resp.Message.Catalog.Providers) == 0 {
		t.Errorf("expected providers in catalog")
	}
}

func TestSearchRejectsWrongAction(t *testing.T) {
	req := beckn.SearchRequest{
		Context: beckn.Context{Action: "confirm", Version: "1.1.0"},
	}
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()
	NewSearchHandler("lab-alpha").ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
