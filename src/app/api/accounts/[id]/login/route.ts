import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/api";
import { enqueueJob } from "@/lib/queue";

/**
 * Kick off an interactive login for an account. Enqueues a `login` job that
 * the worker process picks up; the worker opens a *headed* browser so a human
 * can solve 2FA / captcha in the visible window. Poll activity or the job to
 * track progress.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const account = await prisma.linkedInAccount.findUnique({ where: { id: params.id } });
  if (!account) return notFound("Account not found");

  const job = await enqueueJob("login", { headless: false }, params.id);
  return NextResponse.json({ ok: true, jobId: job.id });
}
