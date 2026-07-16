import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { renderTemplate } from "@/lib/utils";
import { getLimitStatus } from "@/lib/limits";
import { loginAccount } from "@/lib/linkedin/auth";
import { runSearchJob } from "@/lib/queue/jobs/search";
import { processConnectStep } from "@/lib/queue/jobs/connect";
import { processMessageStep } from "@/lib/queue/jobs/message";
import {
  runSyncConnectionsJob,
  runMessageConnectionsJob,
  type SyncConnectionsJobPayload,
  type MessageConnectionsJobPayload,
} from "@/lib/queue/jobs/connections";
import { claimNextJob, completeJob } from "@/lib/queue/index";
import { humanDelay } from "@/lib/linkedin/utils";
import type { CampaignStep } from "@/types";

const TICK_INTERVAL_MS = 5000;
const MAX_LEADS_PER_TICK = 3; // keep pacing gentle

let running = false;
let stopRequested = false;

function parseSteps(stepsJson: string): CampaignStep[] {
  try {
    const parsed: unknown = JSON.parse(stepsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed as CampaignStep[];
  } catch {
    return [];
  }
}

async function getHeadless(): Promise<boolean> {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  return settings?.headless ?? true;
}

async function profilePause(): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  await humanDelay(
    settings?.profileDelayMinMs ?? 8000,
    settings?.profileDelayMaxMs ?? 20000,
  );
}

// --- One-off job queue (search, login) -----------------------------------

async function processJobQueue(): Promise<void> {
  const job = await claimNextJob();
  if (!job) return;
  try {
    const payload = JSON.parse(job.payload) as Record<string, unknown>;
    if (job.type === "search") {
      const result = await runSearchJob(
        { searchId: String(payload.searchId) },
        job.accountId,
      );
      await completeJob(job.id, result.ok, result.detail);
    } else if (job.type === "login") {
      if (!job.accountId) {
        await completeJob(job.id, false, "login job requires accountId");
      } else {
        const headless = Boolean(payload.headless ?? false);
        const result = await loginAccount(job.accountId, { headless });
        await completeJob(
          job.id,
          result.ok,
          result.ok ? "logged in" : result.reason,
        );
      }
    } else if (job.type === "sync_connections") {
      const result = await runSyncConnectionsJob(
        payload as unknown as SyncConnectionsJobPayload,
        job.accountId,
      );
      await completeJob(job.id, result.ok, result.detail);
    } else if (job.type === "message_connections") {
      const result = await runMessageConnectionsJob(
        payload as unknown as MessageConnectionsJobPayload,
        job.accountId,
      );
      await completeJob(job.id, result.ok, result.detail);
    } else {
      await completeJob(job.id, false, `unknown job type: ${job.type}`);
    }
  } catch (err) {
    await completeJob(job.id, false, err instanceof Error ? err.message : String(err));
  }
}

// --- Campaign engine -------------------------------------------------------

async function resolveTemplateBody(
  templateId: string | null,
  lead: { firstName: string | null; lastName: string | null; company: string | null; title: string | null; fullName: string },
): Promise<string | null> {
  if (!templateId) return null;
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return null;
  return renderTemplate(template.body, {
    firstName: lead.firstName ?? lead.fullName.split(" ")[0] ?? "",
    lastName: lead.lastName ?? "",
    company: lead.company ?? "",
    title: lead.title ?? "",
    fullName: lead.fullName,
  });
}

/**
 * Advance a single campaign lead by one step. Returns true if an action was
 * actually attempted (so the worker can pace between profiles).
 */
async function processCampaignLead(campaignLeadId: string): Promise<boolean> {
  const cl = await prisma.campaignLead.findUnique({
    where: { id: campaignLeadId },
    include: { campaign: { include: { account: true } }, lead: true },
  });
  if (!cl || cl.status !== "pending") return false;
  if (cl.campaign.status !== "running") return false;

  const account = cl.campaign.account;
  const steps = parseSteps(cl.campaign.stepsJson);

  // Completed the sequence already.
  if (cl.currentStep >= steps.length) {
    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: { status: "completed" },
    });
    return false;
  }

  const step = steps[cl.currentStep];
  if (!step) {
    await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "completed" } });
    return false;
  }

  const limits = await getLimitStatus(account.id);
  if (step.type === "connect" && !limits.canConnect) return false;
  if (step.type === "message" && !limits.canMessage) return false;

  const headless = await getHeadless();
  const body = await resolveTemplateBody(step.templateId, cl.lead);

  await prisma.campaignLead.update({
    where: { id: cl.id },
    data: { status: "in_progress", lastActionAt: new Date() },
  });

  let success = false;
  let failure: string | null = null;

  if (step.type === "connect") {
    const outcome = await processConnectStep(account.id, cl.lead.id, body, headless);
    if (outcome.ok) success = true;
    else if (outcome.reason === "captcha" || outcome.reason === "limit" || outcome.reason === "not_logged_in") {
      // Transient/operator-action-needed: leave pending to retry later.
      await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "pending" } });
      return true;
    } else {
      failure = outcome.detail ?? outcome.reason;
    }
  } else if (step.type === "message") {
    if (!body) {
      failure = "message step has no template body";
    } else {
      const outcome = await processMessageStep(account.id, cl.lead.id, body, headless);
      if (outcome.ok) success = true;
      else if (outcome.reason === "captcha" || outcome.reason === "not_logged_in") {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "pending" } });
        return true;
      } else {
        failure = outcome.detail ?? outcome.reason;
      }
    }
  }

  if (success) {
    const nextStepIndex = cl.currentStep + 1;
    if (nextStepIndex >= steps.length) {
      await prisma.campaignLead.update({
        where: { id: cl.id },
        data: { status: "completed", currentStep: nextStepIndex, lastError: null },
      });
    } else {
      const nextStep = steps[nextStepIndex];
      const delayDays = nextStep?.delayDays ?? 0;
      const nextActionAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
      await prisma.campaignLead.update({
        where: { id: cl.id },
        data: {
          status: "pending",
          currentStep: nextStepIndex,
          nextActionAt,
          lastError: null,
        },
      });
    }
  } else {
    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: { status: "failed", lastError: failure },
    });
    await recordActivity({
      accountId: account.id,
      type: "error",
      leadId: cl.lead.id,
      message: `Campaign step failed for ${cl.lead.fullName}: ${failure}`,
    });
  }

  return true;
}

/** Mark campaigns whose leads are all finished as completed. */
async function finalizeCampaigns(): Promise<void> {
  const running = await prisma.campaign.findMany({ where: { status: "running" } });
  for (const campaign of running) {
    const pending = await prisma.campaignLead.count({
      where: { campaignId: campaign.id, status: { in: ["pending", "in_progress"] } },
    });
    if (pending === 0) {
      const total = await prisma.campaignLead.count({ where: { campaignId: campaign.id } });
      if (total > 0) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "completed" },
        });
      }
    }
  }
}

async function processCampaigns(): Promise<void> {
  const due = await prisma.campaignLead.findMany({
    where: {
      status: "pending",
      campaign: { status: "running" },
      OR: [{ nextActionAt: null }, { nextActionAt: { lte: new Date() } }],
    },
    orderBy: { nextActionAt: "asc" },
    take: MAX_LEADS_PER_TICK,
    select: { id: true },
  });

  for (const { id } of due) {
    if (stopRequested) break;
    const acted = await processCampaignLead(id);
    if (acted) await profilePause();
  }

  await finalizeCampaigns();
}

async function tick(): Promise<void> {
  await processJobQueue();
  if (stopRequested) return;
  await processCampaigns();
}

export async function runWorker(): Promise<void> {
  if (running) return;
  running = true;
  stopRequested = false;
  // eslint-disable-next-line no-console
  console.log("[worker] started");
  while (!stopRequested) {
    try {
      await tick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] tick error:", err);
    }
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
  }
  running = false;
  // eslint-disable-next-line no-console
  console.log("[worker] stopped");
}

export function requestStop(): void {
  stopRequested = true;
}
