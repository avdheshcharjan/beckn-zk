import { NextResponse } from "next/server";
import { buildSearch, type OnSearchResponse } from "@beckn-zk/core";
import { BAP_ID, BAP_URI, BPP_URLS } from "@/lib/config";

export const runtime = "nodejs";

interface ClientSearchBody {
  categoryName?: string;
  itemName?: string;
  gps?: string;
  radiusKm?: string;
}

interface BppOutcome {
  bppUrl: string;
  status: number;
  body: OnSearchResponse | { error: { code: string; message: string } };
}

export async function POST(req: Request) {
  const body = (await req.json()) as ClientSearchBody;

  const search = buildSearch({
    bapId: BAP_ID,
    bapUri: BAP_URI,
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
    },
  });

  const outcomes: BppOutcome[] = await Promise.all(
    BPP_URLS.map(async (bppUrl): Promise<BppOutcome> => {
      const res = await fetch(`${bppUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(search),
      });
      const respBody = (await res.json()) as BppOutcome["body"];
      return { bppUrl, status: res.status, body: respBody };
    }),
  );

  return NextResponse.json({ request: search, outcomes });
}
