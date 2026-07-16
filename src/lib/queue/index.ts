import { prisma } from "@/lib/prisma";

export type JobType =
  | "search"
  | "connect"
  | "message"
  | "login"
  | "sync_connections"
  | "message_connections";

/**
 * Enqueue a one-off job for the background worker to pick up. Used by API
 * routes (which run in the web process) to hand work to the worker process
 * via the database — no Redis required.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  accountId: string | null = null,
) {
  return prisma.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      accountId,
      status: "queued",
    },
  });
}

/** Claim the oldest queued job atomically, marking it running. */
export async function claimNextJob() {
  const job = await prisma.job.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  // Optimistic claim: only succeeds if still queued.
  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: "queued" },
    data: { status: "running", startedAt: new Date() },
  });
  if (claimed.count === 0) return null; // lost the race
  return prisma.job.findUnique({ where: { id: job.id } });
}

export async function completeJob(
  jobId: string,
  ok: boolean,
  detail?: string,
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: ok ? "done" : "failed",
      finishedAt: new Date(),
      result: ok ? detail ?? null : null,
      error: ok ? null : detail ?? null,
    },
  });
}
