import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, parseBody } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["connection_note", "message"]).optional(),
  body: z.string().min(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  const existing = await prisma.template.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Template not found");
  const template = await prisma.template.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json(template);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const existing = await prisma.template.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Template not found");
  await prisma.template.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
