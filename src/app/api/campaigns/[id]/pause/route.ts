import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/api";
import { recordActivity } from "@/lib/activity";

/** POST /api/campaigns/:id/pause — toggle between paused and running. */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await getUserId())) return unauthorized();
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return notFound("Campaign not found");

  const nextStatus = campaign.status === "running" ? "paused" : "running";
  await prisma.campaign.update({
    where: { id: params.id },
    data: {
      status: nextStatus,
      ...(nextStatus === "running" && !campaign.startedAt
        ? { startedAt: new Date() }
        : {}),
    },
  });

  await recordActivity({
    accountId: campaign.accountId,
    type: "info",
    message: `Campaign "${campaign.name}" ${nextStatus === "paused" ? "paused" : "resumed"}.`,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
