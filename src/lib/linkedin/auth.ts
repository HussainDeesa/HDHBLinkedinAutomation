import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { recordActivity } from "@/lib/activity";
import {
  getAccountSession,
  saveSession,
} from "@/lib/linkedin/browser";
import { SELECTORS } from "@/lib/linkedin/selectors";
import {
  anyPresent,
  firstVisible,
  humanClick,
  humanType,
  humanDelay,
} from "@/lib/linkedin/utils";

export type LoginResult =
  | { ok: true; alreadyLoggedIn: boolean }
  | { ok: false; reason: "captcha" | "checkpoint" | "bad_credentials" | "error"; detail?: string };

const FEED_URL = "https://www.linkedin.com/feed/";
const LOGIN_URL = "https://www.linkedin.com/login";

/** Detect a captcha/checkpoint and mark the account accordingly. */
async function detectChallenge(
  accountId: string,
  page: import("playwright").Page,
): Promise<"captcha" | "checkpoint" | null> {
  if (await anyPresent(page, SELECTORS.login.captcha)) {
    await prisma.linkedInAccount.update({
      where: { id: accountId },
      data: { status: "captcha" },
    });
    await recordActivity({
      accountId,
      type: "captcha",
      message: "CAPTCHA detected during login — account paused for manual review.",
    });
    return "captcha";
  }
  if (await anyPresent(page, SELECTORS.login.checkpoint)) {
    await recordActivity({
      accountId,
      type: "info",
      message: "Security checkpoint (2FA/PIN) detected — complete it in the open browser window.",
    });
    return "checkpoint";
  }
  return null;
}

/** Are we currently authenticated (feed/nav visible)? */
export async function isLoggedIn(
  page: import("playwright").Page,
): Promise<boolean> {
  return anyPresent(page, SELECTORS.login.loggedIn);
}

/**
 * Log an account into LinkedIn. In headed mode this lets a human resolve 2FA
 * or captcha in the visible window; the function waits for the feed to appear.
 */
export async function loginAccount(
  accountId: string,
  options: { headless?: boolean; waitForManualMs?: number } = {},
): Promise<LoginResult> {
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return { ok: false, reason: "error", detail: "account not found" };

  try {
    const { page } = await getAccountSession(accountId, {
      headless: options.headless ?? false,
    });

    // Reuse an existing session if cookies are still valid.
    await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await humanDelay(1500, 3000);
    if (await isLoggedIn(page)) {
      await prisma.linkedInAccount.update({
        where: { id: accountId },
        data: { status: "active" },
      });
      await saveSession(accountId);
      await recordActivity({
        accountId,
        type: "login",
        message: "Session restored from saved cookies.",
      });
      return { ok: true, alreadyLoggedIn: true };
    }

    // Fresh login.
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await humanDelay(1000, 2500);

    const userField = await firstVisible(page, [SELECTORS.login.username]);
    const passField = await firstVisible(page, [SELECTORS.login.password]);
    if (!userField || !passField) {
      return { ok: false, reason: "error", detail: "login form not found" };
    }

    await humanClick(page, userField);
    await humanType(userField, account.email);
    await humanDelay(400, 1200);
    await humanClick(page, passField);
    await humanType(passField, decrypt(account.passwordEnc));
    await humanDelay(500, 1500);

    const submit = await firstVisible(page, [SELECTORS.login.submit]);
    if (submit) await humanClick(page, submit);

    // Wait for either the feed or a challenge to materialize.
    const deadline = Date.now() + (options.waitForManualMs ?? 120000);
    while (Date.now() < deadline) {
      await humanDelay(1500, 2500);
      if (await isLoggedIn(page)) {
        await prisma.linkedInAccount.update({
          where: { id: accountId },
          data: { status: "active" },
        });
        await saveSession(accountId);
        await recordActivity({
          accountId,
          type: "login",
          message: "Logged in successfully.",
        });
        return { ok: true, alreadyLoggedIn: false };
      }
      const challenge = await detectChallenge(accountId, page);
      if (challenge === "captcha") {
        return { ok: false, reason: "captcha" };
      }
      // For a checkpoint we keep waiting so a human can complete 2FA.
    }

    // Timed out waiting — classify why.
    const challenge = await detectChallenge(accountId, page);
    if (challenge) return { ok: false, reason: challenge };
    return { ok: false, reason: "bad_credentials", detail: "feed never appeared" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await recordActivity({
      accountId,
      type: "error",
      message: `Login failed: ${detail}`,
    });
    return { ok: false, reason: "error", detail };
  }
}
