import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/api";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function weekAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/** GET /api/stats — dashboard aggregates. */
export async function GET() {
  if (!(await getUserId())) return unauthorized();

  const today = startOfToday();
  const week = weekAgo();

  const [
    totalLeads,
    connectionsToday,
    connectionsWeek,
    messagesToday,
    messagesWeek,
    messagedLeads,
    repliedLeads,
    settings,
    accounts,
    runningCampaigns,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.activity.count({ where: { type: "connect_sent", createdAt: { gte: today } } }),
    prisma.activity.count({ where: { type: "connect_sent", createdAt: { gte: week } } }),
    prisma.activity.count({ where: { type: "message_sent", createdAt: { gte: today } } }),
    prisma.activity.count({ where: { type: "message_sent", createdAt: { gte: week } } }),
    prisma.lead.count({ where: { status: { in: ["messaged", "replied"] } } }),
    prisma.lead.count({ where: { status: "replied" } }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.linkedInAccount.findMany({
      select: {
        id: true,
        label: true,
        status: true,
        dailyConnectCount: true,
        dailyMessageCount: true,
      },
    }),
    prisma.campaign.findMany({
      where: { status: "running" },
      include: { _count: { select: { campaignLeads: true } } },
    }),
  ]);

  const responseRate = messagedLeads > 0 ? Math.round((repliedLeads / messagedLeads) * 100) : 0;

  const campaignProgress = await Promise.all(
    runningCampaigns.map(async (c) => {
      const completed = await prisma.campaignLead.count({
        where: { campaignId: c.id, status: "completed" },
      });
      return {
        id: c.id,
        name: c.name,
        total: c._count.campaignLeads,
        completed,
      };
    }),
  );

  return NextResponse.json({
    totalLeads,
    connections: { today: connectionsToday, week: connectionsWeek },
    messages: { today: messagesToday, week: messagesWeek },
    responseRate,
    limits: {
      connectionsPerDay: settings?.connectionsPerDay ?? 20,
      messagesPerDay: settings?.messagesPerDay ?? 50,
    },
    accounts,
    activeCampaigns: campaignProgress,
  });
}
