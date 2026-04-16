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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      // SerializedPCD has { type, pcd } where pcd is a JSON string.
      // When deserialized the proof lives at .proof on the AnonAadhaarCore.
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
        {mounted ? (
          <>
            <p className="text-xs opacity-60">status: {anonAadhaar.status}</p>
            <LogInWithAnonAadhaar nullifierSeed={1234} />
          </>
        ) : (
          <p className="text-xs opacity-60">loading…</p>
        )}

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
