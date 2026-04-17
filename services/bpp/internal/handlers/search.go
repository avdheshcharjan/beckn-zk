package handlers

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/callback"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/catalog"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/zk"
)

type SearchHandler struct {
	personality    string
	baseResp       beckn.OnSearchResponse
	verifier       *zk.Verifier
	nullifiers     *zk.NullifierCache
	callbackClient *callback.Client
	bppURI         string
}

func NewSearchHandler(personality string, cb *callback.Client, bppURI string) *SearchHandler {
	return &SearchHandler{
		personality:    personality,
		baseResp:       catalog.Load(),
		verifier:       zk.LoadDefaultVerifier(),
		nullifiers:     zk.NewNullifierCache(10 * time.Minute),
		callbackClient: cb,
		bppURI:         bppURI,
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

func writeACK(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(beckn.AckResponse{
		Message: beckn.AckMessage{
			Ack: beckn.Ack{Status: "ACK"},
		},
	})
}

func writeNACK(w http.ResponseWriter, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(beckn.AckResponse{
		Message: beckn.AckMessage{
			Ack: beckn.Ack{Status: "NACK"},
		},
		Error: &beckn.BecknError{Code: code, Message: msg},
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
			if h.callbackClient != nil {
				writeNACK(w, "40003", "proof required for this BPP")
			} else {
				writeError(w, http.StatusForbidden, "40003", "proof required for this BPP")
			}
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
			if h.callbackClient != nil {
				writeNACK(w, "40003", "binding check failed: "+err.Error())
			} else {
				writeError(w, http.StatusForbidden, "40003", "binding check failed: "+err.Error())
			}
			return
		}
		if err := h.nullifiers.CheckAndStore(tag.Nullifier); err != nil {
			if h.callbackClient != nil {
				writeNACK(w, "40003", "nullifier replay: "+err.Error())
			} else {
				writeError(w, http.StatusForbidden, "40003", "nullifier replay: "+err.Error())
			}
			return
		}
		proofJSON, err := base64.StdEncoding.DecodeString(tag.ProofB64)
		if err != nil {
			if h.callbackClient != nil {
				writeNACK(w, "40003", "proof not base64: "+err.Error())
			} else {
				writeError(w, http.StatusBadRequest, "40003", "proof not base64: "+err.Error())
			}
			return
		}
		ok, err := h.verifier.Verify(proofJSON, []byte(tag.PublicInputsJSON))
		if err != nil {
			if h.callbackClient != nil {
				writeNACK(w, "40003", "proof verification errored: "+err.Error())
			} else {
				writeError(w, http.StatusForbidden, "40003", "proof verification errored: "+err.Error())
			}
			return
		}
		if !ok {
			if h.callbackClient != nil {
				writeNACK(w, "40003", "proof rejected")
			} else {
				writeError(w, http.StatusForbidden, "40003", "proof rejected")
			}
			return
		}
	}

	resp := h.baseResp
	resp.Context = req.Context
	resp.Context.Action = "on_search"
	resp.Context.BppID = "beckn-zk-bpp-" + h.personality

	if h.bppURI != "" {
		resp.Context.BppURI = h.bppURI
	} else {
		resp.Context.BppURI = "https://beckn-zk-bpp-" + h.personality + ".fly.dev"
	}
	resp.Context.Timestamp = time.Now().UTC().Format(time.RFC3339)

	// If gamma and no proof, return a redacted catalog (first provider only).
	if h.personality == "lab-gamma" && !hasProof && len(resp.Message.Catalog.Providers) > 1 {
		resp.Message.Catalog.Providers = resp.Message.Catalog.Providers[:1]
	}

	// Async mode: ACK immediately, fire callback in background.
	if h.callbackClient != nil {
		writeACK(w)
		go func() {
			if err := h.callbackClient.PostOnSearch(resp); err != nil {
				log.Printf("ERROR callback on_search: %v", err)
			}
		}()
		return
	}

	// Sync mode (backward compatible): return on_search directly.
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		panic(err)
	}
}
