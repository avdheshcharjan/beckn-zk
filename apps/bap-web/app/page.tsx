"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SearchForm, type SearchFormValues } from "./components/SearchForm";
import { CatalogList } from "./components/CatalogList";
import { NetworkConsole } from "./components/NetworkConsole";
import { LedgerPanel } from "./components/LedgerPanel";
import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import {
  computeBinding,
  normalizeAnonAadhaarProof,
  toZkTagGroup,
} from "@/lib/zk";
import type { TagGroup, Item, OnSearchResponse } from "@beckn-zk/core";

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
  const [ledgerKey, setLedgerKey] = useState(0);
  const [booking, setBooking] = useState(false);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(
    null,
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSE listener for async on_search callbacks (onix mode).
  useEffect(() => {
    if (!activeTransactionId) return;

    const es = new EventSource("/api/bap/events");

    const handler = (msg: MessageEvent) => {
      let ev: { kind: string; transactionId: string; payload: unknown };
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (ev.transactionId !== activeTransactionId) return;
      if (ev.kind !== "search.inbound" && ev.kind !== "search.error") return;

      const payload = ev.payload as OnSearchResponse;
      const bppId = payload?.context?.bpp_id ?? "unknown";
      const isError = ev.kind === "search.error";

      setOutcomes((prev) => [
        ...prev,
        {
          bppId,
          bppUrl: payload?.context?.bpp_uri ?? "",
          status: isError ? 403 : 200,
          body: payload,
        },
      ]);
    };

    es.onmessage = handler;
    return () => es.close();
  }, [activeTransactionId]);

  // 30s timeout for async mode.
  useEffect(() => {
    if (!activeTransactionId) return;
    timeoutRef.current = setTimeout(() => {
      setActiveTransactionId(null);
      setLoading(false);
    }, 30_000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [activeTransactionId]);

  const onSubmit = useCallback(
    async (values: SearchFormValues) => {
      setLoading(true);
      setOutcomes([]);
      setActiveTransactionId(null);

      try {
        let zkTag: TagGroup | null = null;
        let transactionId: string | undefined;
        let timestamp: string | undefined;

        if (zkMode) {
          if (anonAadhaar.status !== "logged-in") {
            alert(
              "Generate an anon-aadhaar proof first (click the button above).",
            );
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
          transactionId = crypto.randomUUID();
          timestamp = new Date().toISOString();
          const binding = await computeBinding(transactionId, timestamp);
          const normalized = normalizeAnonAadhaarProof({
            raw: raw as Parameters<
              typeof normalizeAnonAadhaarProof
            >[0]["raw"],
            binding,
          });
          zkTag = toZkTagGroup(normalized);
        }

        const res = await fetch("/api/bap/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, zkTag, transactionId, timestamp }),
        });

        const json = await res.json();

        // Async mode (onix): stay in loading state, wait for SSE callbacks.
        if (json.mode === "async") {
          if (json.error) {
            setOutcomes([
              {
                bppId: "onix",
                bppUrl: "",
                status: 502,
                body: { error: { code: "ONIX", message: json.error } },
              },
            ]);
            setLoading(false);
          } else {
            setActiveTransactionId(json.transaction_id);
            // loading stays true until SSE events arrive or timeout
          }
          return;
        }

        // Direct mode: outcomes come back synchronously.
        if (!res.ok) {
          throw new Error(`search failed: ${res.status}`);
        }
        setOutcomes(json.outcomes ?? []);
      } finally {
        // Only clear loading in direct mode (async mode manages it via SSE).
        if (!activeTransactionId) {
          setLoading(false);
        }
      }
    },
    [zkMode, anonAadhaar, activeTransactionId],
  );

  async function onBook(item: Item) {
    if (anonAadhaar.status !== "logged-in") {
      alert("Need a proof before booking — enable ZK mode and prove first.");
      return;
    }
    const proofs = anonAadhaar.anonAadhaarProofs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = proofs ? (Object.values(proofs)[0] as any) : null;
    if (!first) {
      alert("No proof found.");
      return;
    }
    const raw = extractRawProof(first);
    if (!raw || !(raw as { groth16Proof?: unknown }).groth16Proof) {
      alert("Proof extraction failed — check console.");
      return;
    }

    setBooking(true);
    try {
      const txId = crypto.randomUUID();
      const ts = new Date().toISOString();
      const binding = await computeBinding(txId, ts);
      const normalized = normalizeAnonAadhaarProof({
        raw: raw as Parameters<typeof normalizeAnonAadhaarProof>[0]["raw"],
        binding,
      });
      const solvencyTag = toZkTagGroup(normalized);
      solvencyTag.descriptor = {
        code: "solvency_proof",
        name: "Solvency proof",
      };

      const amount = parseInt(item.price.value, 10) || 3000;

      const res = await fetch("/api/bap/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: txId,
          account: "patient-a",
          amount,
          currency: item.price.currency ?? "INR",
          solvencyTag,
        }),
      });
      const json = await res.json();
      if (json.status !== 200) {
        alert(`Settlement failed: ${JSON.stringify(json.body)}`);
      }
      setLedgerKey((k) => k + 1);
    } finally {
      setBooking(false);
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

        {loading && activeTransactionId && (
          <p className="text-xs font-mono opacity-60 animate-pulse">
            waiting for on_search callbacks (onix async)...
          </p>
        )}

        <CatalogList
          outcomes={outcomes}
          onBook={
            zkMode && anonAadhaar.status === "logged-in" ? onBook : undefined
          }
        />
        {booking && (
          <p className="text-xs font-mono opacity-60 animate-pulse">
            settling on ledger...
          </p>
        )}

        <LedgerPanel refreshKey={ledgerKey} />
      </section>

      <section className="h-full min-h-0">
        <NetworkConsole />
      </section>
    </main>
  );
}
