import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/api";

/**
 * GET /api/connections — list synced 1st-degree connections (leads with a
 * connectedAt). Optional `?since=YYYY-MM-DD` also returns how many unmessaged
 * connections match that cutoff (the preview count for the batch sender).
 */
export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? "50")));

  const since = sinceParam ? new Date(sinceParam) : null;
  const hasSince = since !== null && !Number.isNaN(since.getTime());

  const base: Prisma.LeadWhereInput = { connectedAt: { not: null } };
  const matchWhere: Prisma.LeadWhereInput = {
    status: "connected",
    connectedAt: hasSince ? { gte: since!, not: null } : { not: null },
  };

  const [total, matching, leads] = await Promise.all([
    prisma.lead.count({ where: base }),
    prisma.lead.count({ where: matchWhere }),
    prisma.lead.findMany({
      where: base,
      orderBy: { connectedAt: "desc" },
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        headline: true,
        profileUrl: true,
        status: true,
        connectedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ total, matching, since: hasSince ? since!.toISOString() : null, leads });
}
