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
  // Either target specific connections by id, OR all connections added since a
  // date. leadIds takes precedence when present.
  leadIds?: string[] | null;
  since?: string | null; // ISO date — message connections added on/after this
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

  const explicitIds = payload.leadIds?.filter(Boolean) ?? [];
  const since = payload.since ? new Date(payload.since) : null;
  if (explicitIds.length === 0 && (!since || Number.isNaN(since.getTime()))) {
    return { ok: false, detail: "message_connections needs leadIds or a valid 'since' date" };
  }

  const headless = await getHeadless();
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  // Batch messaging paces faster than campaigns: use ~1/3 of the configured
  // delay, floored to a snappy 0.8-2.5s jittered gap between messages. Still
  // randomized so it doesn't look like a fixed-interval bot. Raising these
  // (or the Settings delays) lowers ban risk; lowering them raises it.
  const delayMin = Math.max(800, Math.floor((settings?.delayMinMs ?? 3000) / 3));
  const delayMax = Math.max(2500, Math.floor((settings?.delayMaxMs ?? 10000) / 3));

  const leadSelect = {
    id: true,
    fullName: true,
    firstName: true,
    lastName: true,
    company: true,
    title: true,
  } as const;

  // Explicit selection wins; otherwise all connections newest-first since the
  // cutoff, up to the optional cap.
  const targets = explicitIds.length
    ? await prisma.lead.findMany({ where: { id: { in: explicitIds } }, select: leadSelect })
    : await prisma.lead.findMany({
        where: { status: "connected", connectedAt: { gte: since!, not: null } },
        orderBy: { connectedAt: "desc" },
        ...(payload.limit && payload.limit > 0 ? { take: payload.limit } : {}),
        select: leadSelect,
      });

  const scope = explicitIds.length
    ? `${targets.length} selected connection(s)`
    : `connection(s) added since ${payload.since!.slice(0, 10)}`;

  if (targets.length === 0) {
    await recordActivity({
      accountId,
      type: "info",
      message: `No connections to message (${scope}). Try syncing connections first.`,
    });
    return { ok: true, detail: "0 matching connections" };
  }

  await recordActivity({
    accountId,
    type: "info",
    message: `Messaging ${targets.length} ${explicitIds.length ? "selected connection(s)" : `connection(s) added since ${payload.since!.slice(0, 10)}`}…`,
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
