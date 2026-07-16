import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, parseBody } from "@/lib/api";

/** GET /api/campaigns — list with lead counts + progress. */
export async function GET() {
  if (!(await getUserId())) return unauthorized();
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      account: { select: { id: true, label: true, status: true } },
      _count: { select: { campaignLeads: true } },
    },
  });

  const withProgress = await Promise.all(
    campaigns.map(async (c) => {
      const completed = await prisma.campaignLead.count({
        where: { campaignId: c.id, status: "completed" },
      });
      return { ...c, completedLeads: completed, totalLeads: c._count.campaignLeads };
    }),
  );

  return NextResponse.json(withProgress);
}

const stepSchema = z.object({
  type: z.enum(["connect", "message"]),
  templateId: z.string().nullable(),
  delayDays: z.number().int().min(0).max(90),
});

const createSchema = z.object({
  name: z.string().min(1),
  accountId: z.string().min(1),
  steps: z.array(stepSchema).min(1),
  leadIds: z.array(z.string()).optional(),
  searchId: z.string().optional(),
});

export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  const { name, accountId, steps, leadIds, searchId } = parsed.data;

  const account = await prisma.linkedInAccount.findUnique({ where: { id: accountId } });
  if (!account) return notFound("Account not found");

  // Resolve target leads from explicit ids and/or a saved search.
  const idSet = new Set<string>(leadIds ?? []);
  if (searchId) {
    const searchLeads = await prisma.lead.findMany({
      where: { searchId },
      select: { id: true },
    });
    searchLeads.forEach((l) => idSet.add(l.id));
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      accountId,
      stepsJson: JSON.stringify(steps),
      status: "draft",
      campaignLeads: {
        create: [...idSet].map((leadId) => ({ leadId })),
      },
    },
    include: { _count: { select: { campaignLeads: true } } },
  });

  return NextResponse.json(campaign, { status: 201 });
}
