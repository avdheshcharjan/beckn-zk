import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { OnSearchResponse } from "@beckn-zk/core";
import { bus } from "@/lib/events";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as OnSearchResponse;

  const txId = body.context?.transaction_id ?? "unknown";
  const bppId = body.context?.bpp_id ?? "unknown";
  const hasError = !!body.error;

  bus.publish({
    id: randomUUID(),
    kind: hasError ? "search.error" : "search.inbound",
    bppId,
    transactionId: txId,
    timestamp: new Date().toISOString(),
    payload: body,
    zk: false,
  });

  return NextResponse.json({
    message: { ack: { status: "ACK" } },
  });
}
