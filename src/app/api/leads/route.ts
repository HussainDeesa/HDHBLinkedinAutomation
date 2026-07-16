import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, parseBody } from "@/lib/api";

/** GET /api/leads — filterable, sortable, paginated lead list. */
export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const searchId = url.searchParams.get("searchId");
  const q = url.searchParams.get("q");
  const sort = url.searchParams.get("sort") ?? "importedAt";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? "50")));

  const where: Prisma.LeadWhereInput = {};
  if (status && status !== "all") where.status = status;
  if (searchId && searchId !== "all") where.searchId = searchId;
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { company: { contains: q } },
      { headline: { contains: q } },
      { title: { contains: q } },
    ];
  }

  const sortableFields = ["importedAt", "fullName", "company", "status"];
  const orderBy: Prisma.LeadOrderByWithRelationInput = sortableFields.includes(sort)
    ? { [sort]: dir }
    : { importedAt: dir };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { search: { select: { id: true, name: true } } },
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({ leads, total, page, pageSize });
}

const createSchema = z.object({
  fullName: z.string().min(1),
  profileUrl: z.string().url(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  headline: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  const lead = await prisma.lead.upsert({
    where: { profileUrl: parsed.data.profileUrl },
    update: parsed.data,
    create: parsed.data,
  });
  return NextResponse.json(lead, { status: 201 });
}

const patchSchema = z.object({
  ids: z.array(z.string()).min(1),
  status: z.enum(["new", "queued", "connected", "messaged", "replied", "skipped"]),
});

/** Bulk status update. */
export async function PATCH(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  const result = await prisma.lead.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, count: result.count });
}

const deleteSchema = z.object({ ids: z.array(z.string()).min(1) });

export async function DELETE(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, deleteSchema);
  if ("error" in parsed) return parsed.error;
  const result = await prisma.lead.deleteMany({
    where: { id: { in: parsed.data.ids } },
  });
  return NextResponse.json({ ok: true, count: result.count });
}
