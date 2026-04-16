"use client";

import { useEffect, useState } from "react";

interface Snapshot {
  [account: string]: number;
}

interface Props {
  refreshKey: number;
}

export function LedgerPanel({ refreshKey }: Props) {
  const [snap, setSnap] = useState<Snapshot>({});

  useEffect(() => {
    fetch("/api/bap/ledger")
      .then((r) => r.json() as Promise<Snapshot>)
      .then((data) => {
        if ("error" in data) {
          setSnap({});
        } else {
          setSnap(data);
        }
      })
      .catch(() => setSnap({}));
  }, [refreshKey]);

  return (
    <div className="border border-neutral-800 p-3 font-mono text-xs">
      <div className="opacity-60 uppercase tracking-widest mb-2">
        Unified ledger (mock)
      </div>
      {Object.entries(snap).length === 0 ? (
        <p className="opacity-40">unreachable</p>
      ) : (
        <ul>
          {Object.entries(snap).map(([account, bal]) => (
            <li key={account} className="flex justify-between">
              <span>{account}</span>
              <span>{bal} INR</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
