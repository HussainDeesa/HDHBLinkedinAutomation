import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/api";
import { toCsv } from "@/lib/csv";

/** GET /api/leads/export — CSV of the filtered lead view (same filters as list). */
export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const searchId = url.searchParams.get("searchId");
  const q = url.searchParams.get("q");

  const where: Prisma.LeadWhereInput = {};
  if (status && status !== "all") where.status = status;
  if (searchId && searchId !== "all") where.searchId = searchId;
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { company: { contains: q } },
      { headline: { contains: q } },
    ];
  }

  const leads = await prisma.lead.findMany({ where, orderBy: { importedAt: "desc" } });
  const columns = [
    "fullName",
    "firstName",
    "lastName",
    "headline",
    "company",
    "title",
    "location",
    "connectionDegree",
    "status",
    "profileUrl",
    "importedAt",
  ];
  const csv = toCsv(
    leads.map((l) => ({ ...l, importedAt: l.importedAt.toISOString() })),
    columns,
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
    },
  });
}
