import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, parseBody } from "@/lib/api";
import { enqueueJob } from "@/lib/queue";

const schema = z
  .object({
    accountId: z.string().min(1),
    // Either specific connections, or all connections since a date.
    leadIds: z.array(z.string().min(1)).max(2000).optional(),
    since: z.string().datetime().optional(),
    limit: z.number().int().positive().max(1000).optional().nullable(),
    body: z.string().min(1).max(8000),
  })
  .refine((d) => (d.leadIds && d.leadIds.length > 0) || Boolean(d.since), {
    message: "Provide either leadIds (specific connections) or a since date",
  });

/**
 * POST /api/connections/message — enqueue a batch job that messages either the
 * given connections (`leadIds`) or all connections added since `since`,
 * newest-first up to `limit`. The worker paces sends and respects the account's
 * daily message limit.
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
    "message_connections",
    {
      leadIds: parsed.data.leadIds ?? null,
      since: parsed.data.since ?? null,
      limit: parsed.data.limit ?? null,
      body: parsed.data.body,
    },
    parsed.data.accountId,
  );
  return NextResponse.json({ ok: true, jobId: job.id });
}
