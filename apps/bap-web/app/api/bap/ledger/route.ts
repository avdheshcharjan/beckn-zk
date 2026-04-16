import { NextResponse } from "next/server";
import { LEDGER_URL } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const res = await fetch(`${LEDGER_URL}/snapshot`, {
      headers: { Accept: "application/json" },
    });
    const body = await res.json();
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ledger unreachable" },
      { status: 502 },
    );
  }
}
