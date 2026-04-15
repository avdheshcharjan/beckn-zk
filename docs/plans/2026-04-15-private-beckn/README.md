# Private Beckn — Implementation Plan (Master Index)

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement each phase task-by-task. Each phase file is self-contained and can be executed in its own session.

**Goal:** Ship a one-day demo that adds a ZK eligibility layer to Beckn's `search` flow, deployed on Vercel + Fly.io, as a hiring portfolio piece for the Finternet Labs *Founding Infrastructure Engineer* role.

**Design doc:** [../2026-04-15-private-beckn-design.md](../2026-04-15-private-beckn-design.md)

**Architecture:** pnpm monorepo. `apps/bap-web` is a Next.js 16 / TS frontend that also hosts the BAP backend as route handlers. `services/bpp` is a Go 1.22 HTTP service (three personalities via env var) that validates Beckn 1.1.1 envelopes and verifies anon-aadhaar Groth16 proofs extracted from `message.intent.tags[]`. `packages/beckn-core` holds shared TS Beckn types. BAP deploys to Vercel; BPP deploys three times to Fly.io.

**Tech stack:** Next.js 16, TypeScript, Tailwind, pnpm workspaces, Go 1.22, `chi` router, `gnark` (Groth16 verifier), anon-aadhaar v2 (browser prover, Semaphore v4 as fallback), Vercel, Fly.io.

---

## How to use this plan

Each phase is a standalone file. Open one, execute it, commit, then move to the next. Do not load all phases at once — the whole point of splitting them is keeping context small per run.

When executing a phase with Claude Code, paste this into a fresh session:

```
Execute docs/plans/2026-04-15-private-beckn/phase-N-<slug>.md using the
superpowers:executing-plans skill. Do not proceed past the "Phase exit
criteria" block at the bottom. Stop and report when those pass.
```

---

## Phase map

| Phase | Hours | File | What ships |
|-------|-------|------|------------|
| 1 | 0–1 | [phase-1-scaffold.md](phase-1-scaffold.md) | Monorepo skeleton, Next.js app, Go BPP hello-world, both deployed live to Vercel + Fly.io. **Risk-retirement phase** — nothing is real yet, but every deploy-time unknown is dead. |
| 2 | 1–3 | [phase-2-beckn-roundtrip.md](phase-2-beckn-roundtrip.md) | Beckn 1.1.1 TS types, DHP fixtures copied from `beckn-sandbox`, BAP `POST /api/bap/search` fans out to the Go BPP, BPP returns a real `on_search` from the fixture. End-to-end plaintext round trip, no ZK yet. |
| 3 | 3–5 | [phase-3-anon-aadhaar-prover.md](phase-3-anon-aadhaar-prover.md) | anon-aadhaar v2 wired into the browser. Standalone `/prove` page generates a proof from the bundled test QR and logs it. **Pivot gate at hour 3** — if anon-aadhaar isn't producing a proof by the end of this phase, swap in Semaphore v4 per the fallback in the design doc. |
| 4 | 5–6 | [phase-4-bpp-verifier.md](phase-4-bpp-verifier.md) | Go BPP parses `message.intent.tags[]`, extracts the `zk_proof` TagGroup, verifies the Groth16 proof with `gnark`, enforces the `binding` (context hash) and `nullifier` (replay cache) checks. Unit tests for each unhappy path. |
| 5 | 6–8 | [phase-5-personalities-console.md](phase-5-personalities-console.md) | Three Fly.io BPP instances: `lab-alpha` (ZK-ignorant), `lab-beta` (ZK-required), `lab-gamma` (ZK-preferred). Network console in the BAP frontend streams every message via SSE with the `zk_proof` tag highlighted. **This is the hard commit point — by end of phase 5, the core demo works end-to-end.** |
| 6 (stretch) | 8–10 | [phase-6-ledger-stretch.md](phase-6-ledger-stretch.md) | Third Go service `services/ledger`, second proof (solvency) on `confirm`, mocked unified-ledger panel in the UI. **Skip this phase entirely if phase 5 isn't polished.** The hard cut is at hour 6 — if core isn't done, Beat 4 doesn't ship. |

---

## Exit criteria for the full plan

- Live Vercel URL serves the patient app.
- Three live Fly.io URLs serve the three BPP personalities.
- Demo runs end-to-end from a cold laptop in under 3 minutes.
- `services/bpp/` is ~500–800 LOC of clean Go, no `interface{}`, tests pass.
- README explains the architecture well enough that Siddharth could understand the project without a walkthrough.

Stretch: phase 6 ships, bringing the service count to two and the proof count to two.

---

## Rules for execution (read once per session)

1. **TDD where it matters, not everywhere.** Unit tests are required for: the Go BPP verifier, the tag extractor, the nullifier cache, and the context-binding check. Unit tests are not required for Next.js pages or fixture-copy routes. Use the `superpowers:test-driven-development` skill when writing verifier tests.
2. **Commit after every task.** Every numbered task in a phase ends with a commit. Do not batch commits across tasks.
3. **Throw errors early.** No silent fallbacks. No `interface{}`. No `any`. This matches `CLAUDE.md` in the parent workspace and is also the coding posture the JD expects.
4. **If a phase is running long, stop at the phase exit criteria and report.** Do not push into the next phase. The cost of a context handoff is much lower than the cost of an agent that silently drifts into stretch work.
5. **Do not write new ZK circuits.** Phase 3 uses anon-aadhaar v2 off-the-shelf. Phase 6 reuses whatever primitive phase 3 landed on. If phase 3 pivots to Semaphore, phase 6 also pivots — do not mix.
