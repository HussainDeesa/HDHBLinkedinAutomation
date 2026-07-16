import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, parseBody } from "@/lib/api";

export async function GET() {
  if (!(await getUserId())) return unauthorized();
  const searches = await prisma.search.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json(searches);
}

const createSchema = z.object({
  name: z.string().min(1),
  keywords: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  currentCompany: z.string().optional().nullable(),
  pastCompany: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  connectionDegree: z.string().optional().nullable(),
  maxPages: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  const { maxPages, ...rest } = parsed.data;
  const search = await prisma.search.create({
    data: { ...rest, maxPages: maxPages ?? 5 },
  });
  return NextResponse.json(search, { status: 201 });
}
