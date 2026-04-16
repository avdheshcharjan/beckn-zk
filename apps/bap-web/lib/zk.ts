/**
 * anon-aadhaar v2 proof normalization.
 *
 * The library returns a complex proof object with a Groth16 proof plus
 * public signals (nullifier, ageAbove18, gender, pincode, state, signalHash,
 * timestamp, pubkeyHash). We extract the subset the BPP needs and base64-
 * encode the Groth16 proof bytes so it travels cleanly inside a Beckn tag.
 *
 * Actual shape from @anon-aadhaar/core@2.4.3 (src/types.ts):
 *
 *   AnonAadhaarProof {
 *     groth16Proof: { pi_a, pi_b, pi_c, protocol }  // snarkjs Groth16Proof
 *     pubkeyHash: string
 *     timestamp: string
 *     nullifierSeed: string
 *     nullifier: string
 *     signalHash: string
 *     ageAbove18: string
 *     gender: string
 *     pincode: string
 *     state: string
 *   }
 *
 * Public signals order (from prover.ts):
 *   [0] pubkeyHash, [1] nullifier, [2] timestamp,
 *   [3] ageAbove18, [4] gender, [5] pincode, [6] state
 */

import type { TagGroup } from "@beckn-zk/core";

// -- Normalized output for Beckn transport --

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

// -- Raw shape from @anon-aadhaar/core@2.4.3 --

type BigNumberish = string | number | bigint;

interface Groth16Proof {
  pi_a: [BigNumberish, BigNumberish];
  pi_b: [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]];
  pi_c: [BigNumberish, BigNumberish];
  protocol: string;
}

export interface RawAnonAadhaarProof {
  groth16Proof: Groth16Proof;
  pubkeyHash: string;
  timestamp: string;
  nullifierSeed: string;
  nullifier: string;
  signalHash: string;
  ageAbove18: string;
  gender: string;
  pincode: string;
  state: string;
}

// -- Normalization --

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
    raw.gender,
    raw.pincode,
    raw.state,
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

// -- Binding --

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

// -- Beckn TagGroup --

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
