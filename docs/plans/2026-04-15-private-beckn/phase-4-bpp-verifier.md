# Phase 4 — BPP Verifier

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Strict TDD for this phase — verifier, nullifier cache, and binding check each get written as failing tests first. Commit after each task.

**Goal:** Teach the Go BPP to extract the `zk_proof` TagGroup from `message.intent.tags[]`, verify the Groth16 proof, enforce the `binding` (context hash) check, and reject replayed proofs via a nullifier cache. At the end of this phase, the Go service cryptographically validates every ZK-tagged search.

**Hours:** 5 → 6

**Prereqs:** Phase 3 exit criteria met. You have a working `/prove` page that emits a valid `TagGroup` and you know the exact raw proof shape. **Copy a real proof JSON file from `/prove`'s output and save it as `services/bpp/internal/zk/testdata/sample_proof.json`** — you need a real fixture to test against.

---

## Important: verifier strategy — SETTLED

Pre-build research (commit `442a87e`-adjacent, dispatched during plan writing) confirmed:

**Use `github.com/vocdoni/circom2gnark`.** It is an actively maintained library that parses snarkjs-format `verification_key.json`, `proof.json`, and `public.json`, converts them into `gnark` BN254 Groth16 types (handling the G2 twist-ordering footgun and `(c0,c1)` vs `(A0,A1)` coordinate difference correctly), and verifies via `gnark`'s native Groth16 backend. Vocdoni uses it in production for their voting stack.

Your entire verifier is ~15 lines. No vkey translation to write, no sidecar process.

**One caveat to know, not to fix:** circom2gnark is AGPL-3.0. Fine for this hiring-demo repo (which is public anyway) but worth mentioning in the root README so Finternet sees you noticed. Production answer — which you should be ready to say in the interview — is "rewrite the ~200 lines of point-conversion from snarkjs's documented JSON schema; format math isn't copyrightable, only the code."

Fallback if circom2gnark ever breaks: spawn `node` with `snarkjs.groth16.verify`. Not needed on the happy path.

---

## Task 4.1 — Copy the real sample proof into testdata

**Files:**
- Create: `services/bpp/internal/zk/testdata/sample_proof.json`
- Create: `services/bpp/internal/zk/testdata/sample_public.json`
- Create: `services/bpp/internal/zk/testdata/verification_key.json`

**Step 1:** From the `/prove` page's console output (Phase 3), save:
1. The raw Groth16 proof (`pi_a`, `pi_b`, `pi_c`, `protocol`, `curve`) to `sample_proof.json`.
2. The public inputs array to `sample_public.json`.
3. The verification key (download from `@anon-aadhaar/core` or mirror under `/public`) to `verification_key.json`.

If the library hides the vkey, read the anon-aadhaar GitHub releases for the exact file. Example filename: `circuit_final.zkey` is the proving key; we want the verification key (`verification_key.json`), typically included in the library package.

**Step 2:** Commit testdata:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add services/bpp/internal/zk/testdata
git commit -m "test(bpp): vendor sample anon-aadhaar proof + vkey as testdata"
```

---

## Task 4.2 — Groth16 verifier via circom2gnark

**Files:**
- Create: `services/bpp/internal/zk/verifier.go`
- Create: `services/bpp/internal/zk/verifier_test.go`

**Step 1:** Install dependencies:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go get github.com/vocdoni/circom2gnark@latest
go get github.com/consensys/gnark@latest
go get github.com/consensys/gnark-crypto@latest
```

**Step 2:** Write the failing happy-path test `services/bpp/internal/zk/verifier_test.go`:

```go
package zk

import (
	"os"
	"testing"
)

func loadTestdata(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return b
}

func TestVerifierAcceptsValidProof(t *testing.T) {
	proofJSON := loadTestdata(t, "sample_proof.json")
	publicJSON := loadTestdata(t, "sample_public.json")
	vkeyJSON := loadTestdata(t, "verification_key.json")

	v, err := NewVerifier(vkeyJSON)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	ok, err := v.Verify(proofJSON, publicJSON)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Errorf("expected valid proof to verify")
	}
}

func TestVerifierRejectsTamperedProof(t *testing.T) {
	proofJSON := loadTestdata(t, "sample_proof.json")
	publicJSON := loadTestdata(t, "sample_public.json")
	vkeyJSON := loadTestdata(t, "verification_key.json")

	// Parse, mutate one coordinate, re-serialize.
	tampered := make([]byte, len(proofJSON))
	copy(tampered, proofJSON)
	// Replace the first run of "12345" we find — if sample contains it — or
	// simpler: bitflip a byte somewhere in the middle. For a JSON vkey this
	// will usually produce unparseable JSON, which is fine; the verifier
	// must return (false, err) or (false, nil), never (true, _).
	tampered[len(tampered)/2] ^= 0x01

	v, err := NewVerifier(vkeyJSON)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	ok, _ := v.Verify(tampered, publicJSON)
	if ok {
		t.Errorf("tampered proof must not verify")
	}
}

func TestVerifierRejectsMismatchedPublicInputs(t *testing.T) {
	proofJSON := loadTestdata(t, "sample_proof.json")
	vkeyJSON := loadTestdata(t, "verification_key.json")

	// Replace the first public signal with a different field element so the
	// witness no longer matches the proof. We use a value extremely unlikely
	// to collide with the real public input.
	wrongPublic := []byte(`["1","2","3","4","5","6","7","8"]`)

	v, err := NewVerifier(vkeyJSON)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	ok, _ := v.Verify(proofJSON, wrongPublic)
	if ok {
		t.Errorf("wrong public inputs must not verify")
	}
}
```

**Step 3:** Run — expect compile error:

```bash
go test ./internal/zk/...
```

**Step 4:** Implement `services/bpp/internal/zk/verifier.go`:

```go
// Package zk verifies Groth16 proofs produced by snarkjs/Circom circuits
// (anon-aadhaar v2). Parsing snarkjs JSON into gnark's native BN254 types
// is delegated to github.com/vocdoni/circom2gnark, which handles the
// coordinate-ordering details correctly (in particular the G2 twist
// ordering that differs between snarkjs and gnark).
package zk

import (
	"errors"
	"fmt"

	"github.com/vocdoni/circom2gnark/parser"
)

// Verifier holds a parsed snarkjs verification key. It is safe for concurrent
// use: Verify does not mutate state.
type Verifier struct {
	vkey *parser.CircomVerificationKey
}

func NewVerifier(vkeyJSON []byte) (*Verifier, error) {
	vk, err := parser.UnmarshalCircomVerificationKeyJSON(vkeyJSON)
	if err != nil {
		return nil, fmt.Errorf("parse snarkjs vkey: %w", err)
	}
	return &Verifier{vkey: vk}, nil
}

// Verify accepts snarkjs-format proof JSON and public-signals JSON, and
// returns (true, nil) iff the proof is valid against the loaded vkey.
// Any parse failure is returned as (false, err).
func (v *Verifier) Verify(proofJSON, publicJSON []byte) (bool, error) {
	if v == nil || v.vkey == nil {
		return false, errors.New("verifier not initialized")
	}
	proof, err := parser.UnmarshalCircomProofJSON(proofJSON)
	if err != nil {
		return false, fmt.Errorf("parse snarkjs proof: %w", err)
	}
	pub, err := parser.UnmarshalCircomPublicSignalsJSON(publicJSON)
	if err != nil {
		return false, fmt.Errorf("parse public signals: %w", err)
	}
	gnarkProof, err := parser.ConvertCircomToGnark(proof, v.vkey, pub)
	if err != nil {
		return false, fmt.Errorf("convert to gnark: %w", err)
	}
	return parser.VerifyProof(gnarkProof)
}
```

**API note:** the exact type name `parser.CircomVerificationKey` and function names above are the current public API as of the research report. If `go build` complains that a name differs, check `pkg.go.dev/github.com/vocdoni/circom2gnark/parser` — the package is small (~1 file of top-level API) so the fix is always a one-line rename.

**Step 5:** Run tests until they pass:

```bash
go test ./internal/zk/... -v
```

Expected: all three tests PASS. The first proof-verification will take a noticeable amount of time (hundreds of ms) the first run as gnark warms up curve tables; subsequent verifications are fast.

**Step 6:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bpp): Groth16 verifier via circom2gnark (AGPL noted in README)"
```

**Step 7:** Update the root `README.md` to disclose the AGPL dependency in a one-line "third-party" section. Do not hide it.

```bash
# Edit README.md to add:
# ## Third-party
# - `github.com/vocdoni/circom2gnark` (AGPL-3.0) — snarkjs→gnark Groth16 adapter.
#   The repo is public, so AGPL applies only to derivative works.

git add README.md
git commit -m "docs: disclose circom2gnark AGPL dependency"
```

---

## Task 4.3 — Tag extractor

**Files:**
- Create: `services/bpp/internal/zk/tag.go`
- Create: `services/bpp/internal/zk/tag_test.go`

**Step 1:** Failing test `services/bpp/internal/zk/tag_test.go`:

```go
package zk

import (
	"testing"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

func sampleZkIntent() beckn.Intent {
	return beckn.Intent{
		Category: &beckn.IntentCategory{Descriptor: beckn.Descriptor{Name: "cardiology"}},
		Tags: []beckn.TagGroup{
			{
				Descriptor: beckn.Descriptor{Code: "zk_proof"},
				List: []beckn.Tag{
					{Descriptor: beckn.Descriptor{Code: "scheme"}, Value: "groth16"},
					{Descriptor: beckn.Descriptor{Code: "circuit_id"}, Value: "anon-aadhaar-v2"},
					{Descriptor: beckn.Descriptor{Code: "proof"}, Value: "aGVsbG8="},
					{Descriptor: beckn.Descriptor{Code: "public_inputs"}, Value: `["1","2"]`},
					{Descriptor: beckn.Descriptor{Code: "nullifier"}, Value: "0xdead"},
					{Descriptor: beckn.Descriptor{Code: "binding"}, Value: "0xbeef"},
				},
			},
		},
	}
}

func TestExtractZkTagHappy(t *testing.T) {
	tag, err := ExtractZkTag(sampleZkIntent())
	if err != nil {
		t.Fatal(err)
	}
	if tag.Scheme != "groth16" || tag.CircuitID != "anon-aadhaar-v2" {
		t.Errorf("bad header: %+v", tag)
	}
	if tag.ProofB64 != "aGVsbG8=" || tag.PublicInputsJSON != `["1","2"]` {
		t.Errorf("bad body: %+v", tag)
	}
	if tag.Nullifier != "0xdead" || tag.Binding != "0xbeef" {
		t.Errorf("bad crypto fields: %+v", tag)
	}
}

func TestExtractZkTagMissing(t *testing.T) {
	intent := beckn.Intent{} // no tags
	_, err := ExtractZkTag(intent)
	if err != ErrNoZkTag {
		t.Errorf("expected ErrNoZkTag, got %v", err)
	}
}

func TestExtractZkTagIncomplete(t *testing.T) {
	intent := beckn.Intent{
		Tags: []beckn.TagGroup{
			{
				Descriptor: beckn.Descriptor{Code: "zk_proof"},
				List: []beckn.Tag{
					{Descriptor: beckn.Descriptor{Code: "scheme"}, Value: "groth16"},
				},
			},
		},
	}
	_, err := ExtractZkTag(intent)
	if err == nil {
		t.Errorf("expected error for incomplete zk_proof tag")
	}
}
```

**Step 2:** Run — expect compile error.

**Step 3:** Implement `services/bpp/internal/zk/tag.go`:

```go
package zk

import (
	"errors"
	"fmt"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

var ErrNoZkTag = errors.New("no zk_proof tag present")

type ExtractedTag struct {
	Scheme           string
	CircuitID        string
	ProofB64         string
	PublicInputsJSON string
	Nullifier        string
	Binding          string
}

func ExtractZkTag(intent beckn.Intent) (ExtractedTag, error) {
	var group *beckn.TagGroup
	for i := range intent.Tags {
		if intent.Tags[i].Descriptor.Code == "zk_proof" {
			group = &intent.Tags[i]
			break
		}
	}
	if group == nil {
		return ExtractedTag{}, ErrNoZkTag
	}

	byCode := make(map[string]string, len(group.List))
	for _, t := range group.List {
		byCode[t.Descriptor.Code] = t.Value
	}

	required := []string{"scheme", "circuit_id", "proof", "public_inputs", "nullifier", "binding"}
	for _, code := range required {
		if byCode[code] == "" {
			return ExtractedTag{}, fmt.Errorf("zk_proof tag missing %q", code)
		}
	}

	return ExtractedTag{
		Scheme:           byCode["scheme"],
		CircuitID:        byCode["circuit_id"],
		ProofB64:         byCode["proof"],
		PublicInputsJSON: byCode["public_inputs"],
		Nullifier:        byCode["nullifier"],
		Binding:          byCode["binding"],
	}, nil
}
```

**Step 4:** Run tests:

```bash
go test ./internal/zk/...
```

Expected: all PASS.

**Step 5:** Commit:

```bash
git add -A
git commit -m "feat(bpp): ExtractZkTag parses zk_proof TagGroup"
```

---

## Task 4.4 — Binding check

**Files:**
- Create: `services/bpp/internal/zk/binding.go`
- Create: `services/bpp/internal/zk/binding_test.go`

**Step 1:** Failing test `services/bpp/internal/zk/binding_test.go`:

```go
package zk

import "testing"

func TestComputeBindingMatchesSpec(t *testing.T) {
	// sha256("tx-1|2026-04-15T00:00:00Z") computed offline:
	// echo -n "tx-1|2026-04-15T00:00:00Z" | shasum -a 256
	const expected = "<PASTE HEX FROM shasum COMMAND>"
	got := ComputeBinding("tx-1", "2026-04-15T00:00:00Z")
	if got != expected {
		t.Errorf("binding = %s, want %s", got, expected)
	}
}

func TestVerifyBindingOK(t *testing.T) {
	b := ComputeBinding("tx-1", "2026-04-15T00:00:00Z")
	if err := VerifyBinding(b, "tx-1", "2026-04-15T00:00:00Z"); err != nil {
		t.Errorf("VerifyBinding: %v", err)
	}
}

func TestVerifyBindingMismatch(t *testing.T) {
	b := ComputeBinding("tx-1", "2026-04-15T00:00:00Z")
	if err := VerifyBinding(b, "tx-2", "2026-04-15T00:00:00Z"); err == nil {
		t.Errorf("expected mismatch error")
	}
}
```

**Step 2:** Before running, compute the expected hash once at the terminal and paste into the test:

```bash
printf '%s' "tx-1|2026-04-15T00:00:00Z" | shasum -a 256
```

Copy the hex into the `expected` constant in the test.

**Step 3:** Run — expect compile error.

**Step 4:** Implement `services/bpp/internal/zk/binding.go`:

```go
package zk

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func ComputeBinding(transactionID, timestamp string) string {
	sum := sha256.Sum256([]byte(transactionID + "|" + timestamp))
	return hex.EncodeToString(sum[:])
}

func VerifyBinding(binding, transactionID, timestamp string) error {
	want := ComputeBinding(transactionID, timestamp)
	if binding != want {
		return fmt.Errorf("binding mismatch: proof committed to %q, context is %q", binding, want)
	}
	return nil
}
```

**Step 5:** Run tests:

```bash
go test ./internal/zk/...
```

Expected: all PASS.

**Step 6:** Commit:

```bash
git add -A
git commit -m "feat(bpp): context-binding check for ZK proofs"
```

---

## Task 4.5 — Nullifier cache

**Files:**
- Create: `services/bpp/internal/zk/nullifier.go`
- Create: `services/bpp/internal/zk/nullifier_test.go`

**Step 1:** Failing test `services/bpp/internal/zk/nullifier_test.go`:

```go
package zk

import (
	"testing"
	"time"
)

func TestNullifierCacheFirstSeenSucceeds(t *testing.T) {
	c := NewNullifierCache(time.Minute)
	if err := c.CheckAndStore("0xabc"); err != nil {
		t.Errorf("first insert should succeed, got %v", err)
	}
}

func TestNullifierCacheReplayRejected(t *testing.T) {
	c := NewNullifierCache(time.Minute)
	_ = c.CheckAndStore("0xabc")
	if err := c.CheckAndStore("0xabc"); err == nil {
		t.Errorf("replay should be rejected")
	}
}

func TestNullifierCacheTTLExpires(t *testing.T) {
	c := NewNullifierCache(10 * time.Millisecond)
	_ = c.CheckAndStore("0xabc")
	time.Sleep(20 * time.Millisecond)
	if err := c.CheckAndStore("0xabc"); err != nil {
		t.Errorf("post-TTL insert should succeed, got %v", err)
	}
}
```

**Step 2:** Run — expect compile error.

**Step 3:** Implement `services/bpp/internal/zk/nullifier.go`:

```go
package zk

import (
	"errors"
	"sync"
	"time"
)

var ErrNullifierSeen = errors.New("nullifier already seen (replay)")

type NullifierCache struct {
	ttl  time.Duration
	mu   sync.Mutex
	seen map[string]time.Time
}

func NewNullifierCache(ttl time.Duration) *NullifierCache {
	return &NullifierCache{ttl: ttl, seen: make(map[string]time.Time)}
}

func (c *NullifierCache) CheckAndStore(nullifier string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for k, t := range c.seen {
		if now.Sub(t) > c.ttl {
			delete(c.seen, k)
		}
	}

	if t, ok := c.seen[nullifier]; ok && now.Sub(t) <= c.ttl {
		return ErrNullifierSeen
	}
	c.seen[nullifier] = now
	return nil
}
```

**Step 4:** Run tests:

```bash
go test ./internal/zk/...
```

Expected: all PASS.

**Step 5:** Commit:

```bash
git add -A
git commit -m "feat(bpp): nullifier replay cache with TTL"
```

---

## Task 4.6 — Wire verifier into /search handler (personality-agnostic)

**Files:**
- Modify: `services/bpp/internal/handlers/search.go`
- Modify: `services/bpp/internal/handlers/search_test.go`
- Create: `services/bpp/internal/handlers/search_zk_test.go`

**Step 1:** Add a failing test `services/bpp/internal/handlers/search_zk_test.go` for the ZK-required personality:

```go
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
		t.Errorf("beta without proof should be 403, got %d", w.Code)
	}
}

func TestAlphaAcceptsSearchWithoutProof(t *testing.T) {
	req := basicSearch()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/search", bytes.NewReader(body))
	w := httptest.NewRecorder()
	NewSearchHandler("lab-alpha").ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("alpha without proof should be 200, got %d", w.Code)
	}
}
```

**Step 2:** Run — expect `TestBetaRejectsSearchWithoutProof` to FAIL (handler currently returns 200 for every personality).

**Step 3:** Modify `services/bpp/internal/handlers/search.go` — add personality-aware ZK enforcement. The full replacement:

```go
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
		verifier:    zk.LoadDefaultVerifier(), // reads vkey from embedded testdata; see Task 4.6 step 4
		nullifiers:  zk.NewNullifierCache(10 * time.Minute),
	}
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": beckn.BecknError{Code: code, Message: msg},
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
		// ZK-required: must have a valid proof.
		if !hasProof {
			writeError(w, http.StatusForbidden, "40003", "proof required for this BPP")
			return
		}
	case "lab-alpha":
		// ZK-ignorant: respond regardless. Do not validate even if present.
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
		// tag.ProofB64 is base64 of the snarkjs proof JSON (see Phase 3 zk.ts).
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
```

**Note on base64:** the Beckn tag carries the proof as base64 (so it travels cleanly inside a JSON string value), but the verifier expects raw snarkjs JSON bytes. The handler does the `base64.StdEncoding.DecodeString` inline above — keep the boundary explicit, do not push base64 awareness into the verifier.

**Step 4:** Add `services/bpp/internal/zk/default.go` that loads the vkey from embedded testdata so the handler has a working verifier:

```go
package zk

import (
	_ "embed"
	"log"
)

//go:embed testdata/verification_key.json
var embeddedVKey []byte

func LoadDefaultVerifier() *Verifier {
	v, err := NewVerifier(embeddedVKey)
	if err != nil {
		log.Fatalf("load embedded vkey: %v", err)
	}
	return v
}
```

**Step 5:** Run everything:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go test ./...
```

Expected: all packages PASS.

**Step 6:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bpp): personality-aware ZK enforcement in /search"
```

---

## Task 4.7 — End-to-end smoke test with a real proof

**Step 1:** Run the BPP locally as `lab-beta`:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
BPP_PERSONALITY=lab-beta PORT=8080 go run ./cmd/bpp
```

**Step 2:** In another terminal, run the BAP web app pointed at the local BPP:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
NEXT_PUBLIC_BPP_ALPHA_URL=http://localhost:8080 pnpm dev:web
```

**Step 3:** Visit `http://localhost:3000/prove`, generate a proof. Open the browser devtools, copy the `beckn tag group` JSON.

**Step 4:** Construct a full `search` request by hand in a file `/tmp/search_with_proof.json`:

```json
{
  "context": {
    "domain": "dhp:diagnostics:0.1.0",
    "action": "search",
    "version": "1.1.0",
    "bap_id": "test",
    "bap_uri": "https://test",
    "transaction_id": "tx-demo-prove-page",
    "message_id": "msg-1",
    "timestamp": "<TIMESTAMP YOU USED IN computeBinding>",
    "location": { "country": { "code": "IND" }, "city": { "code": "std:080" } }
  },
  "message": {
    "intent": {
      "tags": [ <PASTED TAG GROUP FROM /prove> ]
    }
  }
}
```

The `timestamp` must match exactly what was used to compute the binding. Because Task 3.5's `/prove` page uses `new Date().toISOString()` at run-time, record the timestamp the proof was generated with (log it in `/prove`).

**Step 5:** Send it:

```bash
curl -s -X POST http://localhost:8080/search \
  -H 'Content-Type: application/json' \
  -d @/tmp/search_with_proof.json | jq '.context.action'
```

Expected: `"on_search"` (proof verified, binding matches, nullifier stored).

**Step 6:** Replay immediately — expect rejection:

```bash
curl -s -X POST http://localhost:8080/search \
  -H 'Content-Type: application/json' \
  -d @/tmp/search_with_proof.json | jq '.error.message'
```

Expected: something containing `"nullifier replay"`.

**Step 7:** Clean up:

```bash
rm /tmp/search_with_proof.json
```

Nothing to commit from this task — it's a smoke test.

---

## Phase exit criteria

Stop here. Do not start Phase 5.

Checklist:

- [ ] `go test ./...` in `services/bpp` all pass (beckn, handlers, zk packages).
- [ ] Verifier accepts the real sample proof from Phase 3.
- [ ] Verifier rejects tampered proof.
- [ ] `lab-alpha` returns 200 without a proof.
- [ ] `lab-beta` returns 403 without a proof, returns 200 with a valid proof.
- [ ] `lab-gamma` returns 200 either way (redacted catalog without proof).
- [ ] Replayed proof is rejected by nullifier cache.
- [ ] Binding mismatch is rejected.
- [ ] No `interface{}`. No silent `err = nil` anywhere.

**Report format:**

```
PHASE 4 DONE
Verifier approach: <gnark | sidecar>
Tests passing: <count>
Verify latency on a real proof (ms): <N>
Commits: <N>
Time spent: <minutes>
Anything surprising: <one line or "nothing">
```
