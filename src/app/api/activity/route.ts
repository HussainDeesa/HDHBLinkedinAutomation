import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/api";

/** GET /api/activity — filterable activity log. */
export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const type = url.searchParams.get("type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "100")));

  const where: Prisma.ActivityWhereInput = {};
  if (accountId && accountId !== "all") where.accountId = accountId;
  if (type && type !== "all") where.type = type;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      account: { select: { label: true } },
      lead: { select: { fullName: true } },
    },
  });
  return NextResponse.json(activities);
}
