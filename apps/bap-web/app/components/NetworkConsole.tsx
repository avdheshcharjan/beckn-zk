"use client";

import { useEffect, useRef, useState } from "react";
import type { BecknEvent } from "@/lib/events";

function highlightZkTag(payload: unknown): string {
  const s = JSON.stringify(payload, null, 2);
  // Highlight zk_proof tag blocks and solvency_proof blocks
  return s
    .replace(
      /"code":\s*"zk_proof"[\s\S]*?\]/,
      (match) => `<<<${match}>>>`,
    )
    .replace(
      /"solvency_proof":\s*\{[\s\S]*?\}/,
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
      // Browser will auto-reconnect.
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
              ev.kind === "search.outbound" || ev.kind === "confirm.outbound"
                ? "text-blue-400"
                : ev.kind === "search.inbound" || ev.kind === "confirm.inbound"
                  ? "text-green-400"
                  : "text-red-400";
            const text = highlightZkTag(ev.payload);
            const parts = text.split(/<<<|>>>/);
            return (
              <div key={ev.id} className="border-l-2 border-neutral-800 pl-2">
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
