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

export type ConnectOutcome =
  | { ok: true; alreadyConnected: boolean }
  | { ok: false; reason: "captcha" | "not_logged_in" | "limit" | "no_button" | "error"; detail?: string };

const NOTE_LIMIT = 300;

/**
 * Locate the target profile's own action button and tag it so we can click
 * exactly that element.
 *
 * LinkedIn's profile page nests a "More profiles for you" rail *inside* <main>,
 * and every card there has its own "Invite <name> to connect" button. A plain
 * aria-label selector matches those sidebar buttons and would connect to the
 * wrong person. We therefore ignore anything inside <aside> (the rail) or a
 * section headed "More profiles"/"People you may know"/"People also viewed",
 * and prefer the button closest to the profile's <h1> name (the top card).
 *
 * Returns "connect" | "more" | null and marks the chosen element with
 * data-auto-target so the caller can build a precise Locator.
 */
async function tagProfileAction(page: Page): Promise<"connect" | "more" | null> {
  return page.evaluate(() => {
    const RAIL = /(more profiles|people you may know|people also viewed|others viewed|similar profiles)/i;
    const inRail = (el: Element): boolean => {
      if (el.closest("aside")) return true;
      let n: Element | null = el;
      for (let i = 0; i < 12 && n; i++) {
        const h = n.querySelector?.("h2, h3");
        if (h?.textContent && RAIL.test(h.textContent)) return true;
        n = n.parentElement;
      }
      return false;
    };
    // Score by proximity to the profile <h1> so the top-card button wins.
    const h1 = document.querySelector("h1");
    const distToH1 = (el: Element): number => {
      if (!h1) return 0;
      // shared-ancestor depth: smaller = closer to the name.
      let n: Element | null = el;
      for (let d = 0; d < 15 && n; d++) {
        if (n.contains(h1)) return d;
        n = n.parentElement;
      }
      return 999;
    };
    // Is the element actually the topmost thing at its own center? The profile
    // page renders a *sticky-header* duplicate of the Connect button pinned at
    // the top-right — where the "Try Premium" chip also sits. Clicking its raw
    // coordinates lands on the Premium chip (→ upsell modal). Requiring the
    // element to win a hit-test at its center rejects that occluded duplicate.
    const hittable = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return false;
      const vh = window.innerHeight || 900;
      if (r.bottom < 0 || r.top > vh) return false; // off-screen vertically
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      if (!top) return false;
      return el === top || el.contains(top) || top.contains(el);
    };

    // The real Connect control is an <a> (with componentkey
    // "ConnectButtonstate:invitation:…"), while sidebar cards use <button>s —
    // so consider anchors, buttons, and anything with a componentkey.
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[aria-label], button[aria-label], [componentkey]",
      ),
    );
    const attr = (el: Element, name: string): string =>
      (el.getAttribute(name) || "").toLowerCase();
    const pick = (test: (el: Element) => boolean): HTMLElement | null => {
      const all = controls.filter(test).filter((el) => !inRail(el));
      // Prefer a genuinely clickable (non-occluded) control; fall back to any.
      const hit = all.filter(hittable);
      const pool = hit.length ? hit : all;
      pool.sort((a, b) => distToH1(a) - distToH1(b));
      return pool[0] ?? null;
    };

    const connect = pick(
      (el) =>
        attr(el, "aria-label").includes("to connect") ||
        attr(el, "componentkey").includes("connectbutton"),
    );
    if (connect) {
      connect.setAttribute("data-auto-target", "connect");
      return "connect" as const;
    }
    const more = pick((el) => attr(el, "aria-label").includes("more actions"));
    if (more) {
      more.setAttribute("data-auto-target", "more");
      return "more" as const;
    }
    return null;
  });
}

/**
 * Dismiss LinkedIn's Premium/upsell "spotlight" interstitial, which free
 * accounts get after clicking Connect ("… level up your career / Try Premium").
 * It's an overlay on top of the real invite dialog, so we close only the upsell
 * (its own close button, scoped to the container holding the Premium link) and
 * fall back to Escape — never touching the invite dialog beneath it.
 * Returns true if an upsell was seen.
 */
async function dismissPremiumInterstitial(page: Page): Promise<boolean> {
  let seen = false;
  for (let i = 0; i < 3; i++) {
    if (!(await anyPresent(page, SELECTORS.modals.premiumUpsell))) break;
    seen = true;
    const tagged = await page.evaluate(() => {
      const link = document.querySelector(
        "a[href*='upsellOrderOrigin'], a[href*='premium/products'], a[href*='upsellSlotId']",
      );
      if (!link) return false;
      // The upsell modal is the container holding this link — a different DOM
      // subtree from the invite dialog, so its close button is safe to click.
      const root =
        (link.closest("[role='dialog']") as HTMLElement | null) ??
        (() => {
          let n: HTMLElement | null = link.parentElement;
          for (let d = 0; d < 8 && n; d++) {
            if (n.querySelector("button")) return n;
            n = n.parentElement;
          }
          return link.parentElement as HTMLElement | null;
        })();
      if (!root) return false;
      const btns = Array.from(root.querySelectorAll("button"));
      const close =
        btns.find((b) => /dismiss|close/i.test(b.getAttribute("aria-label") || "")) ??
        btns.find((b) => b.querySelector("svg[id*='close'], svg[id*='dismiss']")) ??
        btns[0];
      if (!close) return false;
      close.setAttribute("data-auto-target", "dismiss-upsell");
      return true;
    });
    if (tagged) {
      await humanClick(page, page.locator("[data-auto-target='dismiss-upsell']").first());
    } else {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    await humanDelay(700, 1300);
  }
  return seen;
}

/** Open the Connect dialog, either directly or via the "More" menu. */
async function openConnect(page: Page): Promise<boolean> {
  // Scroll to the top so the profile's main action card is in view and the
  // sticky-header button (which overlaps the "Try Premium" chip) is inactive.
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  await humanDelay(400, 800);

  const action = await tagProfileAction(page);

  if (action === "connect") {
    await humanClick(page, page.locator('[data-auto-target="connect"]').first());
    return true;
  }

  if (action === "more") {
    // Open the profile's own "More actions" menu, then click Connect inside the
    // opened dropdown (a menu/overlay, never the aside rail).
    await humanClick(page, page.locator('[data-auto-target="more"]').first());
    await humanDelay(600, 1400);
    const menuConnect = page
      .locator("div[role='menu'], .artdeco-dropdown__content")
      .getByText(/^connect$/i)
      .first();
    try {
      if (await menuConnect.isVisible()) {
        await humanClick(page, menuConnect);
        return true;
      }
    } catch {
      // fall through to legacy selectors
    }
    const inMenu = await firstVisible(page, SELECTORS.profile.connectInMenu, 3000);
    if (inMenu) {
      await humanClick(page, inMenu);
      return true;
    }
  }

  return false;
}

/**
 * Send a connection request to a lead, optionally with a personalized note.
 * Idempotent-ish: detects when already connected / pending.
 */
export async function sendConnectionRequest(
  accountId: string,
  leadId: string,
  note: string | null,
  options: { headless?: boolean } = {},
): Promise<ConnectOutcome> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: "error", detail: "lead not found" };

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
    await humanDelay(2500, 5000);

    if (!(await isLoggedIn(page))) {
      return { ok: false, reason: "not_logged_in" };
    }
    if (await anyPresent(page, SELECTORS.login.captcha)) {
      await prisma.linkedInAccount.update({
        where: { id: accountId },
        data: { status: "captcha" },
      });
      await recordActivity({ accountId, type: "captcha", message: "CAPTCHA during connect — paused." });
      return { ok: false, reason: "captcha" };
    }

    // A Premium upsell can already be covering the page on load.
    await dismissPremiumInterstitial(page);

    const opened = await openConnect(page);
    if (!opened) {
      // Likely already connected or no Connect affordance.
      const messageable = await anyPresent(page, SELECTORS.profile.messageButton);
      if (messageable) {
        await prisma.lead.update({ where: { id: leadId }, data: { status: "connected" } });
        await recordActivity({
          accountId,
          type: "info",
          leadId,
          message: `${lead.fullName} appears already connected — skipping request.`,
        });
        return { ok: true, alreadyConnected: true };
      }
      await captureFailure(page, `connect-no-button-${lead.id}`);
      return { ok: false, reason: "no_button", detail: "Connect button not found" };
    }

    await humanDelay(800, 1800);

    // Clicking Connect frequently triggers the Premium upsell overlay — close
    // it so the real invite dialog underneath becomes actionable.
    await dismissPremiumInterstitial(page);

    // Weekly invitation limit modal sometimes appears here.
    if (await anyPresent(page, ["div:has-text('You've reached the weekly invitation limit')"])) {
      await recordActivity({
        accountId,
        type: "error",
        leadId,
        message: "Weekly invitation limit reached — backing off.",
      });
      return { ok: false, reason: "limit" };
    }

    const trimmedNote = note?.trim().slice(0, NOTE_LIMIT);
    if (trimmedNote && trimmedNote.length > 0) {
      const addNote = await firstVisible(page, SELECTORS.connectModal.addNote, 3000);
      if (addNote) {
        await humanClick(page, addNote);
        await humanDelay(500, 1200);
        const textarea = await firstVisible(page, SELECTORS.connectModal.noteTextarea, 3000);
        if (textarea) {
          await humanClick(page, textarea);
          await humanType(textarea, trimmedNote);
          await humanDelay(500, 1500);
        }
      }
    }

    let send = await firstVisible(page, SELECTORS.connectModal.send, 3000);
    if (!send) {
      // The first Connect click may have surfaced ONLY the upsell (no invite
      // dialog). Clear it, click Connect again, clear again, then re-check.
      const sawUpsell = await dismissPremiumInterstitial(page);
      if (!(await firstVisible(page, SELECTORS.connectModal.send, 1000))) {
        await openConnect(page);
        await humanDelay(800, 1500);
        await dismissPremiumInterstitial(page);
      }
      send = await firstVisible(page, SELECTORS.connectModal.send, 3000);
      if (!send) {
        await captureFailure(page, `connect-no-send-${lead.id}`);
        return {
          ok: false,
          reason: "error",
          detail: sawUpsell
            ? "Invite dialog never appeared — LinkedIn kept showing a Premium upsell (possible free-account connect limit)."
            : "Send button not found",
        };
      }
    }
    await humanClick(page, send);
    await humanDelay(1500, 3000);

    await prisma.lead.update({ where: { id: leadId }, data: { status: "connected" } });
    await saveSession(accountId);
    await recordActivity({
      accountId,
      type: "connect_sent",
      leadId,
      message: `Connection request sent to ${lead.fullName}${trimmedNote ? " (with note)" : ""}.`,
      metadata: { profileUrl: lead.profileUrl },
    });

    return { ok: true, alreadyConnected: false };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await captureFailure(page, `connect-error-${lead.id}`);
    await recordActivity({
      accountId,
      type: "error",
      leadId,
      message: `Connect failed for ${lead.fullName}: ${detail}`,
    });
    return { ok: false, reason: "error", detail };
  }
}
