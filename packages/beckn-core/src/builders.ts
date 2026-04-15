import { randomUUID } from "node:crypto";
import type { Context, SearchRequest, Intent } from "./types";

export interface BuildSearchArgs {
  bapId: string;
  bapUri: string;
  intent: Intent;
  transactionId?: string;
}

export function buildSearch({
  bapId,
  bapUri,
  intent,
  transactionId,
}: BuildSearchArgs): SearchRequest {
  const context: Context = {
    domain: "dhp:diagnostics:0.1.0",
    action: "search",
    location: {
      country: { code: "IND" },
      city: { code: "std:080" },
    },
    version: "1.1.0",
    bap_id: bapId,
    bap_uri: bapUri,
    transaction_id: transactionId ?? randomUUID(),
    message_id: randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: "PT30S",
  };
  return { context, message: { intent } };
}
