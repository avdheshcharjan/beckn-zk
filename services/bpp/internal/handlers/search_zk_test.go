package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

func basicSearch() beckn.SearchRequest {
	return beckn.SearchRequest{
		Context: beckn.Context{
			Domain:        "dhp:diagnostics:0.1.0",
			Action:        "search",
			Version:       "1.1.0",
			BapID:         "b",
			BapURI:        "https://b",
			TransactionID: "tx-1",
			MessageID:     "msg-1",
			Timestamp:     "2026-04-15T00:00:00Z",
			Location:      beckn.LocCC{Country: beckn.Country{Code: "IND"}, City: beckn.City{Code: "std:080"}},
		},
		Message: beckn.SearchMessage{Intent: beckn.Intent{}},
	}
}

func TestBetaRejectsSearchWithoutProof(t *testing.T) {
	req := basicSearch()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()
	NewSearchHandler("lab-beta").ServeHTTP(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("beta without proof should be 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestAlphaAcceptsSearchWithoutProof(t *testing.T) {
	req := basicSearch()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()
	NewSearchHandler("lab-alpha").ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("alpha without proof should be 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGammaAcceptsSearchWithoutProof(t *testing.T) {
	req := basicSearch()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()
	NewSearchHandler("lab-gamma").ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("gamma without proof should be 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGammaRedactsCatalogWithoutProof(t *testing.T) {
	req := basicSearch()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()
	NewSearchHandler("lab-gamma").ServeHTTP(w, r)

	var resp beckn.OnSearchResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Message.Catalog.Providers) > 1 {
		t.Errorf("gamma without proof should redact to <=1 provider, got %d", len(resp.Message.Catalog.Providers))
	}
}
