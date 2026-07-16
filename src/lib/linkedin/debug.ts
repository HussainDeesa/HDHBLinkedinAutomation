import path from "path";
import fs from "fs/promises";
import type { Page } from "playwright";

const LOGS_DIR = path.join(process.cwd(), "logs");

/**
 * On a selector/automation failure, dump the page HTML and a screenshot to
 * `logs/` for later inspection. Returns the basename used, or null on error.
 * Never throws — diagnostics must not break the caller's error handling.
 */
export async function captureFailure(
  page: Page,
  label: string,
): Promise<string | null> {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    const safe = label.replace(/[^a-z0-9-_]/gi, "_").slice(0, 60);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}_${safe}`;
    const html = await page.content();
    await fs.writeFile(path.join(LOGS_DIR, `${base}.html`), html, "utf8");
    await page
      .screenshot({ path: path.join(LOGS_DIR, `${base}.png`), fullPage: false })
      .catch(() => undefined);
    return base;
  } catch {
    return null;
  }
}

export { LOGS_DIR };
