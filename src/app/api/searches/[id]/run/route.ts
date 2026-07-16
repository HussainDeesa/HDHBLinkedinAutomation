import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, parseBody } from "@/lib/api";
import { enqueueJob } from "@/lib/queue";

const runSchema = z.object({ accountId: z.string().min(1) });

/**
 * Launch a saved search. Enqueues a `search` job; the worker scrapes results
 * and upserts them into the Leads table.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, runSchema);
  if ("error" in parsed) return parsed.error;

  const search = await prisma.search.findUnique({ where: { id: params.id } });
  if (!search) return notFound("Search not found");
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: parsed.data.accountId },
  });
  if (!account) return notFound("Account not found");
  const job = await enqueueJob("search", { searchId: params.id }, parsed.data.accountId);
  return NextResponse.json({ ok: true, jobId: job.id });
}
