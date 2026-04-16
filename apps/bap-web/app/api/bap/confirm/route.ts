import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { LEDGER_URL } from "@/lib/config";
import { bus } from "@/lib/events";
import type { TagGroup } from "@beckn-zk/core";

export const runtime = "nodejs";

interface ConfirmBody {
  transactionId: string;
  account: string;
  amount: number;
  currency: string;
  solvencyTag: TagGroup;
}

function tagToProofBag(tag: TagGroup): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tag.list) {
    if (t.descriptor.code) out[t.descriptor.code] = t.value;
  }
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConfirmBody;
  const proof = tagToProofBag(body.solvencyTag);

  bus.publish({
    id: randomUUID(),
    kind: "confirm.outbound",
    transactionId: body.transactionId,
    timestamp: new Date().toISOString(),
    payload: {
      action: "confirm",
      account: body.account,
      amount: body.amount,
      solvency_proof: proof,
    },
    zk: true,
  });

  const res = await fetch(`${LEDGER_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_id: body.transactionId,
      account: body.account,
      amount: body.amount,
      currency: body.currency,
      solvency_proof: proof,
    }),
  });
  const respBody = await res.json();

  bus.publish({
    id: randomUUID(),
    kind: res.ok ? "confirm.inbound" : "confirm.error",
    transactionId: body.transactionId,
    timestamp: new Date().toISOString(),
    payload: respBody,
    zk: true,
  });

  return NextResponse.json({ status: res.status, body: respBody });
}
