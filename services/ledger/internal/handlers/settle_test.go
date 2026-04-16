package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avdhesh/beckn-zk/services/ledger/internal/store"
)

func TestSettleHappyPath(t *testing.T) {
	s := store.NewMemory()
	s.SetBalance("patient-a", 10000)

	h := NewSettleHandler(s, stubAcceptAll{})

	body := map[string]any{
		"transaction_id": "tx-1",
		"account":        "patient-a",
		"amount":         3000,
		"currency":       "INR",
		"solvency_proof": map[string]string{
			"scheme":        "groth16",
			"circuit_id":    "anon-aadhaar-v2",
			"proof":         "aGVsbG8=",
			"public_inputs": "[]",
			"nullifier":     "0xnull1",
			"binding":       "0xbind1",
		},
	}
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(http.MethodPost, "/settle", bytes.NewReader(b))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if s.Balance("patient-a") != 7000 {
		t.Errorf("expected 7000, got %d", s.Balance("patient-a"))
	}
}

func TestSettleRejectsBadProof(t *testing.T) {
	s := store.NewMemory()
	s.SetBalance("patient-a", 10000)
	h := NewSettleHandler(s, stubRejectAll{})

	body := map[string]any{
		"transaction_id": "tx-1",
		"account":        "patient-a",
		"amount":         3000,
		"currency":       "INR",
		"solvency_proof": map[string]string{
			"scheme":        "groth16",
			"circuit_id":    "anon-aadhaar-v2",
			"proof":         "aGVsbG8=",
			"public_inputs": "[]",
			"nullifier":     "0xnull2",
			"binding":       "0xbind2",
		},
	}
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(http.MethodPost, "/settle", bytes.NewReader(b))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if w.Code == http.StatusOK {
		t.Errorf("bad proof should not settle")
	}
	if s.Balance("patient-a") != 10000 {
		t.Errorf("balance must be untouched on failure, got %d", s.Balance("patient-a"))
	}
}

type stubAcceptAll struct{}

func (stubAcceptAll) Verify(proofB64 string, publicInputs string) (bool, error) {
	return true, nil
}

type stubRejectAll struct{}

func (stubRejectAll) Verify(proofB64 string, publicInputs string) (bool, error) {
	return false, nil
}
