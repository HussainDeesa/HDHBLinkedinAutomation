import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { getUserId, unauthorized, parseBody } from "@/lib/api";

const accountSelect = {
  id: true,
  label: true,
  email: true,
  status: true,
  dailyConnectCount: true,
  dailyMessageCount: true,
  lastResetAt: true,
  timezone: true,
  proxy: true,
  createdAt: true,
} as const;

export async function GET() {
  if (!(await getUserId())) return unauthorized();
  const accounts = await prisma.linkedInAccount.findMany({
    select: {
      ...accountSelect,
      _count: { select: { campaigns: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, type: true, message: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(accounts);
}

const createSchema = z.object({
  label: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  proxy: z.string().optional().nullable(),
  timezone: z.string().optional(),
});

export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  const { label, email, password, proxy, timezone } = parsed.data;
  const account = await prisma.linkedInAccount.create({
    data: {
      label,
      email,
      passwordEnc: encrypt(password),
      proxy: proxy ?? null,
      timezone: timezone ?? "America/New_York",
      status: "inactive",
    },
    select: accountSelect,
  });
  return NextResponse.json(account, { status: 201 });
}
