import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, parseBody } from "@/lib/api";
import { enqueueJob } from "@/lib/queue";

const schema = z.object({
  accountId: z.string().min(1),
  // Optional cutoff: lets the scraper stop scrolling once it passes this date.
  since: z.string().datetime().optional().nullable(),
  max: z.number().int().positive().optional().nullable(),
});

/**
 * POST /api/connections/sync — enqueue a job that scrapes the account's
 * Connections list into the Leads table with approximate connection dates.
 */
export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;

  const account = await prisma.linkedInAccount.findUnique({
    where: { id: parsed.data.accountId },
  });
  if (!account) return notFound("Account not found");

  const job = await enqueueJob(
    "sync_connections",
    { since: parsed.data.since ?? null, max: parsed.data.max ?? null },
    parsed.data.accountId,
  );
  return NextResponse.json({ ok: true, jobId: job.id });
}
