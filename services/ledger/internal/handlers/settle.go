package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/avdhesh/beckn-zk/services/ledger/internal/store"
)

type ProofVerifier interface {
	Verify(proofB64 string, publicInputs string) (bool, error)
}

type SolvencyProof struct {
	Scheme       string `json:"scheme"`
	CircuitID    string `json:"circuit_id"`
	Proof        string `json:"proof"`
	PublicInputs string `json:"public_inputs"`
	Nullifier    string `json:"nullifier"`
	Binding      string `json:"binding"`
}

type SettleRequest struct {
	TransactionID string        `json:"transaction_id"`
	Account       string        `json:"account"`
	Amount        int64         `json:"amount"`
	Currency      string        `json:"currency"`
	SolvencyProof SolvencyProof `json:"solvency_proof"`
}

type SettleHandler struct {
	store    *store.Memory
	verifier ProofVerifier
}

func NewSettleHandler(s *store.Memory, v ProofVerifier) *SettleHandler {
	return &SettleHandler{store: s, verifier: v}
}

func (h *SettleHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req SettleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Account == "" || req.Amount <= 0 {
		http.Error(w, "account and positive amount required", http.StatusBadRequest)
		return
	}
	ok, err := h.verifier.Verify(req.SolvencyProof.Proof, req.SolvencyProof.PublicInputs)
	if err != nil {
		http.Error(w, "verify errored: "+err.Error(), http.StatusForbidden)
		return
	}
	if !ok {
		http.Error(w, "solvency proof rejected", http.StatusForbidden)
		return
	}
	if err := h.store.Debit(req.Account, req.Amount); err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"transaction_id": req.TransactionID,
		"balance":        h.store.Balance(req.Account),
	})
}
