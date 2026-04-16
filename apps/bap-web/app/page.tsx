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

function extractRawProof(serialized: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = serialized as any;
  if (s?.proof?.groth16Proof) return s.proof;
  if (s?.pcd) {
    const pcd = typeof s.pcd === "string" ? JSON.parse(s.pcd) : s.pcd;
    if (pcd?.proof?.groth16Proof) return pcd.proof;
  }
  if (s?.groth16Proof) return s;
  return null;
}

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
          alert("Generate an anon-aadhaar proof first (click the button above).");
          return;
        }
        const proofs = anonAadhaar.anonAadhaarProofs;
        const first = proofs ? Object.values(proofs)[0] : null;
        if (!first) {
          alert("No proof object found.");
          return;
        }
        const raw = extractRawProof(first);
        if (!raw || !(raw as { groth16Proof?: unknown }).groth16Proof) {
          alert("Unexpected proof shape — check console.");
          console.error("raw proof extraction failed:", first);
          return;
        }
        const ts = new Date().toISOString();
        const binding = await computeBinding("demo-search", ts);
        const normalized = normalizeAnonAadhaarProof({
          raw: raw as Parameters<typeof normalizeAnonAadhaarProof>[0]["raw"],
          binding,
        });
        zkTag = toZkTagGroup(normalized);
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
