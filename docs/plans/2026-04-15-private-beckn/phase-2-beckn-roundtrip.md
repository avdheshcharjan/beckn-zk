# Phase 2 — Beckn Round Trip (No ZK Yet)

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Read the whole phase, then execute task-by-task. Commit after each task.

**Goal:** Send a real Beckn 1.1.1 `search` message from the BAP (Next.js route handler) to the Go BPP, have the BPP respond with a real `on_search` from the sandbox fixture, and render the catalog in the patient UI. No ZK in this phase — we are validating the Beckn envelope end-to-end first so that when we add the proof in phase 4, nothing about the wire format is in question.

**Why this phase exists:** The Beckn spec is picky about `context` fields. Getting this wrong with a proof attached is a nightmare to debug because you don't know whether the failure is in the envelope or the verifier. Get the envelope working first.

**Hours:** 1 → 3

**Prereqs:** Phase 1 exit criteria met. Both hello-world services reachable.

---

## Task 2.1 — Shared Beckn types package

**Files:**
- Create: `packages/beckn-core/package.json`
- Create: `packages/beckn-core/tsconfig.json`
- Create: `packages/beckn-core/src/index.ts`
- Create: `packages/beckn-core/src/types.ts`
- Create: `packages/beckn-core/src/builders.ts`

**Background:** Beckn 1.1.1 has dozens of types. We only need the subset touched by `search` / `on_search` for DHP diagnostics: `Context`, `Intent`, `Descriptor`, `Category`, `Item`, `Location`, `Tag`, `TagGroup`, `Catalog`, `Provider`, `Fulfillment`, `Price`. Do not try to transcribe the whole schema.

**Step 1:** Create `packages/beckn-core/package.json`:

```json
{
  "name": "@beckn-zk/core",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

**Step 2:** Create `packages/beckn-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

**Step 3:** Create `packages/beckn-core/src/types.ts` — typed to match the Beckn 1.1.1 core spec, narrow enough to compile cleanly:

```ts
// Beckn 1.1.1 — DHP diagnostics subset
// Spec: https://github.com/beckn/protocol-specifications

export interface Descriptor {
  name?: string;
  code?: string;
  short_desc?: string;
  long_desc?: string;
  images?: { url: string }[];
}

export interface Tag {
  descriptor: Descriptor;
  value: string;
  display?: boolean;
}

export interface TagGroup {
  descriptor: Descriptor;
  list: Tag[];
  display?: boolean;
}

export interface Country {
  code: string;
}

export interface City {
  code: string;
}

export interface Location {
  id?: string;
  gps?: string;
  area_code?: string;
  country?: Country;
  city?: City;
  circle?: {
    gps: string;
    radius: { type: string; value: string; unit: string };
  };
}

export interface Price {
  value: string;
  currency: string;
}

export interface Item {
  id: string;
  descriptor: Descriptor;
  price: Price;
  category_ids?: string[];
  fulfillment_ids?: string[];
  tags?: TagGroup[];
}

export interface Category {
  id: string;
  descriptor: Descriptor;
}

export interface Fulfillment {
  id: string;
  type: string;
}

export interface Provider {
  id: string;
  descriptor: Descriptor;
  locations?: Location[];
  categories?: Category[];
  fulfillments?: Fulfillment[];
  items: Item[];
  tags?: TagGroup[];
}

export interface Catalog {
  descriptor: Descriptor;
  providers: Provider[];
}

export interface Intent {
  category?: { descriptor: Descriptor };
  item?: { descriptor: Descriptor };
  provider?: { id: string };
  location?: Location;
  tags?: TagGroup[];
}

export interface Context {
  domain: string;
  action: "search" | "on_search" | "select" | "on_select" | "init" | "on_init" | "confirm" | "on_confirm";
  location: { country: Country; city: City };
  version: string;
  bap_id: string;
  bap_uri: string;
  bpp_id?: string;
  bpp_uri?: string;
  transaction_id: string;
  message_id: string;
  timestamp: string;
  ttl?: string;
}

export interface BecknError {
  code: string;
  message: string;
}

export interface SearchRequest {
  context: Context;
  message: { intent: Intent };
}

export interface OnSearchResponse {
  context: Context;
  message: { catalog: Catalog };
  error?: BecknError;
}
```

**Step 4:** Create `packages/beckn-core/src/builders.ts` — a small helper for constructing a correct `search` context:

```ts
import { randomUUID } from "node:crypto";
import type { Context, SearchRequest, Intent } from "./types";

export interface BuildSearchArgs {
  bapId: string;
  bapUri: string;
  intent: Intent;
  transactionId?: string;
}

export function buildSearch({
  bapId,
  bapUri,
  intent,
  transactionId,
}: BuildSearchArgs): SearchRequest {
  const context: Context = {
    domain: "dhp:diagnostics:0.1.0",
    action: "search",
    location: {
      country: { code: "IND" },
      city: { code: "std:080" },
    },
    version: "1.1.0",
    bap_id: bapId,
    bap_uri: bapUri,
    transaction_id: transactionId ?? randomUUID(),
    message_id: randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: "PT30S",
  };
  return { context, message: { intent } };
}
```

**Step 5:** Create `packages/beckn-core/src/index.ts`:

```ts
export * from "./types";
export * from "./builders";
```

**Step 6:** Install and typecheck:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm install && pnpm --filter @beckn-zk/core typecheck
```

Expected: zero errors.

**Step 7:** Commit:

```bash
git add -A
git commit -m "feat(beckn-core): Beckn 1.1.1 types and search builder"
```

---

## Task 2.2 — Wire beckn-core into the BAP web app

**Files:**
- Modify: `apps/bap-web/package.json`

**Step 1:** Add the workspace dep. Edit `apps/bap-web/package.json`, add under `"dependencies"`:

```json
"@beckn-zk/core": "workspace:*"
```

**Step 2:** Install:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm install
```

**Step 3:** Smoke-test the import. Create a throwaway file `apps/bap-web/app/_typecheck.ts`:

```ts
import { buildSearch } from "@beckn-zk/core";
// compile-time only — not imported anywhere
const _ = buildSearch;
export {};
```

Build:

```bash
pnpm --filter bap-web build
```

Expected: clean build. Delete `_typecheck.ts` after:

```bash
rm /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web/app/_typecheck.ts
```

**Step 4:** Commit:

```bash
git add -A
git commit -m "chore(bap-web): add @beckn-zk/core workspace dep"
```

---

## Task 2.3 — Copy DHP sandbox fixtures into the Go BPP

**Files:**
- Create: `services/bpp/internal/catalog/fixtures/on_search.json`

**Step 1:** Fetch the fixture from `beckn-sandbox`:

```bash
mkdir -p /Users/avuthegreat/side-quests/beckn-zk/services/bpp/internal/catalog/fixtures
curl -sL https://raw.githubusercontent.com/beckn/beckn-sandbox/main/artefacts/DHP/diagnostics/response/response.search.json \
  -o /Users/avuthegreat/side-quests/beckn-zk/services/bpp/internal/catalog/fixtures/on_search.json
```

**Step 2:** Validate it's real JSON and has the expected shape:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
jq '.context.action, .message.catalog.providers[0].id' internal/catalog/fixtures/on_search.json
```

Expected: `"on_search"` and a provider UUID. If `jq` is missing, install with `brew install jq`.

**Step 3:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "chore(bpp): vendor DHP on_search fixture from beckn-sandbox"
```

---

## Task 2.4 — Go Beckn types (minimal, mirror of beckn-core)

**Files:**
- Create: `services/bpp/internal/beckn/types.go`
- Create: `services/bpp/internal/beckn/types_test.go`

**Step 1:** Write the failing test `services/bpp/internal/beckn/types_test.go`:

```go
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
```

**Step 2:** Run the test — expect failure because `types.go` doesn't exist:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go test ./internal/beckn/...
```

Expected: compile error (type not defined).

**Step 3:** Implement `services/bpp/internal/beckn/types.go`. Structs mirror the TS types from Task 2.1 exactly, with `json` tags:

```go
package beckn

type Descriptor struct {
	Name      string        `json:"name,omitempty"`
	Code      string        `json:"code,omitempty"`
	ShortDesc string        `json:"short_desc,omitempty"`
	LongDesc  string        `json:"long_desc,omitempty"`
	Images    []ImageRef    `json:"images,omitempty"`
}

type ImageRef struct {
	URL string `json:"url"`
}

type Tag struct {
	Descriptor Descriptor `json:"descriptor"`
	Value      string     `json:"value"`
	Display    *bool      `json:"display,omitempty"`
}

type TagGroup struct {
	Descriptor Descriptor `json:"descriptor"`
	List       []Tag      `json:"list"`
	Display    *bool      `json:"display,omitempty"`
}

type Country struct {
	Code string `json:"code"`
}

type City struct {
	Code string `json:"code"`
}

type Circle struct {
	GPS    string `json:"gps"`
	Radius Radius `json:"radius"`
}

type Radius struct {
	Type  string `json:"type"`
	Value string `json:"value"`
	Unit  string `json:"unit"`
}

type Location struct {
	ID       string   `json:"id,omitempty"`
	GPS      string   `json:"gps,omitempty"`
	AreaCode string   `json:"area_code,omitempty"`
	Country  *Country `json:"country,omitempty"`
	City     *City    `json:"city,omitempty"`
	Circle   *Circle  `json:"circle,omitempty"`
}

type Price struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

type Item struct {
	ID             string     `json:"id"`
	Descriptor     Descriptor `json:"descriptor"`
	Price          Price      `json:"price"`
	CategoryIDs    []string   `json:"category_ids,omitempty"`
	FulfillmentIDs []string   `json:"fulfillment_ids,omitempty"`
	Tags           []TagGroup `json:"tags,omitempty"`
}

type Category struct {
	ID         string     `json:"id"`
	Descriptor Descriptor `json:"descriptor"`
}

type Fulfillment struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type Provider struct {
	ID           string        `json:"id"`
	Descriptor   Descriptor    `json:"descriptor"`
	Locations    []Location    `json:"locations,omitempty"`
	Categories   []Category    `json:"categories,omitempty"`
	Fulfillments []Fulfillment `json:"fulfillments,omitempty"`
	Items        []Item        `json:"items"`
	Tags         []TagGroup    `json:"tags,omitempty"`
}

type Catalog struct {
	Descriptor Descriptor `json:"descriptor"`
	Providers  []Provider `json:"providers"`
}

type IntentCategory struct {
	Descriptor Descriptor `json:"descriptor"`
}

type IntentItem struct {
	Descriptor Descriptor `json:"descriptor"`
}

type IntentProvider struct {
	ID string `json:"id"`
}

type Intent struct {
	Category *IntentCategory `json:"category,omitempty"`
	Item     *IntentItem     `json:"item,omitempty"`
	Provider *IntentProvider `json:"provider,omitempty"`
	Location *Location       `json:"location,omitempty"`
	Tags     []TagGroup      `json:"tags,omitempty"`
}

type Context struct {
	Domain        string   `json:"domain"`
	Action        string   `json:"action"`
	Location      LocCC    `json:"location"`
	Version       string   `json:"version"`
	BapID         string   `json:"bap_id"`
	BapURI        string   `json:"bap_uri"`
	BppID         string   `json:"bpp_id,omitempty"`
	BppURI        string   `json:"bpp_uri,omitempty"`
	TransactionID string   `json:"transaction_id"`
	MessageID     string   `json:"message_id"`
	Timestamp     string   `json:"timestamp"`
	TTL           string   `json:"ttl,omitempty"`
}

type LocCC struct {
	Country Country `json:"country"`
	City    City    `json:"city"`
}

type BecknError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type SearchMessage struct {
	Intent Intent `json:"intent"`
}

type SearchRequest struct {
	Context Context       `json:"context"`
	Message SearchMessage `json:"message"`
}

type OnSearchMessage struct {
	Catalog Catalog `json:"catalog"`
}

type OnSearchResponse struct {
	Context Context         `json:"context"`
	Message OnSearchMessage `json:"message"`
	Error   *BecknError     `json:"error,omitempty"`
}
```

**Step 4:** Run the tests:

```bash
go test ./internal/beckn/...
```

Expected: both tests PASS. If the fixture unmarshal test fails, the fixture has a field the structs don't cover — add it, don't suppress it.

**Step 5:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bpp): Beckn 1.1.1 Go types with fixture round-trip test"
```

---

## Task 2.5 — BPP `/search` handler (no ZK)

**Files:**
- Create: `services/bpp/internal/catalog/catalog.go`
- Create: `services/bpp/internal/handlers/search.go`
- Create: `services/bpp/internal/handlers/search_test.go`
- Modify: `services/bpp/cmd/bpp/main.go`

**Step 1:** Embed the fixture. Create `services/bpp/internal/catalog/catalog.go`:

```go
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
```

**Step 2:** Write the failing handler test `services/bpp/internal/handlers/search_test.go`:

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
```

**Step 3:** Run:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go test ./internal/handlers/...
```

Expected: compile error.

**Step 4:** Implement `services/bpp/internal/handlers/search.go`:

```go
package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/catalog"
)

type SearchHandler struct {
	personality string
	baseResp    beckn.OnSearchResponse
}

func NewSearchHandler(personality string) *SearchHandler {
	return &SearchHandler{
		personality: personality,
		baseResp:    catalog.Load(),
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

	// Echo the context into an on_search response, flipping action and adding bpp fields.
	resp := h.baseResp
	resp.Context = req.Context
	resp.Context.Action = "on_search"
	resp.Context.BppID = "beckn-zk-bpp-" + h.personality
	resp.Context.BppURI = "https://beckn-zk-bpp-" + h.personality + ".fly.dev"
	resp.Context.Timestamp = time.Now().UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		panic(err) // encoder failure is not recoverable
	}
}
```

**Step 5:** Run tests:

```bash
go test ./internal/handlers/...
```

Expected: both PASS.

**Step 6:** Wire the handler into `services/bpp/cmd/bpp/main.go`. Replace the whole file with:

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/handlers"
)

type Health struct {
	OK          bool   `json:"ok"`
	Personality string `json:"personality"`
	Version     string `json:"version"`
	Time        string `json:"time"`
}

func main() {
	personality := os.Getenv("BPP_PERSONALITY")
	if personality == "" {
		personality = "lab-alpha"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(Health{
			OK:          true,
			Personality: personality,
			Version:     "0.2.0-roundtrip",
			Time:        time.Now().UTC().Format(time.RFC3339),
		}); err != nil {
			panic(err)
		}
	})

	r.Method(http.MethodPost, "/search", handlers.NewSearchHandler(personality))

	addr := fmt.Sprintf(":%s", port)
	log.Printf("bpp %s listening on %s", personality, addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}
```

**Step 7:** Smoke-test locally:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
go build -o bin/bpp ./cmd/bpp
PORT=8080 ./bin/bpp &
sleep 1
curl -s -X POST http://localhost:8080/search \
  -H 'Content-Type: application/json' \
  -d '{"context":{"domain":"dhp:diagnostics:0.1.0","action":"search","version":"1.1.0","bap_id":"b","bap_uri":"https://b","transaction_id":"t","message_id":"m","timestamp":"2026-04-15T00:00:00Z","location":{"country":{"code":"IND"},"city":{"code":"std:080"}}},"message":{"intent":{}}}' | jq .context.action
kill %1
```

Expected output: `"on_search"`.

**Step 8:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bpp): /search handler returns fixture on_search"
```

---

## Task 2.6 — BAP route handler `/api/bap/search`

**Files:**
- Create: `apps/bap-web/app/api/bap/search/route.ts`
- Create: `apps/bap-web/lib/config.ts`

**Step 1:** Create `apps/bap-web/lib/config.ts`:

```ts
export const BAP_ID = "beckn-zk-bap";
export const BAP_URI =
  process.env.NEXT_PUBLIC_BAP_URI ?? "http://localhost:3000";

// Phase 2: only one BPP. Phase 5 expands this to three personalities.
export const BPP_URLS: string[] = [
  process.env.NEXT_PUBLIC_BPP_ALPHA_URL ??
    "https://beckn-zk-bpp-alpha.fly.dev",
];
```

**Step 2:** Create `apps/bap-web/app/api/bap/search/route.ts`:

```ts
import { NextResponse } from "next/server";
import { buildSearch, type OnSearchResponse } from "@beckn-zk/core";
import { BAP_ID, BAP_URI, BPP_URLS } from "@/lib/config";

export const runtime = "nodejs";

interface ClientSearchBody {
  categoryName?: string;
  itemName?: string;
  gps?: string;
  radiusKm?: string;
}

interface BppOutcome {
  bppUrl: string;
  status: number;
  body: OnSearchResponse | { error: { code: string; message: string } };
}

export async function POST(req: Request) {
  const body = (await req.json()) as ClientSearchBody;

  const search = buildSearch({
    bapId: BAP_ID,
    bapUri: BAP_URI,
    intent: {
      category: body.categoryName
        ? { descriptor: { name: body.categoryName } }
        : undefined,
      item: body.itemName
        ? { descriptor: { name: body.itemName } }
        : undefined,
      location: body.gps
        ? {
            circle: {
              gps: body.gps,
              radius: {
                type: "CONSTANT",
                value: body.radiusKm ?? "5",
                unit: "km",
              },
            },
          }
        : undefined,
    },
  });

  const outcomes: BppOutcome[] = await Promise.all(
    BPP_URLS.map(async (bppUrl): Promise<BppOutcome> => {
      const res = await fetch(`${bppUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(search),
      });
      const respBody = (await res.json()) as BppOutcome["body"];
      return { bppUrl, status: res.status, body: respBody };
    }),
  );

  return NextResponse.json({ request: search, outcomes });
}
```

**Step 3:** Smoke-test locally. In one terminal:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp && PORT=8080 go run ./cmd/bpp
```

In another:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && NEXT_PUBLIC_BPP_ALPHA_URL=http://localhost:8080 pnpm dev:web
```

In a third:

```bash
curl -s -X POST http://localhost:3000/api/bap/search \
  -H 'Content-Type: application/json' \
  -d '{"categoryName":"cardiology","itemName":"ecg","gps":"12.97,77.59","radiusKm":"5"}' \
  | jq '.outcomes[0].body.context.action'
```

Expected: `"on_search"`.

Stop both dev servers.

**Step 4:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): /api/bap/search fans out to BPPs"
```

---

## Task 2.7 — Minimal patient UI

**Files:**
- Modify: `apps/bap-web/app/page.tsx`
- Create: `apps/bap-web/app/components/SearchForm.tsx`
- Create: `apps/bap-web/app/components/CatalogList.tsx`

**Step 1:** Create `apps/bap-web/app/components/SearchForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export interface SearchFormValues {
  categoryName: string;
  itemName: string;
  gps: string;
  radiusKm: string;
}

interface Props {
  onSubmit: (values: SearchFormValues) => void;
  disabled?: boolean;
}

export function SearchForm({ onSubmit, disabled }: Props) {
  const [values, setValues] = useState<SearchFormValues>({
    categoryName: "cardiology",
    itemName: "ecg",
    gps: "12.97,77.59",
    radiusKm: "5",
  });

  return (
    <form
      className="flex flex-col gap-3 font-mono text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      {(["categoryName", "itemName", "gps", "radiusKm"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="opacity-60">{k}</span>
          <input
            className="bg-neutral-900 border border-neutral-700 px-2 py-1"
            value={values[k]}
            onChange={(e) => setValues({ ...values, [k]: e.target.value })}
          />
        </label>
      ))}
      <button
        className="bg-white text-black py-2 disabled:opacity-40"
        disabled={disabled}
      >
        Search
      </button>
    </form>
  );
}
```

**Step 2:** Create `apps/bap-web/app/components/CatalogList.tsx`:

```tsx
import type { OnSearchResponse } from "@beckn-zk/core";

interface Props {
  outcomes: {
    bppUrl: string;
    status: number;
    body: OnSearchResponse | { error: { code: string; message: string } };
  }[];
}

export function CatalogList({ outcomes }: Props) {
  return (
    <div className="flex flex-col gap-4 font-mono text-sm">
      {outcomes.map((o) => {
        const ok = "message" in o.body;
        return (
          <div key={o.bppUrl} className="border border-neutral-800 p-3">
            <div className="flex justify-between opacity-60 text-xs">
              <span>{o.bppUrl}</span>
              <span>{o.status}</span>
            </div>
            {ok ? (
              <ul className="mt-2">
                {o.body.message.catalog.providers.flatMap((p) =>
                  p.items.map((it) => (
                    <li key={p.id + it.id} className="flex justify-between">
                      <span>{it.descriptor.name ?? it.id}</span>
                      <span className="opacity-60">
                        {it.price.value} {it.price.currency}
                      </span>
                    </li>
                  )),
                )}
              </ul>
            ) : (
              <div className="text-red-400 mt-2">
                {o.body.error.code}: {o.body.error.message}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3:** Replace `apps/bap-web/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SearchForm, type SearchFormValues } from "./components/SearchForm";
import { CatalogList } from "./components/CatalogList";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [outcomes, setOutcomes] = useState<
    Parameters<typeof CatalogList>[0]["outcomes"]
  >([]);

  async function onSubmit(values: SearchFormValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/bap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error(`search failed: ${res.status}`);
      }
      const json = (await res.json()) as {
        outcomes: Parameters<typeof CatalogList>[0]["outcomes"];
      };
      setOutcomes(json.outcomes);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-mono mb-6">Private Beckn — DHP</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SearchForm onSubmit={onSubmit} disabled={loading} />
          <CatalogList outcomes={outcomes} />
        </div>
      </div>
    </main>
  );
}
```

**Step 4:** Build:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm --filter bap-web build
```

Expected: clean build.

**Step 5:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): minimal patient UI for search + catalog"
```

---

## Task 2.8 — Redeploy both services and sanity-check live

**Step 1:** Deploy BPP:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
fly deploy --app beckn-zk-bpp-alpha
```

**Step 2:** Deploy BAP:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
npx vercel env add NEXT_PUBLIC_BPP_ALPHA_URL production
# paste: https://beckn-zk-bpp-alpha.fly.dev
npx vercel --prod --yes
```

**Step 3:** Live curl:

```bash
curl -s -X POST https://<vercel-url>/api/bap/search \
  -H 'Content-Type: application/json' \
  -d '{"categoryName":"cardiology","itemName":"ecg","gps":"12.97,77.59","radiusKm":"5"}' \
  | jq '.outcomes[0].body.context.action'
```

Expected: `"on_search"`.

**Step 4:** Commit (env changes, if any config files regenerated):

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git diff --cached --quiet || git commit -m "chore: configure BPP URL env for Vercel"
```

---

## Phase exit criteria

Stop here. Do not start Phase 3.

Checklist:

- [ ] `go test ./...` in `services/bpp` passes (both `beckn` and `handlers` packages).
- [ ] `pnpm --filter bap-web build` succeeds.
- [ ] Local round trip works: Go BPP on `:8080`, Next.js on `:3000`, `POST /api/bap/search` returns `on_search` with providers and items.
- [ ] Live round trip works: `curl` from laptop to Vercel URL returns `on_search` with the fixture catalog.
- [ ] Patient UI renders the catalog.
- [ ] No `any` anywhere in TS code.
- [ ] No `interface{}` anywhere in Go code.

**Report format:**

```
PHASE 2 DONE
Vercel URL: <url>
BPP URL: https://beckn-zk-bpp-alpha.fly.dev
Sample on_search: <first item name, price>
Commits: <N>
Time spent: <minutes>
Anything surprising: <one line or "nothing">
```
