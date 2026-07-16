import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { renderTemplate } from "@/lib/utils";
import { getLimitStatus, incrementMessage } from "@/lib/limits";
import { humanDelay } from "@/lib/linkedin/utils";
import { syncConnections } from "@/lib/linkedin/connections";
import { sendMessage } from "@/lib/linkedin/message";

export interface SyncConnectionsJobPayload {
  since?: string | null; // ISO date; only used to allow early-stop while scrolling
  max?: number | null;
}

export interface MessageConnectionsJobPayload {
  since: string; // ISO date — message connections added on/after this
  limit?: number | null; // cap on messages to send; null = as many as limits allow
  body: string; // supports {{firstName}} {{lastName}} {{fullName}} tokens
}

async function getHeadless(): Promise<boolean> {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  return settings?.headless ?? true;
}

/** Process a queued `sync_connections` job. */
export async function runSyncConnectionsJob(
  payload: SyncConnectionsJobPayload,
  accountId: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  if (!accountId) return { ok: false, detail: "sync_connections requires an accountId" };
  const headless = await getHeadless();
  const since = payload.since ? new Date(payload.since) : null;
  const result = await syncConnections(accountId, {
    headless,
    since: since && !Number.isNaN(since.getTime()) ? since : null,
    max: payload.max ?? undefined,
  });
  return result.ok
    ? { ok: true, detail: `saved ${result.saved}` }
    : { ok: false, detail: result.detail ?? result.reason };
}

/**
 * Process a queued `message_connections` job: message existing 1st-degree
 * connections added on/after `since`, newest-first, up to `limit`.
 *
 * This is a dedicated one-shot batch sender (not the campaign engine): it
 * paces messages with the configured human delays and stops as soon as the
 * account's daily message limit is reached or a captcha/logout is hit. Re-run
 * it (e.g. the next day) to continue where it left off — already-messaged
 * connections move to status "messaged" and are skipped.
 */
export async function runMessageConnectionsJob(
  payload: MessageConnectionsJobPayload,
  accountId: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  if (!accountId) return { ok: false, detail: "message_connections requires an accountId" };
  const body = payload.body?.trim();
  if (!body) return { ok: false, detail: "message body is required" };

  const since = new Date(payload.since);
  if (Number.isNaN(since.getTime())) return { ok: false, detail: "invalid 'since' date" };

  const headless = await getHeadless();
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const delayMin = settings?.delayMinMs ?? 3000;
  const delayMax = settings?.delayMaxMs ?? 10000;

  // Newest-first so "first 50-100" matches the top of the Connections list.
  const targets = await prisma.lead.findMany({
    where: {
      status: "connected",
      connectedAt: { gte: since, not: null },
    },
    orderBy: { connectedAt: "desc" },
    ...(payload.limit && payload.limit > 0 ? { take: payload.limit } : {}),
    select: { id: true, fullName: true, firstName: true, lastName: true, company: true, title: true },
  });

  if (targets.length === 0) {
    await recordActivity({
      accountId,
      type: "info",
      message: `No unmessaged connections found since ${payload.since.slice(0, 10)}. Try syncing connections first.`,
    });
    return { ok: true, detail: "0 matching connections" };
  }

  await recordActivity({
    accountId,
    type: "info",
    message: `Messaging ${targets.length} connection(s) added since ${payload.since.slice(0, 10)}…`,
  });

  let sent = 0;
  let stoppedReason: string | null = null;

  for (const lead of targets) {
    const limits = await getLimitStatus(accountId);
    if (!limits.canMessage) {
      stoppedReason =
        limits.messageRemaining <= 0
          ? "daily message limit reached"
          : "account not active";
      break;
    }

    const text = renderTemplate(body, {
      firstName: lead.firstName ?? lead.fullName.split(" ")[0] ?? "",
      lastName: lead.lastName ?? "",
      company: lead.company ?? "",
      title: lead.title ?? "",
      fullName: lead.fullName,
    });

    const outcome = await sendMessage(accountId, lead.id, text, { headless });
    if (outcome.ok) {
      await incrementMessage(accountId);
      sent++;
    } else if (outcome.reason === "captcha" || outcome.reason === "not_logged_in") {
      // Operator action needed — stop the batch, leave the rest for a re-run.
      stoppedReason = outcome.reason;
      break;
    }
    // Other per-lead errors are already logged by sendMessage; keep going.

    await humanDelay(delayMin, delayMax);
  }

  const summary = `Messaged ${sent}/${targets.length} connection(s)${stoppedReason ? ` — stopped: ${stoppedReason}` : ""}.`;
  await recordActivity({ accountId, type: "info", message: summary, metadata: { sent, stoppedReason } });

  // A captcha/logout mid-batch is a genuine failure; a hit daily limit is not.
  const hardStop = stoppedReason === "captcha" || stoppedReason === "not_logged_in";
  return { ok: !hardStop, detail: summary };
}
