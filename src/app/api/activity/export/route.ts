import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/api";
import { toCsv } from "@/lib/csv";

/** GET /api/activity/export — CSV export of the filtered activity log. */
export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const type = url.searchParams.get("type");

  const where: Prisma.ActivityWhereInput = {};
  if (accountId && accountId !== "all") where.accountId = accountId;
  if (type && type !== "all") where.type = type;

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { account: { select: { label: true } }, lead: { select: { fullName: true } } },
  });

  const rows = activities.map((a) => ({
    createdAt: a.createdAt.toISOString(),
    account: a.account?.label ?? "",
    type: a.type,
    lead: a.lead?.fullName ?? "",
    message: a.message,
  }));
  const csv = toCsv(rows, ["createdAt", "account", "type", "lead", "message"]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="activity-${Date.now()}.csv"`,
    },
  });
}
