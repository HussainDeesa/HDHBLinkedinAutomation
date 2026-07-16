import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, parseBody } from "@/lib/api";

async function getSettings() {
  return prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function GET() {
  if (!(await getUserId())) return unauthorized();
  return NextResponse.json(await getSettings());
}

const patchSchema = z.object({
  connectionsPerDay: z.number().int().min(0).max(500).optional(),
  messagesPerDay: z.number().int().min(0).max(500).optional(),
  delayMinMs: z.number().int().min(0).max(120000).optional(),
  delayMaxMs: z.number().int().min(0).max(300000).optional(),
  profileDelayMinMs: z.number().int().min(0).max(120000).optional(),
  profileDelayMaxMs: z.number().int().min(0).max(300000).optional(),
  headless: z.boolean().optional(),
  defaultProxy: z.string().nullable().optional(),
  tosAccepted: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  await getSettings(); // ensure row exists
  const settings = await prisma.settings.update({
    where: { id: "singleton" },
    data: parsed.data,
  });
  return NextResponse.json(settings);
}
