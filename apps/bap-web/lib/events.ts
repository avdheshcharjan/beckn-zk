export type BecknEventKind =
  | "search.outbound"
  | "search.inbound"
  | "search.error"
  | "confirm.outbound"
  | "confirm.inbound"
  | "confirm.error";

export interface BecknEvent {
  id: string;
  kind: BecknEventKind;
  bppId?: string;
  transactionId: string;
  timestamp: string;
  /** Raw Beckn payload, pretty-printed for the console. */
  payload: unknown;
  /** True if the outbound message carried a zk_proof tag. */
  zk?: boolean;
}

type Listener = (ev: BecknEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();

  publish(ev: BecknEvent) {
    for (const l of this.listeners) {
      l(ev);
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

// Module-level singleton. In dev and single-instance prod this is fine.
// On Vercel's edge / multi-instance, SSE + in-memory bus won't cross instances;
// for the demo we rely on Vercel's default single-instance Node runtime.
const g = globalThis as unknown as { __becknBus?: EventBus };
export const bus: EventBus = g.__becknBus ?? (g.__becknBus = new EventBus());
