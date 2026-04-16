package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/catalog"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/zk"
)

type SearchHandler struct {
	personality string
	baseResp    beckn.OnSearchResponse
	verifier    *zk.Verifier
	nullifiers  *zk.NullifierCache
}

func NewSearchHandler(personality string) *SearchHandler {
	return &SearchHandler{
		personality: personality,
		baseResp:    catalog.Load(),
		verifier:    zk.LoadDefaultVerifier(),
		nullifiers:  zk.NewNullifierCache(10 * time.Minute),
	}
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"code":    code,
		"message": msg,
	})
}

func (h *SearchHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "40000", "method not allowed")
		return
	}
	var req beckn.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "40001", "malformed JSON: "+err.Error())
		return
	}
	if req.Context.Action != "search" {
		writeError(w, http.StatusBadRequest, "40001", "context.action must be 'search'")
		return
	}
	if req.Context.Version != "1.1.0" {
		writeError(w, http.StatusBadRequest, "40001", "only Beckn 1.1.0 supported")
		return
	}
	if req.Context.TransactionID == "" || req.Context.MessageID == "" {
		writeError(w, http.StatusBadRequest, "40001", "transaction_id and message_id are required")
		return
	}

	// --- ZK enforcement per personality ---
	tag, extractErr := zk.ExtractZkTag(req.Message.Intent)
	hasProof := extractErr == nil

	switch h.personality {
	case "lab-beta":
		if !hasProof {
			writeError(w, http.StatusForbidden, "40003", "proof required for this BPP")
			return
		}
	case "lab-alpha":
		// ZK-ignorant: respond regardless.
	case "lab-gamma":
		// ZK-preferred: validate if present, respond either way.
	default:
		writeError(w, http.StatusInternalServerError, "50000", "unknown personality")
		return
	}

	if hasProof && h.personality != "lab-alpha" {
		if err := zk.VerifyBinding(tag.Binding, req.Context.TransactionID, req.Context.Timestamp); err != nil {
			writeError(w, http.StatusForbidden, "40003", "binding check failed: "+err.Error())
			return
		}
		if err := h.nullifiers.CheckAndStore(tag.Nullifier); err != nil {
			writeError(w, http.StatusForbidden, "40003", "nullifier replay: "+err.Error())
			return
		}
		proofJSON, err := base64.StdEncoding.DecodeString(tag.ProofB64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "40003", "proof not base64: "+err.Error())
			return
		}
		ok, err := h.verifier.Verify(proofJSON, []byte(tag.PublicInputsJSON))
		if err != nil {
			writeError(w, http.StatusForbidden, "40003", "proof verification errored: "+err.Error())
			return
		}
		if !ok {
			writeError(w, http.StatusForbidden, "40003", "proof rejected")
			return
		}
	}

	resp := h.baseResp
	resp.Context = req.Context
	resp.Context.Action = "on_search"
	resp.Context.BppID = "beckn-zk-bpp-" + h.personality
	resp.Context.BppURI = "https://beckn-zk-bpp-" + h.personality + ".fly.dev"
	resp.Context.Timestamp = time.Now().UTC().Format(time.RFC3339)

	// If gamma and no proof, return a redacted catalog (first provider only).
	if h.personality == "lab-gamma" && !hasProof && len(resp.Message.Catalog.Providers) > 1 {
		resp.Message.Catalog.Providers = resp.Message.Catalog.Providers[:1]
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		panic(err)
	}
}
