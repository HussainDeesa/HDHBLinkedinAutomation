import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound, badRequest } from "@/lib/api";
import { recordActivity } from "@/lib/activity";

/** POST /api/campaigns/:id/start — set running and make leads due now. */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { campaignLeads: true } },
      account: { select: { label: true, status: true } },
    },
  });
  if (!campaign) return notFound("Campaign not found");
  if (campaign._count.campaignLeads === 0) {
    return badRequest("Campaign has no leads");
  }
  // The worker only automates "active" (logged-in) accounts; without this
  // guard the campaign would run but silently skip every lead.
  if (campaign.account.status !== "active") {
    return badRequest(
      `Account "${campaign.account.label}" is not logged in (status: ${campaign.account.status}). ` +
        `Log the account in from the Accounts page, then start the campaign.`,
    );
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: params.id },
      data: { status: "running", startedAt: campaign.startedAt ?? new Date() },
    }),
    // Make any pending leads with no schedule due immediately.
    prisma.campaignLead.updateMany({
      where: { campaignId: params.id, status: "pending", nextActionAt: null },
      data: { nextActionAt: new Date() },
    }),
  ]);

  await recordActivity({
    accountId: campaign.accountId,
    type: "info",
    message: `Campaign "${campaign.name}" started.`,
  });

  return NextResponse.json({ ok: true });
}
