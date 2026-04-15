# Phase 3 — anon-aadhaar Browser Prover

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. This phase has a **hard pivot gate** at Task 3.4 — read the whole phase before starting, so you know when to bail out to the Semaphore fallback.

**Goal:** Get anon-aadhaar v2 generating a real Groth16 proof inside the browser, using the library's bundled test QR, and render the raw proof + public inputs on a standalone `/prove` page. No Beckn integration yet — this phase is isolated so that a prover-layer failure does not block the BPP work.

**Hours:** 3 → 5

**Prereqs:** Phase 2 exit criteria met. BAP can fan out a plaintext `search` to the BPP and render a catalog.

---

## About this phase

The anon-aadhaar library has two moving parts that can bite:

1. **WASM artifacts.** The prover needs a `.zkey`, a `.wasm` witness generator, and a verification key. These are downloaded from a CDN on first use. On a flaky network, or if the CDN is blocked, the first proof will hang. Mitigation: pre-fetch during install, mirror under `/public`.
2. **Test QR format.** anon-aadhaar ships a deterministic test QR that encodes the signed payload. Use it. Do not try to generate one.

If something breaks that isn't one of those two things, **stop and pivot to Semaphore v4** (Task 3.6 describes the pivot).

---

## Task 3.1 — Install anon-aadhaar packages

**Files:**
- Modify: `apps/bap-web/package.json`

**Step 1:** Install the browser SDK:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
pnpm add @anon-aadhaar/react @anon-aadhaar/core
```

Expected: `package.json` now lists both. If the install fails with peer-dep warnings, note them but proceed — anon-aadhaar has historically had noisy peer deps that are safe to ignore.

**Step 2:** Quick smoke import test. Create `apps/bap-web/app/_aa_typecheck.ts`:

```ts
import { AnonAadhaarProvider } from "@anon-aadhaar/react";
const _ = AnonAadhaarProvider;
export {};
```

Build:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm --filter bap-web build
```

Expected: clean build. Delete the file:

```bash
rm /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web/app/_aa_typecheck.ts
```

**Step 3:** Commit:

```bash
git add -A
git commit -m "chore(bap-web): install @anon-aadhaar/react and core"
```

---

## Task 3.2 — Mount the AnonAadhaar provider

**Files:**
- Modify: `apps/bap-web/app/layout.tsx`
- Create: `apps/bap-web/app/providers.tsx`

**Step 1:** Create `apps/bap-web/app/providers.tsx` (client component — the AnonAadhaar provider needs `useState`):

```tsx
"use client";

import { AnonAadhaarProvider } from "@anon-aadhaar/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Test mode uses the bundled test QR and a deterministic verification key.
  // We will flip this to false only if we ever move off the bundled credential.
  return (
    <AnonAadhaarProvider _useTestAadhaar={true}>
      {children}
    </AnonAadhaarProvider>
  );
}
```

**Step 2:** Modify `apps/bap-web/app/layout.tsx`. Wrap `children` with `<Providers>`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Private Beckn",
  description: "ZK-gated discovery over Beckn DHP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

(Preserve whatever the scaffold added for fonts; only inject `<Providers>`.)

**Step 3:** Build:

```bash
pnpm --filter bap-web build
```

Expected: clean build. If anon-aadhaar complains about a missing `next.config` setting for WASM, add this to `apps/bap-web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
```

and rebuild. **If the build still fails after this change, you are in pivot territory — see Task 3.6.**

**Step 4:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): mount AnonAadhaarProvider in test mode"
```

---

## Task 3.3 — Standalone `/prove` page

**Files:**
- Create: `apps/bap-web/app/prove/page.tsx`

**Step 1:** Create `apps/bap-web/app/prove/page.tsx`:

```tsx
"use client";

import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import { useEffect, useState } from "react";

interface AnonAadhaarProof {
  proof: unknown;
  pcd?: unknown;
}

export default function ProvePage() {
  const [anonAadhaar] = useAnonAadhaar();
  const [raw, setRaw] = useState<string>("");

  useEffect(() => {
    if (anonAadhaar.status === "logged-in") {
      const p: AnonAadhaarProof = {
        proof: anonAadhaar.anonAadhaarProofs,
        pcd: anonAadhaar.pcd,
      };
      setRaw(JSON.stringify(p, null, 2));
      console.log("[anon-aadhaar] proof object:", p);
    }
  }, [anonAadhaar]);

  return (
    <main className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl">anon-aadhaar standalone prover</h1>
        <p className="text-xs opacity-60">
          status: <span className="text-green-400">{anonAadhaar.status}</span>
        </p>
        <LogInWithAnonAadhaar nullifierSeed={1234} />
        {raw ? (
          <pre className="bg-neutral-900 border border-neutral-800 p-3 text-[10px] overflow-auto max-h-[60vh]">
            {raw}
          </pre>
        ) : (
          <p className="text-xs opacity-40">
            no proof yet — click the button above, follow the test flow, then
            watch the browser console for progress
          </p>
        )}
      </div>
    </main>
  );
}
```

**Step 2:** Run locally:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm dev:web
```

Open `http://localhost:3000/prove` in a browser. Click the AnonAadhaar button, follow the test-mode flow. This will fetch WASM artifacts on first run (tens of MB) and generate a proof. Expect **15–30 seconds** of wall-clock time.

**Step 3:** When the `<pre>` block fills with a non-empty proof object, and the console shows the proof, **you have crossed the hard pivot gate**. Continue to Task 3.4.

**If after 10 minutes of debugging the proof is not generating — jump to Task 3.6 and pivot.**

**Step 4:** Stop the dev server, then commit:

```bash
git add -A
git commit -m "feat(bap-web): /prove page — standalone anon-aadhaar proof demo"
```

---

## Task 3.4 — Extract and persist the proof shape

**Files:**
- Create: `apps/bap-web/lib/zk.ts`
- Create: `apps/bap-web/lib/zk.test.ts` (optional — see below)

**Goal:** Know the *exact* JSON shape of the proof object so that phase 4's Go verifier can consume it. Do not try to re-verify the proof in TS — trust the library's own verification runs on the browser.

**Step 1:** Run `/prove` again locally, copy the JSON from the `<pre>` block (or the console) into a scratch file `apps/bap-web/lib/fixtures/anon-aadhaar-proof.sample.json` (create the `fixtures` dir). Don't commit the fixture — it's for local reference. Inspect the top-level keys. Expected top-level structure (subject to library version):

```
{
  proof: { groth16Proof: { pi_a, pi_b, pi_c, protocol, curve }, pubkeyHash, nullifier, timestamp, ageAbove18, gender, pincode, state, signalHash },
  pcd: <opaque string blob used by the reference verifier>
}
```

The actual shape may differ slightly by version. **Write down what you see** in a code comment at the top of `apps/bap-web/lib/zk.ts`.

**Step 2:** Create `apps/bap-web/lib/zk.ts`:

```ts
/**
 * anon-aadhaar v2 proof normalization.
 *
 * The library returns a complex proof object with a Groth16 proof plus
 * public signals (nullifier, ageAbove18, gender, pincode, state, signalHash,
 * timestamp, pubkeyHash). We extract the subset the BPP needs and base64-
 * encode the Groth16 proof bytes so it travels cleanly inside a Beckn tag.
 *
 * Actual shape observed at runtime (from /prove page):
 *   TODO: paste the real shape here during Task 3.4.
 */

export interface NormalizedZkProof {
  scheme: "groth16";
  circuitId: "anon-aadhaar-v2";
  /** base64 of the Groth16 proof JSON as produced by snarkjs */
  proof: string;
  /** JSON-stringified array of decimal field-element strings */
  publicInputs: string;
  /** hex string */
  nullifier: string;
  /** hex sha256(transaction_id || timestamp) committed as a public input */
  binding: string;
}

interface RawAnonAadhaarProof {
  // Intentionally permissive — replace with the exact shape you observed
  // during Task 3.4 Step 1.
  groth16Proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  nullifier: string;
  signalHash: string;
  ageAbove18: string;
  pincode: string;
  state: string;
  timestamp: string;
  pubkeyHash: string;
}

export interface NormalizeArgs {
  raw: RawAnonAadhaarProof;
  binding: string;
}

export function normalizeAnonAadhaarProof({
  raw,
  binding,
}: NormalizeArgs): NormalizedZkProof {
  const groth16Json = JSON.stringify(raw.groth16Proof);
  const proofB64 = btoa(groth16Json);

  const publicInputs = JSON.stringify([
    raw.pubkeyHash,
    raw.nullifier,
    raw.timestamp,
    raw.ageAbove18,
    raw.gender ?? "0",
    raw.pincode,
    raw.state,
    raw.signalHash,
  ]);

  return {
    scheme: "groth16",
    circuitId: "anon-aadhaar-v2",
    proof: proofB64,
    publicInputs,
    nullifier: raw.nullifier,
    binding,
  };
}

export async function computeBinding(
  transactionId: string,
  timestamp: string,
): Promise<string> {
  const enc = new TextEncoder();
  const bytes = enc.encode(`${transactionId}|${timestamp}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**Important:** after copying, edit the `RawAnonAadhaarProof` interface to *exactly match* what you observed in Step 1. Do not leave `gender` / `ageAbove18` as guesses — they must match the real shape. This is the contract the Go verifier will depend on.

**Step 3:** Add a small helper to build a Beckn ZK TagGroup from the normalized proof. Append to the same file:

```ts
import type { TagGroup } from "@beckn-zk/core";

export function toZkTagGroup(p: NormalizedZkProof): TagGroup {
  return {
    descriptor: {
      code: "zk_proof",
      name: "Zero-knowledge eligibility proof",
    },
    list: [
      { descriptor: { code: "scheme" }, value: p.scheme },
      { descriptor: { code: "circuit_id" }, value: p.circuitId },
      { descriptor: { code: "proof" }, value: p.proof },
      { descriptor: { code: "public_inputs" }, value: p.publicInputs },
      { descriptor: { code: "nullifier" }, value: p.nullifier },
      { descriptor: { code: "binding" }, value: p.binding },
    ],
  };
}
```

**Step 4:** Typecheck:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm --filter bap-web build
```

**Step 5:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): normalize anon-aadhaar proof into Beckn TagGroup"
```

---

## Task 3.5 — Wire `/prove` page to emit a Beckn tag

**Files:**
- Modify: `apps/bap-web/app/prove/page.tsx`

**Step 1:** Edit `/prove` to also render the Beckn-shaped tag group alongside the raw proof, so you can eyeball that the normalization worked:

```tsx
"use client";

import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import { useEffect, useState } from "react";
import {
  computeBinding,
  normalizeAnonAadhaarProof,
  toZkTagGroup,
  type NormalizedZkProof,
} from "@/lib/zk";
import type { TagGroup } from "@beckn-zk/core";

export default function ProvePage() {
  const [anonAadhaar] = useAnonAadhaar();
  const [normalized, setNormalized] = useState<NormalizedZkProof | null>(null);
  const [tag, setTag] = useState<TagGroup | null>(null);

  useEffect(() => {
    if (anonAadhaar.status !== "logged-in") return;
    const run = async () => {
      const proofs = anonAadhaar.anonAadhaarProofs;
      // The library keys the proofs by index — take the first.
      const first = proofs ? (Object.values(proofs)[0] as unknown) : null;
      if (!first) {
        throw new Error(
          "logged in but no proof object present — library shape changed?",
        );
      }
      // The exact field path depends on the version — adjust to the shape
      // you observed in Task 3.4.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (first as any).proof;
      const binding = await computeBinding(
        "tx-demo-prove-page",
        new Date().toISOString(),
      );
      const n = normalizeAnonAadhaarProof({ raw, binding });
      setNormalized(n);
      setTag(toZkTagGroup(n));
    };
    run().catch((e) => {
      console.error(e);
      throw e;
    });
  }, [anonAadhaar]);

  return (
    <main className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl">anon-aadhaar → Beckn tag</h1>
        <p className="text-xs opacity-60">status: {anonAadhaar.status}</p>
        <LogInWithAnonAadhaar nullifierSeed={1234} />

        {normalized && (
          <section>
            <h2 className="text-sm opacity-60 mb-1">normalized</h2>
            <pre className="bg-neutral-900 border border-neutral-800 p-3 text-[10px] overflow-auto max-h-[30vh]">
              {JSON.stringify(normalized, null, 2)}
            </pre>
          </section>
        )}
        {tag && (
          <section>
            <h2 className="text-sm opacity-60 mb-1">beckn tag group</h2>
            <pre className="bg-neutral-900 border border-neutral-800 p-3 text-[10px] overflow-auto max-h-[30vh]">
              {JSON.stringify(tag, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}
```

Note the one `any` cast — this is the load-bearing exception. The anon-aadhaar raw proof shape comes from a third-party library and the type we need is defined in `zk.ts`. Keep the cast extremely local.

**Step 2:** Run locally, generate a proof, verify that both JSON blocks render and the `beckn tag group` block has exactly the six `list` entries (`scheme`, `circuit_id`, `proof`, `public_inputs`, `nullifier`, `binding`).

**Step 3:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): /prove renders normalized proof + Beckn tag"
```

---

## Task 3.6 — PIVOT TO SEMAPHORE (only if Task 3.3 failed)

**Read this only if `/prove` never produced a proof.**

If anon-aadhaar's WASM pipeline refuses to cooperate and you're past hour 3:30, cut losses and swap in Semaphore v4. The narrative shifts slightly:

- **Before:** "proof that I hold a valid Aadhaar credential and meet eligibility attributes"
- **After:** "proof that I am enrolled in a valid health-scheme group, without revealing which member"

Both are ZK primitives layered on Beckn discovery. The demo still works. You lose the "real Aadhaar" line and gain a cleaner, faster prover.

**Step 1:** Remove anon-aadhaar:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
pnpm remove @anon-aadhaar/react @anon-aadhaar/core
pnpm add @semaphore-protocol/identity @semaphore-protocol/group @semaphore-protocol/proof
```

**Step 2:** Replace `apps/bap-web/app/providers.tsx` with a plain passthrough:

```tsx
"use client";
import type { ReactNode } from "react";
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

**Step 3:** Replace `/prove` with a Semaphore flow. Create `apps/bap-web/app/prove/page.tsx`:

```tsx
"use client";

import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { useState } from "react";

export default function ProvePage() {
  const [output, setOutput] = useState<string>("");

  async function run() {
    // Demo group: 3 fake "patients" enrolled in the scheme.
    const members = [
      new Identity("patient-a"),
      new Identity("patient-b"),
      new Identity("patient-c"),
    ];
    const me = members[0]; // prove I am patient-a without revealing index
    const group = new Group(members.map((m) => m.commitment));

    const scope = 42n;        // demo scope
    const message = 1n;       // demo signal (in real flow, binds to tx)
    const proof = await generateProof(me, group, message, scope);
    setOutput(JSON.stringify(proof, null, 2));
    console.log("[semaphore] proof:", proof);
  }

  return (
    <main className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl">Semaphore v4 prover</h1>
        <button className="bg-white text-black py-2 px-4" onClick={run}>
          Generate proof
        </button>
        {output && (
          <pre className="bg-neutral-900 border border-neutral-800 p-3 text-[10px] overflow-auto max-h-[60vh]">
            {output}
          </pre>
        )}
      </div>
    </main>
  );
}
```

**Step 4:** Rewrite `apps/bap-web/lib/zk.ts` to normalize Semaphore proofs instead. The shape is simpler: `{ merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points }`. Map to the same `NormalizedZkProof` interface (keep the interface identical so Phase 4 does not change shape, only verifier logic).

**Step 5:** Update `README.md` in the repo root to note the pivot:

> Note: anon-aadhaar was the initial target but pivoted to Semaphore v4 on day of build due to WASM artifact flakiness. Same architecture, different primitive.

**Step 6:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "feat(bap-web): pivot ZK primitive to Semaphore v4"
```

**Step 7:** Propagate the pivot to the rest of the plan. Before starting Phase 4, re-read `phase-4-bpp-verifier.md` and understand that the verifier will use `gnark` against Semaphore's PLONK proof instead of anon-aadhaar's Groth16. **You may need to use Semaphore's own Node.js verifier via a small sidecar process, rather than `gnark` directly — this is the ugly-but-ships option if Go can't verify Semaphore natively.**

---

## Phase exit criteria

Stop here. Do not start Phase 4.

Checklist:

- [ ] `/prove` page generates a real proof in the browser.
- [ ] The `beckn tag group` block on `/prove` renders a valid `TagGroup` with 6 entries (or the Semaphore-adjusted set if you pivoted).
- [ ] `zk.ts` contains the accurate `RawAnonAadhaarProof` (or `RawSemaphoreProof`) interface matching observed runtime shape. No guesses.
- [ ] `pnpm --filter bap-web build` is clean.
- [ ] One commit per task.

**Report format:**

```
PHASE 3 DONE
ZK primitive in use: <anon-aadhaar v2 | Semaphore v4>
Proof generation time (wall clock, second run): <seconds>
Pivoted at: <task N or "no">
Commits: <N>
Time spent: <minutes>
Anything surprising: <one line or "nothing">
```
