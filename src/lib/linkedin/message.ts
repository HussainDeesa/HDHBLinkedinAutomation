import type { Page } from "playwright";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { getAccountSession, saveSession } from "@/lib/linkedin/browser";
import { isLoggedIn } from "@/lib/linkedin/auth";
import { SELECTORS } from "@/lib/linkedin/selectors";
import {
  anyPresent,
  firstVisible,
  humanClick,
  humanType,
  humanDelay,
} from "@/lib/linkedin/utils";
import { captureFailure } from "@/lib/linkedin/debug";

export type MessageOutcome =
  | { ok: true }
  | { ok: false; reason: "captcha" | "not_logged_in" | "no_box" | "error"; detail?: string };

/**
 * Send a direct message to a connected lead via their profile's Message
 * button and the in-page messaging overlay.
 */
export async function sendMessage(
  accountId: string,
  leadId: string,
  body: string,
  options: { headless?: boolean } = {},
): Promise<MessageOutcome> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: "error", detail: "lead not found" };
  const text = body.trim();
  if (!text) return { ok: false, reason: "error", detail: "empty message body" };

  let page: Page;
  try {
    const session = await getAccountSession(accountId, {
      headless: options.headless ?? true,
    });
    page = session.page;
  } catch (err) {
    return { ok: false, reason: "error", detail: String(err) };
  }

  try {
    await page.goto(lead.profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await humanDelay(1200, 2500);

    if (!(await isLoggedIn(page))) return { ok: false, reason: "not_logged_in" };
    if (await anyPresent(page, SELECTORS.login.captcha)) {
      await prisma.linkedInAccount.update({
        where: { id: accountId },
        data: { status: "captcha" },
      });
      await recordActivity({ accountId, type: "captcha", message: "CAPTCHA during message — paused." });
      return { ok: false, reason: "captcha" };
    }

    const messageBtn = await firstVisible(page, SELECTORS.profile.messageButton, 5000);
    if (!messageBtn) {
      await captureFailure(page, `message-no-button-${lead.id}`);
      return { ok: false, reason: "error", detail: "Message button not found (not connected?)" };
    }
    await humanClick(page, messageBtn);
    await humanDelay(500, 1200);

    const box = await firstVisible(page, SELECTORS.message.messageBox, 6000);
    if (!box) {
      await captureFailure(page, `message-no-box-${lead.id}`);
      return { ok: false, reason: "no_box", detail: "Message input not found" };
    }
    await humanClick(page, box);
    await humanType(box, text);
    await humanDelay(400, 900);

    const send = await firstVisible(page, SELECTORS.message.sendButton, 4000);
    if (!send) {
      await captureFailure(page, `message-no-send-${lead.id}`);
      return { ok: false, reason: "error", detail: "Send button not found" };
    }
    await humanClick(page, send);
    await humanDelay(700, 1500);

    // Close the conversation overlay to leave a clean state.
    const close = await firstVisible(page, SELECTORS.message.closeOverlay, 2000);
    if (close) await humanClick(page, close);

    await prisma.lead.update({ where: { id: leadId }, data: { status: "messaged" } });
    await saveSession(accountId);
    await recordActivity({
      accountId,
      type: "message_sent",
      leadId,
      message: `Message sent to ${lead.fullName}.`,
      metadata: { profileUrl: lead.profileUrl },
    });

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await captureFailure(page, `message-error-${lead.id}`);
    await recordActivity({
      accountId,
      type: "error",
      leadId,
      message: `Message failed for ${lead.fullName}: ${detail}`,
    });
    return { ok: false, reason: "error", detail };
  }
}
