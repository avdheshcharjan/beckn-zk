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
