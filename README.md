# beckn-zk

Zero-knowledge eligibility layer over Beckn DHP discovery. Hiring demo for Finternet Labs.

## Live

| Service      | URL                                             |
|--------------|-------------------------------------------------|
| BAP web      | https://bap-web-avdheshcharjans-projects.vercel.app |
| BPP alpha    | https://beckn-zk-bpp-alpha.fly.dev/healthz       |
| BPP beta     | (phase 5)                                        |
| BPP gamma    | (phase 5)                                        |

## Repo layout

```
apps/bap-web           Next.js 16 patient app + BAP backend
services/bpp           Go BPP — three Fly.io instances by personality
packages/beckn-core    shared TypeScript Beckn 1.1.1 types
docs/plans/            design doc + phased implementation plan
```

## Local dev

```bash
pnpm install
pnpm dev:web          # http://localhost:3000
pnpm dev:bpp          # http://localhost:8080
```

## Third-party

- `github.com/vocdoni/circom2gnark` (AGPL-3.0) — snarkjs→gnark Groth16 adapter.
  The repo is public, so AGPL applies only to derivative works.

## Deploy

```bash
# BAP
cd apps/bap-web && npx vercel --prod

# BPP (per personality)
cd services/bpp && fly deploy --app beckn-zk-bpp-alpha
```
