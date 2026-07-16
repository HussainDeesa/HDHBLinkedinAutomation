import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { getUserId, unauthorized, parseBody, notFound } from "@/lib/api";

const accountSelect = {
  id: true,
  label: true,
  email: true,
  status: true,
  dailyConnectCount: true,
  dailyMessageCount: true,
  timezone: true,
  proxy: true,
} as const;

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  status: z.enum(["inactive", "active", "paused", "captcha", "banned"]).optional(),
  proxy: z.string().nullable().optional(),
  timezone: z.string().optional(),
  password: z.string().min(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  const existing = await prisma.linkedInAccount.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Account not found");

  const { password, ...rest } = parsed.data;
  const account = await prisma.linkedInAccount.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(password ? { passwordEnc: encrypt(password) } : {}),
    },
    select: accountSelect,
  });
  return NextResponse.json(account);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const existing = await prisma.linkedInAccount.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Account not found");
  await prisma.linkedInAccount.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
