"use client";

import { useEffect, useState } from "react";

interface Snapshot {
  [account: string]: number;
}

interface Props {
  ledgerUrl: string;
  refreshKey: number;
}

export function LedgerPanel({ ledgerUrl, refreshKey }: Props) {
  const [snap, setSnap] = useState<Snapshot>({});

  useEffect(() => {
    fetch(`${ledgerUrl}/snapshot`)
      .then((r) => r.json() as Promise<Snapshot>)
      .then(setSnap)
      .catch(() => setSnap({}));
  }, [ledgerUrl, refreshKey]);

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
