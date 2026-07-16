import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * SSE endpoint for live activity. Because the worker and web server are
 * separate processes, this polls the Activity table for new rows (every 2s)
 * and pushes them to subscribers — reliable across processes without Redis.
 */
export async function GET(request: Request) {
  if (!(await getUserId())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let since = new Date();
  const sentIds = new Set<string>();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown): void => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("connected", { ok: true });

      const poll = async (): Promise<void> => {
        try {
          const rows = await prisma.activity.findMany({
            where: { createdAt: { gte: since } },
            orderBy: { createdAt: "asc" },
            take: 50,
            include: {
              account: { select: { label: true } },
              lead: { select: { fullName: true } },
            },
          });
          for (const row of rows) {
            if (sentIds.has(row.id)) continue;
            sentIds.add(row.id);
            if (row.createdAt > since) since = row.createdAt;
            send("activity", {
              id: row.id,
              accountId: row.accountId,
              accountLabel: row.account?.label ?? null,
              leadName: row.lead?.fullName ?? null,
              type: row.type,
              message: row.message,
              metadata: row.metadata,
              createdAt: row.createdAt.toISOString(),
            });
          }
          // Bound the dedupe set.
          if (sentIds.size > 500) {
            sentIds.clear();
          }
        } catch {
          // transient DB error — keep the stream alive
        }
      };

      const interval = setInterval(() => void poll(), 2000);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
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
