import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/api";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const existing = await prisma.search.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Search not found");
  await prisma.search.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
