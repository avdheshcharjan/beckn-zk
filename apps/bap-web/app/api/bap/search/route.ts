import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildSearch,
  type OnSearchResponse,
  type TagGroup,
} from "@beckn-zk/core";
import { BAP_ID, BAP_URI, BPP_TARGETS } from "@/lib/config";
import { bus } from "@/lib/events";

export const runtime = "nodejs";

interface ClientSearchBody {
  categoryName?: string;
  itemName?: string;
  gps?: string;
  radiusKm?: string;
  zkTag?: TagGroup | null;
  /** When ZK mode is on, the browser pre-generates these so the binding matches. */
  transactionId?: string;
  timestamp?: string;
}

interface BppOutcome {
  bppId: string;
  bppUrl: string;
  status: number;
  body: OnSearchResponse | { error: { code: string; message: string } };
}

export async function POST(req: Request) {
  const body = (await req.json()) as ClientSearchBody;

  const search = buildSearch({
    bapId: BAP_ID,
    bapUri: BAP_URI,
    transactionId: body.transactionId,
    timestamp: body.timestamp,
    intent: {
      category: body.categoryName
        ? { descriptor: { name: body.categoryName } }
        : undefined,
      item: body.itemName
        ? { descriptor: { name: body.itemName } }
        : undefined,
      location: body.gps
        ? {
            circle: {
              gps: body.gps,
              radius: {
                type: "CONSTANT",
                value: body.radiusKm ?? "5",
                unit: "km",
              },
            },
          }
        : undefined,
      tags: body.zkTag ? [body.zkTag] : undefined,
    },
  });

  const txId = search.context.transaction_id;
  const ts = search.context.timestamp;
  const zk = Boolean(body.zkTag);

  // One outbound event per target so the console can show three separate rows.
  for (const t of BPP_TARGETS) {
    bus.publish({
      id: randomUUID(),
      kind: "search.outbound",
      bppId: t.id,
      transactionId: txId,
      timestamp: ts,
      payload: search,
      zk,
    });
  }

  const outcomes = await Promise.all(
    BPP_TARGETS.map(async (t): Promise<BppOutcome> => {
      try {
        const res = await fetch(`${t.url}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(search),
        });
        const respBody = (await res.json()) as BppOutcome["body"];
        bus.publish({
          id: randomUUID(),
          kind: res.ok ? "search.inbound" : "search.error",
          bppId: t.id,
          transactionId: txId,
          timestamp: new Date().toISOString(),
          payload: respBody,
          zk,
        });
        return {
          bppId: t.id,
          bppUrl: t.url,
          status: res.status,
          body: respBody,
        };
      } catch (err) {
        const payload = {
          error: {
            code: "NETWORK",
            message: err instanceof Error ? err.message : "fetch failed",
          },
        };
        bus.publish({
          id: randomUUID(),
          kind: "search.error",
          bppId: t.id,
          transactionId: txId,
          timestamp: new Date().toISOString(),
          payload,
          zk,
        });
        return { bppId: t.id, bppUrl: t.url, status: 0, body: payload };
      }
    }),
  );

  return NextResponse.json({ request: search, outcomes });
}
