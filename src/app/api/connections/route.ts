import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/api";

/**
 * GET /api/connections — list synced 1st-degree connections (leads with a
 * connectedAt), newest first, paginated. Optional `?since=YYYY-MM-DD` also
 * returns how many unmessaged connections match that cutoff (the preview count
 * for the batch sender), and `?q=` filters the list by name/headline.
 *
 * Pagination: `?page=` (1-based) and `?pageSize=` (max 100). The response
 * includes `filtered` (rows matching the current list query) and `hasMore`
 * so the client can drive infinite scroll.
 */
export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const q = (url.searchParams.get("q") ?? "").trim();
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "50")));
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));

  const since = sinceParam ? new Date(sinceParam) : null;
  const hasSince = since !== null && !Number.isNaN(since.getTime());

  const base: Prisma.LeadWhereInput = { connectedAt: { not: null } };
  const listWhere: Prisma.LeadWhereInput = q
    ? {
        connectedAt: { not: null },
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { headline: { contains: q, mode: "insensitive" } },
        ],
      }
    : base;
  const matchWhere: Prisma.LeadWhereInput = {
    status: "connected",
    connectedAt: hasSince ? { gte: since!, not: null } : { not: null },
  };

  const [total, matching, filtered, leads] = await Promise.all([
    prisma.lead.count({ where: base }),
    prisma.lead.count({ where: matchWhere }),
    prisma.lead.count({ where: listWhere }),
    prisma.lead.findMany({
      where: listWhere,
      orderBy: { connectedAt: "desc" },
      skip: (page - 1) * pageSize,
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

  return NextResponse.json({
    total,
    matching,
    filtered,
    since: hasSince ? since!.toISOString() : null,
    page,
    pageSize,
    hasMore: page * pageSize < filtered,
    leads,
  });
}
