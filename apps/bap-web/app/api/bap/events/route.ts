import { bus, type BecknEvent } from "@/lib/events";

export const runtime = "nodejs";

export async function GET() {
  let unsub: (() => void) | undefined;
  let hb: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (ev: BecknEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };
      unsub = bus.subscribe(send);
      hb = setInterval(() => {
        controller.enqueue(enc.encode(`: heartbeat\n\n`));
      }, 15_000);
    },
    cancel() {
      if (hb) clearInterval(hb);
      if (unsub) unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
