# Phase 5 — Three Personalities & Network Console

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. This is the phase where the demo finally *looks* like the demo. Prioritize end-to-end polish over incremental features.

**Goal:** Deploy three Fly.io BPP instances (`lab-alpha`, `lab-beta`, `lab-gamma`), fan out searches to all three from the BAP, and render a live network console in the frontend showing every outbound/inbound message with the `zk_proof` tag highlighted. **This is the hard commit point — end of this phase = demo works end-to-end.**

**Hours:** 6 → 8

**Prereqs:** Phase 4 exit criteria met. Verifier works locally. One Fly.io instance (`alpha`) already deployed from Phase 1.

---

## Task 5.1 — Deploy beta and gamma BPPs to Fly.io

**Files:**
- Create: `services/bpp/fly.alpha.toml`
- Create: `services/bpp/fly.beta.toml`
- Create: `services/bpp/fly.gamma.toml`

**Step 1:** The existing `fly.toml` is effectively "alpha". Rename it and create the other two:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/services/bpp
cp fly.toml fly.alpha.toml
cp fly.toml fly.beta.toml
cp fly.toml fly.gamma.toml
```

**Step 2:** Edit the `app` line in each:

```bash
# fly.alpha.toml → app = "beckn-zk-bpp-alpha"
# fly.beta.toml  → app = "beckn-zk-bpp-beta"
# fly.gamma.toml → app = "beckn-zk-bpp-gamma"
```

Use the Edit tool, one per file.

**Step 3:** Delete the old `fly.toml` so nobody accidentally uses it:

```bash
rm fly.toml
```

**Step 4:** Create and deploy beta:

```bash
fly apps create beckn-zk-bpp-beta --org personal
fly secrets set BPP_PERSONALITY=lab-beta --app beckn-zk-bpp-beta
fly deploy --app beckn-zk-bpp-beta --config fly.beta.toml
```

**Step 5:** Create and deploy gamma:

```bash
fly apps create beckn-zk-bpp-gamma --org personal
fly secrets set BPP_PERSONALITY=lab-gamma --app beckn-zk-bpp-gamma
fly deploy --app beckn-zk-bpp-gamma --config fly.gamma.toml
```

**Step 6:** Re-deploy alpha with the new config flag for consistency:

```bash
fly deploy --app beckn-zk-bpp-alpha --config fly.alpha.toml
```

**Step 7:** Sanity check all three:

```bash
for name in alpha beta gamma; do
  echo -n "$name: "
  curl -s https://beckn-zk-bpp-$name.fly.dev/healthz | jq -r .personality
done
```

Expected:
```
alpha: lab-alpha
beta: lab-beta
gamma: lab-gamma
```

**Step 8:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "chore(bpp): deploy beta and gamma personalities to Fly"
```

---

## Task 5.2 — BAP config points at three BPPs

**Files:**
- Modify: `apps/bap-web/lib/config.ts`

**Step 1:** Replace the single-BPP array with three, each labeled:

```ts
export const BAP_ID = "beckn-zk-bap";
export const BAP_URI =
  process.env.NEXT_PUBLIC_BAP_URI ?? "http://localhost:3000";

export interface BppTarget {
  id: "lab-alpha" | "lab-beta" | "lab-gamma";
  label: string;
  url: string;
  personality: "ignorant" | "required" | "preferred";
}

export const BPP_TARGETS: BppTarget[] = [
  {
    id: "lab-alpha",
    label: "Lab Alpha (ZK-ignorant)",
    url:
      process.env.NEXT_PUBLIC_BPP_ALPHA_URL ??
      "https://beckn-zk-bpp-alpha.fly.dev",
    personality: "ignorant",
  },
  {
    id: "lab-beta",
    label: "Lab Beta (ZK-required)",
    url:
      process.env.NEXT_PUBLIC_BPP_BETA_URL ??
      "https://beckn-zk-bpp-beta.fly.dev",
    personality: "required",
  },
  {
    id: "lab-gamma",
    label: "Lab Gamma (ZK-preferred)",
    url:
      process.env.NEXT_PUBLIC_BPP_GAMMA_URL ??
      "https://beckn-zk-bpp-gamma.fly.dev",
    personality: "preferred",
  },
];
```

**Step 2:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): config for three BPP targets"
```

---

## Task 5.3 — Event bus for the network console (SSE)

**Files:**
- Create: `apps/bap-web/lib/events.ts`
- Create: `apps/bap-web/app/api/bap/events/route.ts`

**Step 1:** Create a minimal in-process event bus `apps/bap-web/lib/events.ts`:

```ts
export type BeckEventKind =
  | "search.outbound"
  | "search.inbound"
  | "search.error";

export interface BecknEvent {
  id: string;
  kind: BeckEventKind;
  bppId?: string;
  transactionId: string;
  timestamp: string;
  /** Raw Beckn payload, pretty-printed for the console. */
  payload: unknown;
  /** True if the outbound message carried a zk_proof tag. */
  zk?: boolean;
}

type Listener = (ev: BecknEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();

  publish(ev: BecknEvent) {
    for (const l of this.listeners) {
      l(ev);
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

// Module-level singleton. Note: this is fine in dev and single-instance prod.
// On Vercel's edge / multi-instance, SSE + in-memory bus won't cross instances;
// for the demo we rely on Vercel's default single-instance Node runtime.
const g = globalThis as unknown as { __becknBus?: EventBus };
export const bus: EventBus = g.__becknBus ?? (g.__becknBus = new EventBus());
```

**Step 2:** Create `apps/bap-web/app/api/bap/events/route.ts`:

```ts
import { bus, type BecknEvent } from "@/lib/events";

export const runtime = "nodejs";

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (ev: BecknEvent) => {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify(ev)}\n\n`),
        );
      };
      const unsub = bus.subscribe(send);
      // Heartbeat every 15s so the connection doesn't time out on proxies.
      const hb = setInterval(() => {
        controller.enqueue(enc.encode(`: heartbeat\n\n`));
      }, 15000);
      const close = () => {
        clearInterval(hb);
        unsub();
        controller.close();
      };
      // There is no direct "client disconnect" hook in Node SSE streams
      // here — the controller will error when the client closes; we swallow.
      void close;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

**Step 3:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): in-process event bus + /api/bap/events SSE stream"
```

---

## Task 5.4 — /api/bap/search publishes to the bus

**Files:**
- Modify: `apps/bap-web/app/api/bap/search/route.ts`

**Step 1:** Replace the handler to fan out to `BPP_TARGETS`, publish one `search.outbound` event and one `search.inbound` per BPP:

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildSearch,
  type OnSearchResponse,
  type TagGroup,
} from "@beckn-zk/core";
import { BAP_ID, BAP_URI, BPP_TARGETS } from "@/lib/config";
import { bus } from "@/lib/events";

export const runtime = "nodejs";

interface ClientSearchBody {
  categoryName?: string;
  itemName?: string;
  gps?: string;
  radiusKm?: string;
  zkTag?: TagGroup | null;
}

interface BppOutcome {
  bppId: string;
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
      tags: body.zkTag ? [body.zkTag] : undefined,
    },
  });

  const txId = search.context.transaction_id;
  const ts = search.context.timestamp;
  const zk = Boolean(body.zkTag);

  // One outbound event per target so the console can show three separate rows.
  for (const t of BPP_TARGETS) {
    bus.publish({
      id: randomUUID(),
      kind: "search.outbound",
      bppId: t.id,
      transactionId: txId,
      timestamp: ts,
      payload: search,
      zk,
    });
  }

  const outcomes = await Promise.all(
    BPP_TARGETS.map(async (t): Promise<BppOutcome> => {
      try {
        const res = await fetch(`${t.url}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(search),
        });
        const respBody = (await res.json()) as BppOutcome["body"];
        bus.publish({
          id: randomUUID(),
          kind: res.ok ? "search.inbound" : "search.error",
          bppId: t.id,
          transactionId: txId,
          timestamp: new Date().toISOString(),
          payload: respBody,
          zk,
        });
        return { bppId: t.id, bppUrl: t.url, status: res.status, body: respBody };
      } catch (err) {
        const payload = {
          error: {
            code: "NETWORK",
            message: err instanceof Error ? err.message : "fetch failed",
          },
        };
        bus.publish({
          id: randomUUID(),
          kind: "search.error",
          bppId: t.id,
          transactionId: txId,
          timestamp: new Date().toISOString(),
          payload,
          zk,
        });
        return { bppId: t.id, bppUrl: t.url, status: 0, body: payload };
      }
    }),
  );

  return NextResponse.json({ request: search, outcomes });
}
```

**Step 2:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): fan-out to three BPPs and publish events"
```

---

## Task 5.5 — Network console UI

**Files:**
- Create: `apps/bap-web/app/components/NetworkConsole.tsx`
- Modify: `apps/bap-web/app/page.tsx`

**Step 1:** Create `apps/bap-web/app/components/NetworkConsole.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { BecknEvent } from "@/lib/events";

function highlightZkTag(payload: unknown): string {
  const s = JSON.stringify(payload, null, 2);
  // Naively highlight the zk_proof block for the demo.
  return s.replace(
    /"code":\s*"zk_proof"[\s\S]*?\]/,
    (match) => `<<<${match}>>>`,
  );
}

export function NetworkConsole() {
  const [events, setEvents] = useState<BecknEvent[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/bap/events");
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as BecknEvent;
      setEvents((prev) => [...prev.slice(-49), ev]);
    };
    es.onerror = () => {
      // Browser will auto-reconnect. No action needed.
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [events]);

  return (
    <div className="flex flex-col h-full border border-neutral-800">
      <div className="px-3 py-2 text-xs uppercase tracking-widest opacity-60 border-b border-neutral-800">
        Beckn network console
      </div>
      <div
        ref={boxRef}
        className="flex-1 overflow-auto p-3 text-[10px] font-mono space-y-4"
      >
        {events.length === 0 ? (
          <p className="opacity-40">no messages yet</p>
        ) : (
          events.map((ev) => {
            const color =
              ev.kind === "search.outbound"
                ? "text-blue-400"
                : ev.kind === "search.inbound"
                  ? "text-green-400"
                  : "text-red-400";
            const text = highlightZkTag(ev.payload);
            const parts = text.split(/<<<|>>>/);
            return (
              <div
                key={ev.id}
                className="border-l-2 border-neutral-800 pl-2"
              >
                <div className={`mb-1 ${color}`}>
                  {ev.kind} · {ev.bppId ?? "*"} ·{" "}
                  {ev.zk ? (
                    <span className="text-yellow-300">ZK</span>
                  ) : (
                    <span className="opacity-40">plain</span>
                  )}
                </div>
                <pre className="whitespace-pre-wrap">
                  {parts.map((p, i) =>
                    i % 2 === 1 ? (
                      <span
                        key={i}
                        className="bg-yellow-400 text-black px-0.5"
                      >
                        {p}
                      </span>
                    ) : (
                      <span key={i}>{p}</span>
                    ),
                  )}
                </pre>
              </div>
            );
          })
        )}
      </div>
      <div className="px-3 py-1 text-[10px] opacity-40 border-t border-neutral-800 flex justify-between">
        <span>
          real: groth16, nullifier, binding · mocked: sigs, registry
        </span>
        <span>{events.length} msgs</span>
      </div>
    </div>
  );
}
```

**Step 2:** Modify `apps/bap-web/app/page.tsx`. Layout is now a two-pane: left = search form + catalog, right = network console. Also wire the ZK toggle + anon-aadhaar proof into the search request:

```tsx
"use client";

import { useState } from "react";
import { SearchForm, type SearchFormValues } from "./components/SearchForm";
import { CatalogList } from "./components/CatalogList";
import { NetworkConsole } from "./components/NetworkConsole";
import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import {
  computeBinding,
  normalizeAnonAadhaarProof,
  toZkTagGroup,
} from "@/lib/zk";
import type { TagGroup } from "@beckn-zk/core";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [outcomes, setOutcomes] = useState<
    Parameters<typeof CatalogList>[0]["outcomes"]
  >([]);
  const [zkMode, setZkMode] = useState(false);
  const [anonAadhaar] = useAnonAadhaar();

  async function onSubmit(values: SearchFormValues) {
    setLoading(true);
    try {
      let zkTag: TagGroup | null = null;

      if (zkMode) {
        if (anonAadhaar.status !== "logged-in") {
          throw new Error(
            "ZK mode enabled but no anon-aadhaar proof present — click 'Prove Aadhaar' first",
          );
        }
        const proofs = anonAadhaar.anonAadhaarProofs;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const first = proofs ? (Object.values(proofs)[0] as any) : null;
        if (!first) {
          throw new Error("anon-aadhaar proof object missing");
        }
        const ts = new Date().toISOString();
        const txId = crypto.randomUUID();
        const binding = await computeBinding(txId, ts);
        const normalized = normalizeAnonAadhaarProof({
          raw: first.proof,
          binding,
        });
        zkTag = toZkTagGroup(normalized);
        // Note: the BAP route will build its own context, so we must override
        // its txId and timestamp to match what we bound to. This is a
        // hand-wave for the demo. A real build would have the BAP route
        // accept an override, or the prover generate the binding from a
        // server-issued nonce.
      }

      const res = await fetch("/api/bap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, zkTag }),
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
    <main className="h-screen bg-black text-white p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="flex flex-col gap-4 overflow-auto">
        <header>
          <h1 className="text-2xl font-mono">Private Beckn — DHP</h1>
          <p className="text-xs opacity-60 font-mono">
            ZK-gated discovery over a real Beckn network
          </p>
        </header>

        <div className="flex gap-3 items-center font-mono text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={zkMode}
              onChange={(e) => setZkMode(e.target.checked)}
            />
            Private mode (ZK)
          </label>
          {zkMode && (
            <span className="opacity-60">
              status: {anonAadhaar.status}
            </span>
          )}
        </div>

        {zkMode && <LogInWithAnonAadhaar nullifierSeed={1234} />}

        <SearchForm onSubmit={onSubmit} disabled={loading} />
        <CatalogList outcomes={outcomes} />
      </section>

      <section className="h-full min-h-0">
        <NetworkConsole />
      </section>
    </main>
  );
}
```

**Note on the binding hand-wave:** the comment in the code calls this out explicitly. For the demo, the mismatch between browser-generated binding and the BAP-assigned txId is papered over by either (a) having the browser pass the generated txId through to the BAP route and the route respecting it, or (b) skipping binding enforcement for `lab-gamma` specifically. For a one-day build, (a) is cleaner. Add one more field to the BAP route body (`overrideTxId`) if needed.

**Step 3:** Build:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk && pnpm --filter bap-web build
```

Expected: clean build.

**Step 4:** Smoke test locally:

```bash
pnpm dev:web
```

Open `http://localhost:3000`, toggle ZK mode, generate a proof, hit search. Expected:
- Network console shows 3 outbound events (blue) followed by 3 inbound events (green).
- `lab-beta` row is yellow-highlighted where the `zk_proof` block sits.
- With ZK off: `lab-beta` row turns red (`search.error`).

**Step 5:** Commit:

```bash
git add -A
git commit -m "feat(bap-web): network console + ZK toggle in search flow"
```

---

## Task 5.6 — Deploy the full stack and verify

**Step 1:** Set env vars on Vercel:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk/apps/bap-web
npx vercel env add NEXT_PUBLIC_BPP_BETA_URL production
# paste: https://beckn-zk-bpp-beta.fly.dev
npx vercel env add NEXT_PUBLIC_BPP_GAMMA_URL production
# paste: https://beckn-zk-bpp-gamma.fly.dev
```

(Alpha URL was already set in Phase 2.)

**Step 2:** Deploy:

```bash
npx vercel --prod --yes
```

**Step 3:** Live smoke test. Open the Vercel URL in a real browser. Go through the entire demo:

1. ZK off → search → expect 2 green rows (alpha, gamma) and 1 red row (beta, 40003).
2. Turn ZK on → generate proof → search → expect 3 green rows, yellow-highlighted zk_proof block on wire.
3. Immediately search again (same proof) → expect alpha and gamma green, beta red with `nullifier replay`.

**Step 4:** Update root `README.md` with all three URLs:

```markdown
| Service      | URL                                             |
|--------------|-------------------------------------------------|
| BAP web      | https://<vercel-url>                            |
| BPP alpha    | https://beckn-zk-bpp-alpha.fly.dev              |
| BPP beta     | https://beckn-zk-bpp-beta.fly.dev               |
| BPP gamma    | https://beckn-zk-bpp-gamma.fly.dev              |
```

**Step 5:** Commit:

```bash
cd /Users/avuthegreat/side-quests/beckn-zk
git add -A
git commit -m "docs: all three BPP URLs live, phase 5 complete"
```

---

## Task 5.7 — README polish for the interviewer

**Files:**
- Modify: `README.md`

**Step 1:** Rewrite the root README to be the self-guided tour. A hiring manager should be able to read this and understand the whole project without any walkthrough. Include:

- One-paragraph *why* (the privacy leak in Beckn discovery)
- Architecture diagram (ASCII, 10 lines max)
- The three BPP personalities and what they demonstrate
- The exact ZK tag format with a real example
- "Run it yourself" section with curl commands
- "What's real vs mocked" honesty block
- A link to the design doc and the phase plans

Keep it under 200 lines. Style is terse and confident, not apologetic.

**Step 2:** Commit:

```bash
git add README.md
git commit -m "docs: self-guided README for interviewer consumption"
```

---

## Phase exit criteria

This is the **core done** point. Demo must work end-to-end.

Checklist:

- [ ] Three Fly.io apps live and healthy.
- [ ] Vercel URL shows the two-pane patient app + network console.
- [ ] ZK toggle off: beta returns 40003, alpha and gamma return catalogs.
- [ ] ZK toggle on + proof generated: all three return catalogs, console highlights the `zk_proof` block.
- [ ] Replayed proof is caught by beta's nullifier cache.
- [ ] Total demo run from cold tab to final catalog: under 3 minutes.
- [ ] README explains the project to a cold reader.

**Report format:**

```
PHASE 5 DONE — CORE COMPLETE
Vercel URL: <url>
Fly URLs: alpha, beta, gamma
Demo time cold-to-catalog: <seconds>
Commits: <N>
Time spent: <minutes>
Ready for stretch phase 6? <yes/no, and why>
```

**Hard cut rule:** if you're past hour 8 and phase 5 isn't fully green, **do not start phase 6**. A tight core beats a loose stretch every time.
