import path from "path";
import fs from "fs/promises";
import { chromium } from "playwright-extra";
// puppeteer-extra-plugin-stealth is compatible with playwright-extra.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { randomViewport } from "@/lib/linkedin/utils";

// Register the stealth plugin once.
chromium.use(StealthPlugin());

const SESSIONS_DIR = path.join(process.cwd(), "sessions");

interface AccountSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

// One live browser context per LinkedIn account, reused across jobs.
const sessions = new Map<string, AccountSession>();

function sessionFile(accountId: string): string {
  return path.join(SESSIONS_DIR, `${accountId}.json`);
}

async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

/** Parse a proxy string ("http://user:pass@host:port" or "host:port"). */
function parseProxy(
  proxy: string | null | undefined,
): { server: string; username?: string; password?: string } | undefined {
  if (!proxy) return undefined;
  try {
    const url = new URL(proxy.includes("://") ? proxy : `http://${proxy}`);
    const result: { server: string; username?: string; password?: string } = {
      server: `${url.protocol}//${url.host}`,
    };
    if (url.username) result.username = decodeURIComponent(url.username);
    if (url.password) result.password = decodeURIComponent(url.password);
    return result;
  } catch {
    return { server: proxy };
  }
}

/**
 * Load a previously saved Playwright storageState for an account.
 * Prefers the on-disk session file, falling back to the encrypted copy in
 * the database (e.g. on a fresh machine).
 */
async function loadStorageState(
  accountId: string,
): Promise<string | undefined> {
  await ensureSessionsDir();
  const file = sessionFile(accountId);
  try {
    await fs.access(file);
    return file; // Playwright accepts a path
  } catch {
    // not on disk — try DB
  }
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
    select: { cookiesJson: true },
  });
  if (account?.cookiesJson) {
    try {
      const json = decrypt(account.cookiesJson);
      await fs.writeFile(file, json, "utf8");
      return file;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

interface CreateContextOptions {
  headless?: boolean;
}

/**
 * Get (or create) the live session for an account. Reuses an existing
 * context if one is open.
 */
export async function getAccountSession(
  accountId: string,
  options: CreateContextOptions = {},
): Promise<AccountSession> {
  const existing = sessions.get(accountId);
  if (existing && existing.browser.isConnected()) return existing;

  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw new Error(`Account ${accountId} not found`);

  const headless = options.headless ?? false;
  const proxy = parseProxy(account.proxy);
  const viewport = randomViewport();

  const browser = await chromium.launch({
    headless,
    ...(proxy ? { proxy } : {}),
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const storageStatePath = await loadStorageState(accountId);
  const context = await browser.newContext({
    viewport,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: account.timezone || "America/New_York",
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
  });

  // tsx/esbuild transpiles the worker with `keepNames`, which injects calls to
  // a `__name(...)` helper into any function we hand to page.$$eval/evaluate.
  // That helper doesn't exist in the browser realm, so evaluated code throws
  // "ReferenceError: __name is not defined". Polyfill it as a passthrough.
  // Passed as a raw string so the shim itself is never transpiled.
  await context.addInitScript(
    "window.__name = window.__name || function (target) { return target; };",
  );

  const page = await context.newPage();
  const session: AccountSession = { browser, context, page };
  sessions.set(accountId, session);
  return session;
}

/**
 * Persist the current cookies/storage for an account to disk and (encrypted)
 * to the database. Never logs cookie contents.
 */
export async function saveSession(accountId: string): Promise<void> {
  const session = sessions.get(accountId);
  if (!session) return;
  await ensureSessionsDir();
  const file = sessionFile(accountId);
  const state = await session.context.storageState({ path: file });
  const json = JSON.stringify(state);
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: { cookiesJson: encrypt(json) },
  });
}

/** Close and forget the browser session for an account. */
export async function closeAccountSession(accountId: string): Promise<void> {
  const session = sessions.get(accountId);
  if (!session) return;
  sessions.delete(accountId);
  try {
    await session.context.close();
    await session.browser.close();
  } catch {
    // already closed
  }
}

/** Close every open browser session (used on worker shutdown). */
export async function closeAllSessions(): Promise<void> {
  await Promise.all(
    [...sessions.keys()].map((id) => closeAccountSession(id)),
  );
}

export { SESSIONS_DIR };
