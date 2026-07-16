import type { Page } from "playwright";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { getAccountSession, saveSession } from "@/lib/linkedin/browser";
import { isLoggedIn } from "@/lib/linkedin/auth";
import { SELECTORS } from "@/lib/linkedin/selectors";
import {
  anyPresent,
  humanDelay,
  randInt,
} from "@/lib/linkedin/utils";
import { captureFailure } from "@/lib/linkedin/debug";
import type { ScrapedLead } from "@/types";

interface SearchFilters {
  keywords?: string | null;
  location?: string | null;
  industry?: string | null;
  currentCompany?: string | null;
  pastCompany?: string | null;
  title?: string | null;
  connectionDegree?: string | null;
}

const DEGREE_MAP: Record<string, string> = {
  "1st": "F",
  "2nd": "S",
  "3rd": "O",
};

/**
 * Build a LinkedIn people-search URL from saved filters.
 *
 * Geo/industry require LinkedIn URNs that we can't resolve without extra
 * lookups, so location/industry/company/title are folded into the free-text
 * `keywords` query — a pragmatic best-effort that works without those URNs.
 */
export function buildSearchUrl(filters: SearchFilters, page = 1): string {
  const terms = [
    filters.keywords,
    filters.title,
    filters.currentCompany,
    filters.location,
    filters.industry,
  ]
    .filter((t): t is string => Boolean(t && t.trim()))
    .join(" ");

  const params = new URLSearchParams();
  if (terms) params.set("keywords", terms);
  params.set("origin", "GLOBAL_SEARCH_HEADER");
  if (page > 1) params.set("page", String(page));

  const degree = filters.connectionDegree
    ? DEGREE_MAP[filters.connectionDegree]
    : undefined;
  if (degree) params.set("network", JSON.stringify([degree]));

  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function splitName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Scrape the visible people-result cards on the current page.
 *
 * LinkedIn's search results now use randomized/hashed CSS class names, so we
 * anchor on stable structure instead: each result is a `div[role="listitem"]`
 * containing a profile `a[href*="/in/"]`. Name comes from the profile anchor's
 * text; headline/location are parsed best-effort from the card's visible text.
 */
async function scrapePage(page: Page): Promise<ScrapedLead[]> {
  // Scroll to trigger lazy loading of all cards.
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, randInt(600, 1100));
    await humanDelay(400, 900);
  }

  const rows = await page.$$eval('div[role="listitem"]', (cards) => {
    const clean = (s: string | null | undefined): string =>
      (s ?? "").replace(/\s+/g, " ").trim();

    const results: Array<{
      fullName: string;
      headline?: string;
      profileUrl: string;
      location?: string;
    }> = [];

    for (const card of Array.from(cards)) {
      const links = Array.from(
        card.querySelectorAll("a[href*='/in/']"),
      ) as HTMLAnchorElement[];
      if (links.length === 0) continue;

      const profileUrl = (links[0]?.href ?? "").split("?")[0];
      if (!profileUrl || !profileUrl.includes("/in/")) continue;

      // Name: first profile anchor with visible text; fall back to the photo's
      // alt text ("<name> is open to work" / "<name>'s profile").
      let fullName = "";
      for (const a of links) {
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
      // Strip trailing degree ("• 3rd+"), "View …'s profile", status suffixes.
      fullName = fullName
        .replace(/^view\s+/i, "")
        .replace(/['’]s\s+profile.*$/i, "")
        .replace(/\s*[•·].*$/, "")
        .replace(/\s+is\s+(open to work|hiring).*$/i, "")
        .trim();
      if (!fullName || /LinkedIn Member/i.test(fullName)) continue;

      const entry: {
        fullName: string;
        headline?: string;
        profileUrl: string;
        location?: string;
      } = { fullName, profileUrl };

      // Headline + location: the visible text lines under the name, minus the
      // degree badge, action buttons, and "Past/Current" role summaries.
      const noise =
        /^(•|·|connect|message|follow|following|pending|save|saved|remove|1st|2nd|3rd)\b/i;
      const lines = clean(card.textContent)
        .split("\n")
        .map((l) => l.trim());
      // textContent collapses newlines, so also split the innerText for lines.
      const textLines = ((card as HTMLElement).innerText || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => l !== fullName && !noise.test(l))
        .filter((l) => !/^(past|current):/i.test(l));
      const candidates = textLines.length ? textLines : lines;
      if (candidates[0]) entry.headline = candidates[0].slice(0, 300);
      if (candidates[1]) entry.location = candidates[1].slice(0, 200);

      results.push(entry);
    }
    return results;
  });

  return rows.map((r) => {
    const { firstName, lastName } = splitName(r.fullName);
    const lead: ScrapedLead = {
      fullName: r.fullName,
      profileUrl: r.profileUrl,
    };
    if (firstName) lead.firstName = firstName;
    if (lastName) lead.lastName = lastName;
    if (r.headline) lead.headline = r.headline;
    if (r.location) lead.location = r.location;
    return lead;
  });
}

export interface RunSearchResult {
  ok: boolean;
  leadsFound: number;
  leadsCreated: number;
  reason?: "captcha" | "not_logged_in" | "error";
  detail?: string;
}

/**
 * Run a saved search end-to-end: navigate, paginate up to maxPages, scrape,
 * and upsert leads linked to the search.
 */
export async function runSearch(
  searchId: string,
  accountId: string,
  options: { headless?: boolean } = {},
): Promise<RunSearchResult> {
  const search = await prisma.search.findUnique({ where: { id: searchId } });
  if (!search) return { ok: false, leadsFound: 0, leadsCreated: 0, reason: "error", detail: "search not found" };

  let page: Page;
  try {
    const session = await getAccountSession(accountId, {
      headless: options.headless ?? true,
    });
    console.log(session, "SESSION")
    page = session.page;
  } catch (err) {
    return { ok: false, leadsFound: 0, leadsCreated: 0, reason: "error", detail: String(err) };
  }

  const allLeads = new Map<string, ScrapedLead>();

  try {
    await recordActivity({
      accountId,
      type: "search",
      message: `Running search "${search.name}"…`,
    });

    for (let pageNum = 1; pageNum <= search.maxPages; pageNum++) {
      await page.goto(buildSearchUrl(search, pageNum), {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await humanDelay(2000, 4000);

      if (pageNum === 1 && !(await isLoggedIn(page))) {
        return { ok: false, leadsFound: 0, leadsCreated: 0, reason: "not_logged_in", detail: "session expired" };
      }

      if (await anyPresent(page, SELECTORS.login.captcha)) {
        await prisma.linkedInAccount.update({
          where: { id: accountId },
          data: { status: "captcha" },
        });
        await recordActivity({
          accountId,
          type: "captcha",
          message: "CAPTCHA hit during search — account paused.",
        });
        return { ok: false, leadsFound: allLeads.size, leadsCreated: 0, reason: "captcha" };
      }

      const pageLeads = await scrapePage(page);
      if (pageLeads.length === 0) {
        await captureFailure(page, `search-empty-page-${pageNum}`);
        break; // no more results (or selectors drifted)
      }
      for (const lead of pageLeads) allLeads.set(lead.profileUrl, lead);

      // Pagination is driven by the `?page=N` URL (set in buildSearchUrl) at
      // the top of this loop, so we just continue to the next page number.
      // A short human-like pause before the next navigation.
      if (pageNum === search.maxPages) break;
      await humanDelay(2500, 5000);
    }

    // Persist leads.
    let created = 0;
    for (const lead of allLeads.values()) {
      const result = await prisma.lead.upsert({
        where: { profileUrl: lead.profileUrl },
        update: {
          searchId,
          headline: lead.headline ?? undefined,
          location: lead.location ?? undefined,
        },
        create: {
          searchId,
          fullName: lead.fullName,
          firstName: lead.firstName ?? null,
          lastName: lead.lastName ?? null,
          headline: lead.headline ?? null,
          profileUrl: lead.profileUrl,
          location: lead.location ?? null,
          connectionDegree: search.connectionDegree ?? null,
          status: "new",
        },
      });
      if (result.importedAt.getTime() > Date.now() - 5000) created++;
    }

    await prisma.search.update({
      where: { id: searchId },
      data: { lastRunAt: new Date(), resultCount: allLeads.size },
    });
    await saveSession(accountId);
    await recordActivity({
      accountId,
      type: "search",
      message: `Search "${search.name}" finished: ${allLeads.size} profiles found.`,
      metadata: { searchId, found: allLeads.size },
    });

    return { ok: true, leadsFound: allLeads.size, leadsCreated: created };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await captureFailure(page, "search-error");
    await recordActivity({
      accountId,
      type: "error",
      message: `Search failed: ${detail}`,
    });
    return { ok: false, leadsFound: allLeads.size, leadsCreated: 0, reason: "error", detail };
  }
}
