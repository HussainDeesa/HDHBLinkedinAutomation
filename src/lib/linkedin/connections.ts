import type { Page } from "playwright";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { getAccountSession, saveSession } from "@/lib/linkedin/browser";
import { isLoggedIn } from "@/lib/linkedin/auth";
import { SELECTORS } from "@/lib/linkedin/selectors";
import { anyPresent, firstVisible, humanDelay, randInt } from "@/lib/linkedin/utils";
import { captureFailure } from "@/lib/linkedin/debug";
import type { ScrapedConnection } from "@/types";

const CONNECTIONS_URL =
  "https://www.linkedin.com/mynetwork/invite-connect/connections/";

// LinkedIn only shows connections in batches; cap how hard we scroll so a huge
// network doesn't run the browser forever. ~10 connections per batch.
const MAX_LOAD_ROUNDS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS, // approximate
  year: 365 * DAY_MS, // approximate
};

/**
 * Parse LinkedIn's "Connected …" badge text into an approximate Date.
 *
 * LinkedIn only exposes relative text ("Connected 2 months ago") or, for
 * older connections, an explicit date ("Connected on June 10, 2026"). We
 * accept both. Relative values are inherently month-level approximate, which
 * is fine for "connected since <month>" targeting. Returns null if we can't
 * make sense of the text.
 */
export function parseConnectedAt(
  text: string | undefined | null,
  now: Date = new Date(),
): Date | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  if (/\btoday\b|\bjust now\b/.test(t)) return now;
  if (/\byesterday\b/.test(t)) return new Date(now.getTime() - DAY_MS);

  // "connected 2 months ago", "3 weeks ago", "a month ago"
  const rel = t.match(
    /\b(a|an|\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago\b/,
  );
  if (rel) {
    const qty = rel[1] === "a" || rel[1] === "an" ? 1 : parseInt(rel[1]!, 10);
    const unit = UNIT_MS[rel[2]!];
    if (unit && Number.isFinite(qty)) {
      return new Date(now.getTime() - qty * unit);
    }
  }

  // Explicit date, e.g. "connected on June 10, 2026" or "June 10, 2026".
  const onDate = t.replace(/^.*\bconnected\s+on\s+/, "");
  const parsed = new Date(onDate);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function splitName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Scrape every currently-rendered connection card. */
async function scrapeCards(page: Page): Promise<ScrapedConnection[]> {
  // LinkedIn's Connections page (like search) uses randomized/hashed class
  // names, so we anchor on structure: each connection row contains a profile
  // `a[href*="/in/"]`, and the connection date lives in a semantic `<time>`
  // element ("Connected 2 months ago"). We group by the enclosing "card",
  // preferring role="listitem" and falling back to a small parent walk.
  const rows = await page.$$eval("a[href*='/in/']", (anchors) => {
    const clean = (s: string | null | undefined): string =>
      (s ?? "").replace(/\s+/g, " ").trim();
    const slugOf = (href: string): string | null => {
      const m = href.match(/\/in\/([^/?#]+)/);
      return m ? m[1]! : null;
    };

    // Each connection has TWO /in/ anchors (photo + name), and rows do NOT use
    // role="listitem". Group anchors by profile slug, then scope each person's
    // "card" to the smallest ancestor that contains ONLY their links — walking
    // up a fixed number of parents lands on a shared container and makes every
    // row resolve to the first person (the "repeats the first one" bug).
    const groups = new Map<string, HTMLAnchorElement[]>();
    for (const a of Array.from(anchors) as HTMLAnchorElement[]) {
      const slug = slugOf(a.href || "");
      if (!slug) continue;
      if (!groups.has(slug)) groups.set(slug, []);
      groups.get(slug)!.push(a);
    }

    const uniqueSlugsIn = (el: Element): Set<string> => {
      const s = new Set<string>();
      for (const x of Array.from(el.querySelectorAll("a[href*='/in/']"))) {
        const sl = slugOf((x as HTMLAnchorElement).href || "");
        if (sl) s.add(sl);
      }
      return s;
    };

    const results: Array<{
      fullName: string;
      profileUrl: string;
      headline?: string;
      connectedText?: string;
    }> = [];

    for (const [slug, group] of groups) {
      const profileUrl = (group[0]!.href || "").split("?")[0];
      if (!profileUrl.includes("/in/")) continue;

      // Card = largest ancestor that still contains only THIS person's links.
      let card: Element = group[0]!;
      let node: Element | null = group[0]!.parentElement;
      for (let i = 0; i < 10 && node; i++) {
        const slugs = uniqueSlugsIn(node);
        if (slugs.size === 1 && slugs.has(slug)) {
          card = node;
          node = node.parentElement;
        } else break;
      }

      // Name: the anchor that actually has text; else the photo's alt text.
      let fullName = "";
      for (const a of group) {
        const t = clean(a.textContent);
        if (t) {
          fullName = t;
          break;
        }
      }
      if (!fullName) {
        const img = card.querySelector("img[alt]");
        fullName = clean(img?.getAttribute("alt"));
      }
      fullName = fullName
        .replace(/^view\s+/i, "")
        .replace(/['’]s\s+profile.*$/i, "")
        .replace(/\s*[•·].*$/, "")
        .replace(/\s+is\s+(open to work|hiring).*$/i, "")
        .trim();
      if (!fullName || /LinkedIn Member/i.test(fullName)) continue;

      const rawLines = ((card as HTMLElement).innerText || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const entry: {
        fullName: string;
        profileUrl: string;
        headline?: string;
        connectedText?: string;
      } = { fullName, profileUrl };

      // Connection date: <time> if present, else a line mentioning "connected".
      const timeEl = card.querySelector("time");
      let connectedText = clean(timeEl?.textContent);
      if (!connectedText) {
        connectedText = rawLines.find((l) => /connected/i.test(l)) ?? "";
      }
      if (connectedText) entry.connectedText = connectedText;

      // Occupation/headline: first line that isn't the name/date/action button.
      const noise = /^(•|·|connected|connect|message|following|pending|remove)\b/i;
      const occ = rawLines.find(
        (l) => l !== fullName && !noise.test(l) && l.length > 1,
      );
      if (occ) entry.headline = occ.slice(0, 300);

      results.push(entry);
    }
    return results;
  });

  return rows.map((r) => {
    const { firstName, lastName } = splitName(r.fullName);
    const conn: ScrapedConnection = {
      fullName: r.fullName,
      profileUrl: r.profileUrl,
    };
    if (firstName) conn.firstName = firstName;
    if (lastName) conn.lastName = lastName;
    if (r.headline) conn.headline = r.headline;
    if (r.connectedText) {
      conn.connectedText = r.connectedText;
      const at = parseConnectedAt(r.connectedText);
      if (at) conn.connectedAt = at;
    }
    return conn;
  });
}

export interface SyncConnectionsResult {
  ok: boolean;
  scanned: number;
  saved: number;
  reason?: "captcha" | "not_logged_in" | "error";
  detail?: string;
}

/**
 * Scrape the account's Connections list (newest-first) and upsert each into
 * the Leads table with an approximate `connectedAt`.
 *
 * The list is sorted "Recently added", so once we've loaded connections older
 * than `options.since` we can stop early instead of paging the whole network.
 */
export async function syncConnections(
  accountId: string,
  options: { headless?: boolean; since?: Date | null; max?: number } = {},
): Promise<SyncConnectionsResult> {
  let page: Page;
  try {
    const session = await getAccountSession(accountId, {
      headless: options.headless ?? true,
    });
    page = session.page;
  } catch (err) {
    return { ok: false, scanned: 0, saved: 0, reason: "error", detail: String(err) };
  }

  const since = options.since ?? null;
  const max = options.max ?? Infinity;
  const seen = new Map<string, ScrapedConnection>();

  try {
    await recordActivity({
      accountId,
      type: "info",
      message: since
        ? `Syncing connections added since ${since.toISOString().slice(0, 10)}…`
        : "Syncing connections…",
    });

    await page.goto(CONNECTIONS_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await humanDelay(2500, 4500);

    if (!(await isLoggedIn(page))) {
      return { ok: false, scanned: 0, saved: 0, reason: "not_logged_in", detail: "session expired" };
    }
    if (await anyPresent(page, SELECTORS.login.captcha)) {
      await prisma.linkedInAccount.update({ where: { id: accountId }, data: { status: "captcha" } });
      await recordActivity({ accountId, type: "captcha", message: "CAPTCHA during connections sync — paused." });
      return { ok: false, scanned: 0, saved: 0, reason: "captcha" };
    }

    let reachedCutoff = false;
    for (let round = 0; round < MAX_LOAD_ROUNDS; round++) {
      const cards = await scrapeCards(page);
      for (const c of cards) seen.set(c.profileUrl, c);

      // Stop once the list has scrolled past the cutoff date. Cards without a
      // parseable date never trigger the cutoff (we keep them, dateless).
      if (since) {
        const oldestDated = cards
          .map((c) => c.connectedAt)
          .filter((d): d is Date => Boolean(d))
          .sort((a, b) => a.getTime() - b.getTime())[0];
        if (oldestDated && oldestDated.getTime() < since.getTime()) {
          reachedCutoff = true;
          break;
        }
      }
      if (seen.size >= max) break;

      // Load the next batch: click "Show more results" if present, else scroll.
      const more = await firstVisible(page, SELECTORS.connections.loadMore, 2500);
      const before = seen.size;
      if (more) {
        await more.scrollIntoViewIfNeeded().catch(() => undefined);
        await more.click().catch(() => undefined);
      } else {
        await page.mouse.wheel(0, randInt(1200, 2200));
      }
      await humanDelay(1500, 3000);

      // Detect end-of-list: another scrape yields nothing new.
      const after = await scrapeCards(page);
      for (const c of after) seen.set(c.profileUrl, c);
      if (seen.size === before && !more) break;
    }

    // Persist. Preserve any existing status (don't downgrade "messaged").
    let saved = 0;
    for (const c of seen.values()) {
      if (since && c.connectedAt && c.connectedAt.getTime() < since.getTime()) continue;
      await prisma.lead.upsert({
        where: { profileUrl: c.profileUrl },
        update: {
          fullName: c.fullName,
          firstName: c.firstName ?? undefined,
          lastName: c.lastName ?? undefined,
          headline: c.headline ?? undefined,
          connectionDegree: "1st",
          connectedAt: c.connectedAt ?? undefined,
        },
        create: {
          fullName: c.fullName,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          headline: c.headline ?? null,
          profileUrl: c.profileUrl,
          connectionDegree: "1st",
          connectedAt: c.connectedAt ?? null,
          status: "connected",
        },
      });
      saved++;
    }

    await saveSession(accountId);
    await recordActivity({
      accountId,
      type: "info",
      message: `Connections sync finished: ${saved} saved (${seen.size} scanned${reachedCutoff ? ", stopped at cutoff" : ""}).`,
      metadata: { saved, scanned: seen.size, reachedCutoff },
    });

    return { ok: true, scanned: seen.size, saved };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await captureFailure(page, "connections-sync-error");
    await recordActivity({ accountId, type: "error", message: `Connections sync failed: ${detail}` });
    return { ok: false, scanned: seen.size, saved: 0, reason: "error", detail };
  }
}
