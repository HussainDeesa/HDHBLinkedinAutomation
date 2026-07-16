import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, parseBody } from "@/lib/api";

/** GET /api/campaigns/:id — detail with per-lead status + stats. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      account: { select: { id: true, label: true, status: true } },
      campaignLeads: {
        include: {
          lead: {
            select: {
              id: true,
              fullName: true,
              headline: true,
              company: true,
              profileUrl: true,
              status: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!campaign) return notFound("Campaign not found");

  const counts = campaign.campaignLeads.reduce<Record<string, number>>((acc, cl) => {
    acc[cl.status] = (acc[cl.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ...campaign, counts });
}

const stepSchema = z.object({
  type: z.enum(["connect", "message"]),
  templateId: z.string().nullable(),
  delayDays: z.number().int().min(0).max(90),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  steps: z.array(stepSchema).min(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  const existing = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Campaign not found");

  const data: { name?: string; stepsJson?: string } = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.steps) data.stepsJson = JSON.stringify(parsed.data.steps);

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(campaign);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const existing = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Campaign not found");
  await prisma.campaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
