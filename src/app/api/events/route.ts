import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { eventsAfter, latestEventId, type AppEvent } from "@/lib/events/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
    const encoder = new TextEncoder();
    const requestedCursor = Number(request.headers.get("last-event-id"));
    let cursor = Number.isSafeInteger(requestedCursor) && requestedCursor >= 0 ? requestedCursor : await latestEventId();
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: AppEvent) => controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        controller.enqueue(encoder.encode(`event: connected\ndata: {"connected":true,"cursor":${cursor}}\n\n`));
        let polling = false;
        const poll = setInterval(async () => {
          if (polling) return;
          polling = true;
          try { for (const event of await eventsAfter(cursor)) { send(event); cursor = event.id; } }
          catch (error) { console.error("SSE 이벤트 조회 실패", error); }
          finally { polling = false; }
        }, 750);
        const heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)), 20_000);
        cleanup = () => { clearInterval(poll); clearInterval(heartbeat); try { controller.close(); } catch {} };
        request.signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel() { cleanup(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
