# beckn-zk

Zero-knowledge eligibility proofs over Beckn DHP discovery.

Beckn's decentralized health protocol leaks patient intent to every provider on
the network: "I'm searching for an ECG near this GPS" is broadcast in
cleartext. This project demonstrates how a Groth16 ZK proof (anon-aadhaar)
can travel as a Beckn tag — providers verify eligibility without learning
identity, and the network console shows the difference in real time.

## Live

| Service   | URL                                                       |
|-----------|-----------------------------------------------------------|
| BAP web   | https://bap-web-lilac.vercel.app                           |
| BPP alpha | https://beckn-zk-bpp-alpha.fly.dev                        |
| BPP beta  | https://beckn-zk-bpp-beta.fly.dev                         |
| BPP gamma | https://beckn-zk-bpp-gamma.fly.dev                        |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (BAP)                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Search   │  │ anon-    │  │ Network       │ │
│  │ Form     │  │ aadhaar  │  │ Console (SSE) │ │
│  └────┬─────┘  │ prover   │  └───────▲───────┘ │
│       │        └────┬─────┘          │          │
└───────┼─────────────┼────────────────┼──────────┘
        │  POST /api/bap/search        │ GET /api/bap/events
        ▼  (fan-out to 3 BPPs)         │
┌───────────────────────────────────────┤
│  Next.js API (BAP backend)           │
│  ┌──────────────────────────────┐    │
│  │  EventBus (in-process)       ├────┘
│  └──────────────────────────────┘
│       │         │         │
│       ▼         ▼         ▼
│   ┌───────┐ ┌───────┐ ┌───────┐
│   │ alpha │ │ beta  │ │ gamma │
│   │ (Go)  │ │ (Go)  │ │ (Go)  │
│   └───────┘ └───────┘ └───────┘
│   Fly.io    Fly.io    Fly.io
└───────────────────────────────────────┘
```

## Three BPP personalities

| Personality | Behavior | Demo purpose |
|-------------|----------|--------------|
| **lab-alpha** (ZK-ignorant) | Ignores the `zk_proof` tag entirely. Returns catalog regardless. | Backward compatibility — existing BPPs don't break. |
| **lab-beta** (ZK-required) | Returns `403` with error code `40003` if no valid proof is attached. | Strict eligibility gate — no proof, no catalog. |
| **lab-gamma** (ZK-preferred) | Returns full catalog with proof, redacted catalog without. | Graceful degradation — browsing works, detail requires proof. |

## The ZK tag format

The proof travels inside a standard Beckn `TagGroup` on the search intent:

```json
{
  "descriptor": { "code": "zk_proof" },
  "list": [
    { "descriptor": { "code": "scheme" },        "value": "groth16" },
    { "descriptor": { "code": "circuit_id" },     "value": "anon-aadhaar-v2" },
    { "descriptor": { "code": "proof" },          "value": "<base64 Groth16 JSON>" },
    { "descriptor": { "code": "public_inputs" },  "value": "[\"pubkeyHash\",\"nullifier\",...]" },
    { "descriptor": { "code": "nullifier" },      "value": "<decimal field element>" },
    { "descriptor": { "code": "binding" },        "value": "<hex sha256(txId|timestamp)>" }
  ]
}
```

Public inputs (9 signals): `pubkeyHash`, `nullifier`, `timestamp`, `ageAbove18`,
`gender`, `pincode`, `state`, `nullifierSeed`, `signalHash`.

## Run it yourself

```bash
# Prerequisites: Node 20+, pnpm, Go 1.21+
pnpm install

# Start the BAP (Next.js)
pnpm dev:web          # http://localhost:3000

# Start a local BPP (defaults to lab-alpha)
pnpm dev:bpp          # http://localhost:8080

# Or run as a specific personality
BPP_PERSONALITY=lab-beta pnpm dev:bpp

# Run Go tests (Groth16 verifier, tag extractor, binding, nullifier cache)
cd services/bpp && go test ./...

# Curl a BPP health check
curl https://beckn-zk-bpp-alpha.fly.dev/healthz
```

## Repo layout

```
apps/bap-web           Next.js 16 — patient search UI + BAP API routes
services/bpp           Go BPP — Groth16 verifier, three Fly.io instances
packages/beckn-core    Shared TypeScript Beckn 1.1.1 types + builders
docs/plans/            Design doc + phased implementation plans
```

## What's real vs mocked

| Layer | Status |
|-------|--------|
| Groth16 proof generation (browser) | **Real** — anon-aadhaar v2, ~20s proving time |
| Groth16 verification (BPP) | **Real** — circom2gnark, <1ms verification |
| Nullifier replay detection | **Real** — in-memory TTL cache per BPP instance |
| Context binding (txId + timestamp) | **Real** — SHA-256, checked server-side |
| Beckn protocol messages | **Real** — 1.1.1 spec, DHP diagnostics domain |
| Digital signatures on Beckn messages | **Mocked** — no ed25519 signing |
| Beckn registry lookup | **Mocked** — hardcoded BPP URLs |
| Aadhaar QR code | **Test mode** — bundled test QR, not a real Aadhaar |
| Provider catalog data | **Fixture** — static JSON, not a real lab directory |

## Third-party

- `github.com/vocdoni/circom2gnark` (AGPL-3.0) — snarkjs→gnark Groth16 adapter.
  This project links it as a Go dependency; the repo is public so AGPL applies
  only to derivative works of the BPP binary.

## Deploy

```bash
# BAP → Vercel
cd /path/to/beckn-zk && npx vercel --prod

# BPP → Fly.io (per personality)
cd services/bpp
fly deploy --app beckn-zk-bpp-alpha --config fly.alpha.toml --depot=false
fly deploy --app beckn-zk-bpp-beta  --config fly.beta.toml  --depot=false
fly deploy --app beckn-zk-bpp-gamma --config fly.gamma.toml --depot=false
```

## Design doc

See [`docs/plans/2026-04-15-private-beckn/`](docs/plans/2026-04-15-private-beckn/) for the
full design document and phased implementation plans.
