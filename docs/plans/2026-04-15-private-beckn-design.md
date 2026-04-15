# Private Beckn — Design Doc

**Date:** 2026-04-15
**Author:** Avdhesh
**Status:** Approved for implementation
**Audience:** Internal; demo target is Siddharth Shetty (cofounder, Finternet Labs)
**Goal:** Hiring demo for Finternet Labs — *Founding Infrastructure Engineer, Large-Scale Systems*

---

## 1. One-line pitch

> Beckn is an open discovery protocol, but every `search` message leaks the buyer's intent to every seller on the network. This project adds a zero-knowledge eligibility layer to Beckn — carried as a standard `tags` extension, so it requires no protocol fork — and shows how the same cryptographic primitive bridges into a Finternet-style unified-ledger settlement step.

## 2. Why this, for this audience

Siddharth Shetty is hiring a founding infrastructure engineer for Finternet Labs. The JD asks for distributed systems, applied cryptography, open-source protocol components, and the ability to merge Web2 performance with Web3 composability. This project is built to be concrete evidence of each:

- **Distributed systems:** two services in two languages, real HTTP, real schema validation, deployed on separate infrastructure.
- **Applied cryptography:** Groth16 proof verification on the server path, public-input binding to the Beckn message, no hand-rolled crypto.
- **Open-source protocol component:** the ZK tag is a clean, backwards-compatible extension of Beckn 1.1.1 — any BPP can opt in or ignore it.
- **Web2 + Web3 bridge:** the stretch goal carries a second proof into a settlement service, showing how Beckn discovery composes with unified-ledger settlement.

The demo is the prop; the conversation is the point. The closing line of the demo is *"this is the composability story I'd want to build out if I were on your team."*

## 3. Scope

### In scope (core, must ship)

- **Domain:** Beckn DHP diagnostics (Digital Health Platform, version 1.1.0).
- **Flow:** `search` → `on_search`. One BAP, three BPPs (mocked but distinct), one round trip end-to-end, with and without the ZK tag.
- **Cryptography:** anon-aadhaar v2 proof generation in the browser; Groth16 verification on the BPP service.
- **Three BPP personalities** to demonstrate graceful heterogeneity:
  - `lab-alpha` — *ZK-ignorant.* Ignores the tag, returns its catalog unconditionally.
  - `lab-beta` — *ZK-required.* Rejects searches that don't carry a valid proof. (Think: regulated specialty clinic.)
  - `lab-gamma` — *ZK-preferred.* Returns a fuller catalog when a valid proof is present, a redacted catalog otherwise.
- **Frontend:** Next.js patient app + live network console showing every Beckn message on the wire, with `tags[].zk_proof` highlighted.
- **Deployment:** BAP web on Vercel, BPP service on Fly.io, both reachable via public URLs during the demo.

### Stretch (ship if hour 6 is on-schedule)

- **Beat 4 — the Finternet bridge.** A third Go service, `services/ledger`, exposing `POST /settle`. The `confirm` message carries a second Groth16 proof: *"buyer's unit-of-account balance ≥ item price"* without revealing the balance. The ledger verifies and moves an in-memory balance.
- **Real Aadhaar QR upload path** (default is the bundled test QR).
- **Signed catalog commitments** on `on_search` so the buyer can later prove "the price I was quoted is the price I'm paying" — the integrity half of the settlement story.

### Out of scope (explicit non-goals)

- Running `beckn-onix` or a real `protocol-server`. We mock the network faithfully; we do not operate it.
- `select` / `init` flows. The demo is about discovery; adding three more message types buys nothing narratively.
- Writing new ZK circuits. We use anon-aadhaar v2 off-the-shelf.
- Auth, sessions, persistence. Everything is in-memory. This is a demo, not a product.
- JSON-LD. Beckn does not use it. We use the native `tags: TagGroup[]` extension mechanism.

## 4. Architecture

### 4.1 Repository shape

```
beckn-zk/
├── apps/
│   └── bap-web/              # Next.js 16, TypeScript, Tailwind
│       ├── app/
│       │   ├── page.tsx      # Patient UI + network console
│       │   └── api/bap/      # BAP backend: /search (outbound), /on_search (inbound callback)
│       ├── components/       # PatientApp, NetworkConsole, ProofBadge, etc.
│       └── lib/
│           └── beckn.ts      # Typed message builders
├── services/
│   └── bpp/                  # Go 1.22, net/http + chi
│       ├── cmd/bpp/main.go
│       ├── internal/
│       │   ├── beckn/        # Beckn 1.1.1 types + schema validation
│       │   ├── handlers/     # /search handler, per-personality logic
│       │   ├── zk/           # Groth16 verifier (gnark)
│       │   └── catalog/      # Static DHP sandbox fixtures
│       ├── fly.toml
│       └── Dockerfile
├── packages/
│   └── beckn-core/           # Shared TypeScript Beckn types (for BAP)
├── docs/plans/
│   └── 2026-04-15-private-beckn-design.md   # this doc
├── pnpm-workspace.yaml
└── README.md
```

**Why this shape:** the BPP is a genuinely separate party in Beckn terms, and the hiring target is a systems role. Putting the BPP in Go in its own service is the architectural statement that the candidate understands what the role actually is. The BAP backend lives inside the Next.js app because in a real Beckn deployment a BAP's frontend and backend are the same party — there is no architectural gain from splitting them, and one less deploy target is one fewer thing to break.

### 4.2 Services and their contracts

**`apps/bap-web` (TypeScript / Next.js)**

- `GET /` — patient UI. Left pane: the diagnostic search form. Right pane: the network console.
- `POST /api/bap/search` — called by the patient UI. Constructs a Beckn `search` message, optionally embeds a `zk_proof` TagGroup, fans out to all three BPP URLs, and publishes every outbound/inbound message to a server-sent-events stream consumed by the network console.
- `POST /api/bap/on_search` — the standard Beckn async callback endpoint. BPPs POST their `on_search` responses here. In this demo the BPPs also respond synchronously on the `search` call to keep the network console readable, but the endpoint exists to match the spec shape.
- `GET /api/bap/events` — SSE stream of every message traversing the network, for the console.

**`services/bpp` (Go)**

- `POST /search` — accepts a Beckn `search` request.
  1. Parses and validates the envelope against Beckn 1.1.1 (context required fields, domain, action).
  2. Looks for `message.intent.tags[]` with `descriptor.code == "zk_proof"`.
  3. If found, extracts `scheme`, `circuit_id`, `proof`, `public_inputs` and calls the verifier. On failure, returns `NACK` with `error.code == "40001"` (per Beckn error code convention).
  4. Dispatches to the per-personality handler based on `BPP_PERSONALITY` env var.
  5. Returns a valid Beckn `on_search` response, using static fixtures from `beckn-sandbox/artefacts/DHP/diagnostics/response/response.search.json` as the base catalog.
- `GET /healthz` — liveness. Returns `{ok: true, personality, version}`. Used during the demo to `curl` the live service in front of the interviewer.

Three instances of the same binary are deployed on Fly.io with different `BPP_PERSONALITY` env vars: `lab-alpha` (ignorant), `lab-beta` (required), `lab-gamma` (preferred). One codebase, three personalities — shows modularity.

### 4.3 Data flow — the happy path with a proof

```
Patient UI                 BAP backend                BPP service (Go)
   │                            │                           │
   ├─ "Find ECG near me" ──────▶│                           │
   │                            │                           │
   │◀── generate anon-aadhaar ──┤                           │
   │     proof in-browser       │                           │
   │     (~20s, progress bar)   │                           │
   │                            │                           │
   ├─ proof + search params ───▶│                           │
   │                            ├─ build Beckn search ─────▶│
   │                            │    with tags[].zk_proof   │
   │                            │                           ├─ parse envelope
   │                            │                           ├─ extract tag
   │                            │                           ├─ verify Groth16
   │                            │                           ├─ dispatch personality
   │                            │◀── on_search (catalog) ───┤
   │◀── SSE: outbound + inbound │                           │
   │                            │                           │
   ├─ render catalog            │                           │
   └─ network console shows:
      • outgoing search + highlighted zk_proof tag
      • three on_search responses (one per BPP)
      • verification status per BPP
```

The unhappy paths — proof missing, proof malformed, proof invalid — are visible in the network console as distinct states on the corresponding BPP row. `lab-beta` deliberately rejects missing proofs so the viewer can toggle the ZK mode off and watch one of three BPPs drop out.

### 4.4 The ZK tag format

```json
{
  "descriptor": { "code": "zk_proof", "name": "Zero-knowledge eligibility proof" },
  "list": [
    { "descriptor": { "code": "scheme" },        "value": "groth16" },
    { "descriptor": { "code": "circuit_id" },    "value": "anon-aadhaar-v2" },
    { "descriptor": { "code": "proof" },         "value": "<base64 of proof bytes>" },
    { "descriptor": { "code": "public_inputs" }, "value": "<json-encoded array of field elements>" },
    { "descriptor": { "code": "nullifier" },     "value": "<hex nullifier for anti-replay>" },
    { "descriptor": { "code": "binding" },       "value": "<sha256(context.transaction_id || context.timestamp)>" }
  ]
}
```

Attached at `message.intent.tags[0]`. Two things matter here beyond just carrying the proof:

- **`nullifier`** — binds to the proof so a leaked proof can't be replayed across transactions by an observer. BPP stores seen nullifiers in a TTL cache.
- **`binding`** — commits the proof to the specific Beckn context (`transaction_id + timestamp`) so the proof can't be detached and re-attached to a different search. Verified by hashing the context on the BPP side and checking equality with the public input the prover committed to.

These two details are the difference between "I slapped a proof into a JSON field" and "I thought about an adversary." They cost ~20 lines of code each and are the thing a cryptography-literate interviewer will notice.

### 4.5 Error handling

- Beckn errors use the native `error: { code, message }` envelope. We follow the Beckn error code table: `40001` for malformed context, `40002` for unsupported domain, `40003` for invalid signature/proof.
- Go BPP: panic on programmer error (nil map writes, etc.), structured `error` returns for expected failures, a single top-level recovery middleware that converts panics to `500` with a stable error body. No silent fallbacks. Errors are thrown, not swallowed, consistent with the project's CLAUDE.md convention.
- BAP: any BPP returning a non-200 is rendered in the network console as a failed row with the error code. The overall search does not fail if at least one BPP responds successfully — this is correct Beckn behavior.

### 4.6 Security posture for the demo

Honest about what's real and what's not:

- **Real:** Groth16 verification, nullifier anti-replay, context binding, anon-aadhaar's UIDAI RSA verification inside the circuit, HTTPS on both deployed services (via Vercel and Fly.io).
- **Mocked:** BPP-to-BAP signatures (Beckn uses Ed25519 signed HTTP headers via `Authorization: Signature ...` — we skip this to save a few hours; we mention it as "next thing I'd add" in the demo), persistence (nullifier cache is in-memory), registry lookup (BPP URLs are hardcoded in the BAP instead of resolved via a Beckn registry).

The network console has a small "what's real / what's mocked" legend in the corner. Radical honesty reads as seniority in a hiring demo.

## 5. Technology choices

| Layer             | Choice                                | Why                                                                                                      |
|-------------------|---------------------------------------|----------------------------------------------------------------------------------------------------------|
| BAP frontend      | Next.js 16, TypeScript, Tailwind      | Fastest path for Avdhesh; mirrors the Sonic project's stack.                                             |
| BAP backend       | Next.js route handlers                | Same process as frontend — correct for a BAP in Beckn terms.                                             |
| BPP service       | **Go 1.22**, `chi` router             | Matches the JD's Rust/Go requirement. Go has a gentler one-day ramp than Rust.                           |
| Groth16 verifier  | `github.com/consensys/gnark`          | Production-grade Go ZK library; has standalone Groth16 verification without needing the prover runtime. |
| ZK proof origin   | **anon-aadhaar v2** (browser prover)  | Real UIDAI credential, India DPI story, off-the-shelf — no new circuit.                                  |
| Fallback ZK       | Semaphore v4                          | If anon-aadhaar browser integration stalls by hour 3, we swap in Semaphore and reframe as "group membership — patient belongs to a valid health-scheme cohort." Same demo beats, simpler primitive. |
| Shared types      | `packages/beckn-core` (TS) + duplicated Go types | Go structs are hand-written from the Beckn OpenAPI spec. Not ideal, fine for a day.                      |
| Monorepo          | `pnpm` workspaces                     | Only the TS side needs workspace linking; Go is managed by its own `go.mod`.                             |
| Deploy — BAP      | Vercel                                | Existing flow, one command.                                                                              |
| Deploy — BPP      | Fly.io                                | 5-minute Go HTTP deploy, free tier, three machines for three personalities.                              |
| CI                | none                                  | Not worth the setup time for a one-day build.                                                            |

## 6. The demo narrative (locked)

Four beats, ~3 minutes total. The first three are core; the fourth is the stretch.

**Beat 1 — The leak (30s).** Open the patient app. Search for an ECG (or an HIV PCR, depending on room) in "public mode." Network console lights up: four BPPs just learned this patient searched for this specific test at these coordinates. Narration: *"On an open network, discovery is a privacy leak. Every BPP sees every search. Fine for taxis. Not fine for healthcare, credit, or anything touching identity — which is most of Finternet's surface area."*

**Beat 2 — The proof (60s).** Toggle private mode. Scan a (bundled test) Aadhaar QR. Progress bar fills for ~20s while narration covers: *"The browser is generating a Groth16 proof that this patient is ≥ 18 and lives in Karnataka — the only attributes a diagnostics BPP actually needs. UIDAI's RSA signature is verified inside the circuit. Aadhaar number, name, DOB, address — none of it leaves the device."* Search fires. Network console shows the same Beckn envelope, with `intent.tags[0]` highlighted as a `zk_proof` TagGroup. No PII on the wire.

**Beat 3 — The heterogeneous network (45s).** The console splits into three BPP rows. `lab-alpha` ignores the tag and responds with its full catalog — *backwards compatibility*. `lab-beta` verifies the proof and returns its catalog — *the happy path*. `lab-gamma` verifies and returns an *expanded* catalog, demonstrating that the same proof can unlock richer data. Toggle ZK mode off and re-fire: `lab-beta` drops out with a `40003` error. Narration: *"Three BPPs, one tag, no fork, no version bump. The network can evolve heterogeneously. This is the composability I care about."*

**Beat 4 — The Finternet bridge (45s, stretch).** Click Book on an item. A second proof is generated: *"my unit-of-account balance is ≥ this price."* The `confirm` message carries it. A third service — `services/ledger`, also in Go — verifies the proof and moves an in-memory balance. Narration: *"The discovery layer proved eligibility without leaking identity. The settlement layer proves solvency without leaking balance. Same primitive, two points in the flow. That's the composability story I'd want to build out if I were on your team."*

The last sentence is the ask.

## 7. Risks and mitigations

| Risk                                                         | Likelihood | Mitigation                                                                                     |
|--------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------|
| anon-aadhaar browser integration is finicky                  | Medium     | Hard deadline: 3 hours. If not working by hour 3, pivot to Semaphore v4. Re-plan the narration. |
| gnark Groth16 verifier doesn't accept anon-aadhaar's proof format | Medium | Check verifier key format compatibility in hour 1 before committing. Fallback: verify in a small Node sidecar process called by the Go service. Ugly but ships. |
| Fly.io deploy fails under time pressure                      | Low        | Deploy a hello-world BPP to Fly.io in hour 1, before writing real code. De-risks the unknown.   |
| Proving time (~20s) feels bad live                           | Low        | Embrace it: narrate during the wait. Rehearse once.                                             |
| Beat 4 eats the day                                          | Medium     | Hard cut at hour 6. If core is not polished, Beat 4 does not ship.                              |
| Siddharth doesn't care about healthcare specifically          | Low        | Narrative works equally well swapping DHP for financial-services; the point is privacy-preserving discovery. Keep a one-line pivot ready. |

## 8. Success criteria

The day is a success if, by end of day:

1. A live Vercel URL serves the patient app.
2. Three live Fly.io URLs serve the three BPP personalities.
3. The demo runs end-to-end from a cold laptop on hotel wifi in under 3 minutes without any local services running.
4. The `services/bpp/` directory is a clean, readable Go codebase a hiring manager would enjoy reading — ~500–800 LOC, no `interface{}` anywhere, tests for the ZK verifier and the handler happy/unhappy paths.
5. The repo README explains the architecture clearly enough that Siddharth could understand the project from the README alone without a walkthrough.

Stretch success: Beat 4 ships, bringing the service count to two and the proof count to two.

## 9. Open questions to resolve during implementation

- Exact anon-aadhaar v2 API surface for browser proving — confirm in hour 1 by building a standalone "generate proof, log it" page before integrating with the Beckn flow.
- Whether `gnark` can directly consume anon-aadhaar's `verification_key.json` and `proof.json`, or whether a format shim is needed. Confirm in hour 1.
- SSE vs. WebSocket for the network console — defaulting to SSE, will switch if a latency issue appears. (It won't.)

---

## Approval

Design approved by Avdhesh on 2026-04-15. Next step: hand off to the `writing-plans` skill to produce the hour-by-hour implementation plan.
