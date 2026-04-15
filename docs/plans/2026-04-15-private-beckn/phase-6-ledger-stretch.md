# Phase 6 — Ledger Stretch (Finternet Bridge)

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. **HARD GATE:** Do not start this phase unless the Phase 5 exit criteria are 100% green and you are at or before hour 8. If either is not true, stop here and focus on rehearsing the demo and polishing the README.

**Goal:** Add Beat 4 — the Finternet settlement bridge. Introduce a third Go service `services/ledger`, a `confirm`-time second ZK proof ("my balance ≥ this price"), and a mocked unified-ledger panel in the UI. Bring the total service count to two (BPP + ledger) and proof count to two (eligibility + solvency).

**Why this phase is optional:** The core demo (phases 1–5) already tells a complete story. Phase 6 upgrades it from "I understand Beckn + ZK" to "I understand the Beckn → Finternet composability arc," which is the exact narrative the JD asks for. High reward, but genuinely risky in a tired hour 8–10.

**Hours:** 8 → 10

---

## The scope deal

Because this is a stretch and we're tired, we deliberately cut corners that we would not cut in core:

- **No new ZK circuit.** The second proof uses the *same* anon-aadhaar circuit (or Semaphore, if you pivoted), reframed. We just prove the user holds *any* valid credential, and pretend that corresponds to a "solvent account holder." This is cryptographically identical to the first proof, narratively different. We name it differently and display it differently. **Do not attempt to build a real range-proof circuit in 2 hours. It will not ship.**
- **No real balances.** The ledger service keeps an in-memory `map[string]int64`. Two hardcoded accounts. That's it.
- **No real `init` flow.** We shortcut straight from `search` to `confirm`, skipping `select` and `init`. This is not spec-correct Beckn, but the demo audience is reading the network console, not auditing message sequencing.

If any of these corners feel wrong, **skip this phase entirely and spend the time on rehearsal.**

---

## Task 6.1 — Scaffold the ledger service

**Files:**
- Create: `services/ledger/go.mod`
- Create: `services/ledger/cmd/ledger/main.go`
- Create: `services/ledger/internal/store/store.go`
- Create: `services/ledger/internal/store/store_test.go`
- Create: `services/ledger/Dockerfile`
- Create: `services/ledger/fly.toml`

**Step 1:** Init the module:

```bash
mkdir -p /Users/avuthegreat/side-quests/beckn-zk/services/ledger/cmd/ledger
mkdir -p /Users/avuthegreat/side-quests/beckn-zk/services/ledger/internal/store
cd /Users/avuthegreat/side-quests/beckn-zk/services/ledger
go mod init github.com/avdhesh/beckn-zk/services/ledger
go get github.com/go-chi/chi/v5@latest
```

**Step 2:** Failing test `services/ledger/internal/store/store_test.go`:

```go
package store

import "testing"

func TestDebitHappyPath(t *testing.T) {
	s := NewMemory()
	s.SetBalance("patient-a", 10000)
	if err := s.Debit("patient-a", 3000); err != nil {
		t.Fatal(err)
	}
	if s.Balance("patient-a") != 7000 {
		t.Errorf("expected 7000, got %d", s.Balance("patient-a"))
	}
}

func TestDebitInsufficient(t *testing.T) {
	s := NewMemory()
	s.SetBalance("patient-a", 1000)
	if err := s.Debit("patient-a", 3000); err == nil {
		t.Errorf("expected insufficient funds error")
	}
}

func TestDebitUnknownAccount(t *testing.T) {
	s := NewMemory()
	if err := s.Debit("ghost", 100); err == nil {
		t.Errorf("expected unknown account error")
	}
}
```

**Step 3:** Implement `services/ledger/internal/store/store.go`:

```go
package store

import (
	"errors"
	"fmt"
	"sync"
)

var (
	ErrUnknownAccount = errors.New("unknown account")
	ErrInsufficient   = errors.New("insufficient funds")
)

type Memory struct {
	mu       sync.Mutex
	balances map[string]int64
}

func NewMemory() *Memory {
	return &Memory{balances: make(map[string]int64)}
}

func (m *Memory) SetBalance(account string, v int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.balances[account] = v
}

func (m *Memory) Balance(account string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.balances[account]
}

func (m *Memory) Debit(account string, amount int64) error {
	if amount <= 0 {
		return fmt.Errorf("debit: non-positive amount %d", amount)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	bal, ok := m.balances[account]
	if !ok {
		return ErrUnknownAccount
	}
	if bal < amount {
		return ErrInsufficient
	}
	m.balances[account] = bal - amount
	return nil
}

func (m *Memory) Snapshot() map[string]int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]int64, len(m.balances))
	for k, v := range m.balances {
		out[k] = v
	}
	return out
}
```

**Step 4:** Run tests:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/ledger
go test ./...
```

Expected: all PASS.

**Step 5:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(ledger): scaffold in-memory ledger store with debit tests"
```

---

## Task 6.2 — Ledger HTTP service with `/settle` and `/snapshot`

**Files:**
- Create: `services/ledger/cmd/ledger/main.go`
- Create: `services/ledger/internal/handlers/settle.go`
- Create: `services/ledger/internal/handlers/settle_test.go`

**Step 1:** Decide the settle request shape. It carries:

```json
{
  "transaction_id": "tx-...",
  "account": "patient-a",
  "amount": 3000,
  "currency": "INR",
  "solvency_proof": {
    "scheme": "groth16",
    "circuit_id": "anon-aadhaar-v2",
    "proof": "<base64>",
    "public_inputs": "[...]",
    "nullifier": "0x...",
    "binding": "0x..."
  }
}
```

**Step 2:** Failing test `services/ledger/internal/handlers/settle_test.go`:

```go
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
```

**Step 3:** Implement `services/ledger/internal/handlers/settle.go`:

```go
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
	Scheme        string `json:"scheme"`
	CircuitID     string `json:"circuit_id"`
	Proof         string `json:"proof"`
	PublicInputs  string `json:"public_inputs"`
	Nullifier     string `json:"nullifier"`
	Binding       string `json:"binding"`
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
```

**Step 4:** Write `services/ledger/cmd/ledger/main.go` — wire the handler, add `/snapshot` and `/healthz`:

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/avdhesh/beckn-zk/services/ledger/internal/handlers"
	"github.com/avdhesh/beckn-zk/services/ledger/internal/store"
)

// acceptAllVerifier is the stub we use for the demo — real verification would
// import the same zk package as the BPP, but cross-module ZK is a day-2 job.
type acceptAllVerifier struct{}

func (acceptAllVerifier) Verify(proofB64 string, publicInputs string) (bool, error) {
	if proofB64 == "" {
		return false, nil
	}
	return true, nil
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	mem := store.NewMemory()
	mem.SetBalance("patient-a", 10000)
	mem.SetBalance("patient-b", 500)

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "service": "ledger"})
	})
	r.Get("/snapshot", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mem.Snapshot())
	})
	r.Method(http.MethodPost, "/settle", handlers.NewSettleHandler(mem, acceptAllVerifier{}))

	log.Printf("ledger listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
```

**Step 5:** Dockerfile (copy the BPP one and adjust):

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/ledger ./cmd/ledger

FROM alpine:3.20
COPY --from=build /out/ledger /usr/local/bin/ledger
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/ledger"]
```

**Step 6:** `services/ledger/fly.toml`:

```toml
app = "beckn-zk-ledger"
primary_region = "bom"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[http_service.checks]]
  grace_period = "5s"
  interval = "15s"
  method = "GET"
  path = "/healthz"
  timeout = "2s"
```

**Step 7:** Local smoke test:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/ledger
go test ./...
PORT=8090 go run ./cmd/ledger &
sleep 1
curl -s http://localhost:8090/snapshot | jq .
curl -s -X POST http://localhost:8090/settle \
  -H 'Content-Type: application/json' \
  -d '{"transaction_id":"tx-1","account":"patient-a","amount":3000,"currency":"INR","solvency_proof":{"scheme":"groth16","circuit_id":"anon-aadhaar-v2","proof":"aGVsbG8=","public_inputs":"[]","nullifier":"0x1","binding":"0x2"}}' | jq .
curl -s http://localhost:8090/snapshot | jq .
kill %1
```

Expected: initial snapshot shows `patient-a: 10000`; after settle, `patient-a: 7000`.

**Step 8:** Deploy:

```bash
fly apps create beckn-zk-ledger --org personal
fly deploy --app beckn-zk-ledger
curl -s https://beckn-zk-ledger.fly.dev/snapshot | jq .
```

**Step 9:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(ledger): /settle + /snapshot service deployed to Fly"
```

---

## Task 6.3 — BAP `/api/bap/confirm` route

**Files:**
- Create: `apps/bap-web/app/api/bap/confirm/route.ts`
- Modify: `apps/bap-web/lib/config.ts`

**Step 1:** Add to `apps/bap-web/lib/config.ts`:

```ts
export const LEDGER_URL =
  process.env.NEXT_PUBLIC_LEDGER_URL ?? "https://beckn-zk-ledger.fly.dev";
```

**Step 2:** Create `apps/bap-web/app/api/bap/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { LEDGER_URL } from "@/lib/config";
import { bus } from "@/lib/events";
import type { TagGroup } from "@beckn-zk/core";

export const runtime = "nodejs";

interface ConfirmBody {
  transactionId: string;
  account: string;
  amount: number;
  currency: string;
  solvencyTag: TagGroup;
}

function tagToProofBag(tag: TagGroup): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tag.list) {
    if (t.descriptor.code) out[t.descriptor.code] = t.value;
  }
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConfirmBody;
  const proof = tagToProofBag(body.solvencyTag);

  bus.publish({
    id: randomUUID(),
    kind: "search.outbound",
    transactionId: body.transactionId,
    timestamp: new Date().toISOString(),
    payload: { action: "confirm", account: body.account, amount: body.amount, solvency_proof: proof },
    zk: true,
  });

  const res = await fetch(`${LEDGER_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_id: body.transactionId,
      account: body.account,
      amount: body.amount,
      currency: body.currency,
      solvency_proof: proof,
    }),
  });
  const respBody = await res.json();

  bus.publish({
    id: randomUUID(),
    kind: res.ok ? "search.inbound" : "search.error",
    transactionId: body.transactionId,
    timestamp: new Date().toISOString(),
    payload: respBody,
    zk: true,
  });

  return NextResponse.json({ status: res.status, body: respBody });
}
```

**Step 3:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): /api/bap/confirm routes to ledger"
```

---

## Task 6.4 — Ledger panel in the UI

**Files:**
- Create: `apps/bap-web/app/components/LedgerPanel.tsx`
- Modify: `apps/bap-web/app/page.tsx`
- Modify: `apps/bap-web/app/components/CatalogList.tsx`

**Step 1:** Create `apps/bap-web/app/components/LedgerPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface Snapshot {
  [account: string]: number;
}

interface Props {
  ledgerUrl: string;
  refreshKey: number;
}

export function LedgerPanel({ ledgerUrl, refreshKey }: Props) {
  const [snap, setSnap] = useState<Snapshot>({});
  useEffect(() => {
    fetch(`${ledgerUrl}/snapshot`)
      .then((r) => r.json() as Promise<Snapshot>)
      .then(setSnap)
      .catch(() => setSnap({}));
  }, [ledgerUrl, refreshKey]);

  return (
    <div className="border border-neutral-800 p-3 font-mono text-xs">
      <div className="opacity-60 uppercase tracking-widest mb-2">
        Unified ledger (mock)
      </div>
      {Object.entries(snap).length === 0 ? (
        <p className="opacity-40">unreachable</p>
      ) : (
        <ul>
          {Object.entries(snap).map(([account, bal]) => (
            <li key={account} className="flex justify-between">
              <span>{account}</span>
              <span>{bal} INR</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 2:** Modify `apps/bap-web/app/components/CatalogList.tsx` to add a Book button per item that calls an `onBook(item)` prop. Add the prop:

```tsx
import type { OnSearchResponse, Item } from "@beckn-zk/core";

interface Props {
  outcomes: {
    bppUrl: string;
    bppId?: string;
    status: number;
    body: OnSearchResponse | { error: { code: string; message: string } };
  }[];
  onBook?: (item: Item) => void;
}

export function CatalogList({ outcomes, onBook }: Props) {
  // ... existing rendering ...
  // In the <li> for each item, add:
  //   <button className="text-xs underline" onClick={() => onBook?.(it)}>book</button>
}
```

(Edit the existing component body to include the button — do not paste the whole file, use Edit.)

**Step 3:** Modify `apps/bap-web/app/page.tsx` to add the ledger panel and wire up book:

```tsx
// In imports, add:
import { LedgerPanel } from "./components/LedgerPanel";
import { LEDGER_URL } from "@/lib/config"; // add a NEXT_PUBLIC_LEDGER_URL-safe re-export

// In the Home component, add state:
const [ledgerKey, setLedgerKey] = useState(0);

// Add a book handler. For the demo, we reuse the same anon-aadhaar proof as
// the solvency proof — cryptographically identical, narratively "solvency":
async function onBook(item: /* Item */ unknown) {
  if (anonAadhaar.status !== "logged-in") {
    throw new Error("need a proof before booking");
  }
  const proofs = anonAadhaar.anonAadhaarProofs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = proofs ? (Object.values(proofs)[0] as any) : null;
  if (!first) throw new Error("proof missing");
  const txId = crypto.randomUUID();
  const ts = new Date().toISOString();
  const binding = await computeBinding(txId, ts);
  const normalized = normalizeAnonAadhaarProof({ raw: first.proof, binding });
  const solvencyTag = toZkTagGroup(normalized);
  // Rename descriptor to make the intent clear in the console:
  solvencyTag.descriptor = { code: "solvency_proof", name: "Solvency proof" };

  const res = await fetch("/api/bap/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionId: txId,
      account: "patient-a",
      amount: 3000, // TODO: use item.price.value
      currency: "INR",
      solvencyTag,
    }),
  });
  if (!res.ok) throw new Error(`confirm failed: ${res.status}`);
  setLedgerKey((k) => k + 1);
}

// In the JSX, add below CatalogList:
//   <LedgerPanel ledgerUrl={process.env.NEXT_PUBLIC_LEDGER_URL ?? "https://beckn-zk-ledger.fly.dev"} refreshKey={ledgerKey} />
// And pass onBook to CatalogList.
```

**Step 4:** Build:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm --filter bap-web build
```

Expected: clean build. Fix any type errors before moving on — do not suppress.

**Step 5:** Deploy:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
npx vercel env add NEXT_PUBLIC_LEDGER_URL production
# paste: https://beckn-zk-ledger.fly.dev
npx vercel --prod --yes
```

**Step 6:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bap-web): ledger panel + /confirm flow for Beat 4"
```

---

## Task 6.5 — End-to-end Beat 4 rehearsal

Run the full narrative once, timed, from a cold Vercel URL:

1. Beat 1 (leak) — ZK off, search, point at the network console. `lab-beta` errors.
2. Beat 2 (proof) — ZK on, prove, search. Network console shows proof on wire.
3. Beat 3 (heterogeneous) — point at the three BPP rows, explain personalities.
4. Beat 4 (settlement) — click Book on any item. Ledger panel updates from 10000 → 7000. Network console shows the `solvency_proof` tag inside the `confirm` outbound.

If the entire arc runs under 4 minutes without any fallback to "let me reload," you are done.

No commit.

---

## Phase exit criteria

Stop. You are done with the build.

Checklist:

- [ ] `services/ledger` tests pass.
- [ ] Ledger deployed to `https://beckn-zk-ledger.fly.dev`.
- [ ] `GET /snapshot` returns `{"patient-a":10000,"patient-b":500}`.
- [ ] Book flow debits the balance live.
- [ ] Network console shows both the eligibility proof (on search) and the solvency proof (on confirm), each highlighted.
- [ ] Full demo arc under 4 minutes, cold.

**Report format:**

```
PHASE 6 DONE — STRETCH SHIPPED
Ledger URL: https://beckn-zk-ledger.fly.dev
Full arc time (cold): <seconds>
Commits: <N>
Time spent: <minutes>
Ready to rehearse for the meeting? <yes/no>
```

---

## If you skipped phase 6

Use the time for:

1. **Rehearsal.** Run the core demo 5 times. Time each run. Note where you fumble.
2. **README polish.** Tighten the self-guided README. Add one architecture diagram.
3. **One-page brief.** Write a 200-word PDF/markdown you can send Siddharth after the meeting summarizing the project + a link to the repo + a link to the design doc. This is often what actually closes the loop.
4. **Write a short blog post.** Publishing "I built a ZK layer over Beckn in a day" on personal blog or Twitter is a force multiplier — it turns the demo into an asset that works while you sleep, and gives the hiring manager something concrete to share internally.

The best phase 6 is sometimes not phase 6.
