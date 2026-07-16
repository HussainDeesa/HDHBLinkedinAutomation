import type { Locator, Page } from "playwright";

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random delay between min and max ms (humanization between actions). */
export function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return sleep(randInt(minMs, maxMs));
}

/**
 * Try a list of selectors in order, returning the first that resolves to a
 * visible element within the timeout. Returns null if none match.
 */
export async function firstVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 5000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible()) return locator;
      } catch {
        // selector may be momentarily detached; keep trying
      }
    }
    await sleep(200);
  }
  return null;
}

/** True if any of the selectors is currently present on the page. */
export async function anyPresent(
  page: Page,
  selectors: readonly string[],
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      if ((await page.locator(selector).count()) > 0) return true;
    } catch {
      // ignore malformed/transient selector
    }
  }
  return false;
}

/**
 * Move the mouse to a locator along a few intermediate points to mimic a
 * human cursor path, then click. Falls back to a normal click if geometry
 * is unavailable.
 */
export async function humanClick(page: Page, locator: Locator): Promise<void> {
  try {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (box) {
      const targetX = box.x + box.width / 2 + randInt(-4, 4);
      const targetY = box.y + box.height / 2 + randInt(-3, 3);
      const steps = randInt(3, 6);
      const start = { x: randInt(0, 200), y: randInt(0, 200) };
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = start.x + (targetX - start.x) * t + randInt(-6, 6);
        const y = start.y + (targetY - start.y) * t + randInt(-6, 6);
        await page.mouse.move(x, y);
        await sleep(randInt(15, 60));
      }
      await page.mouse.move(targetX, targetY);
      await sleep(randInt(40, 140));
      await page.mouse.click(targetX, targetY);
      return;
    }
  } catch {
    // fall through to a plain click
  }
  await locator.click();
}

/**
 * Type text character-by-character with small random delays to mimic human
 * typing. Assumes the locator is already focused/clicked.
 */
export async function humanType(
  locator: Locator,
  text: string,
): Promise<void> {
  for (const char of text) {
    await locator.pressSequentially(char, { delay: randInt(30, 110) });
  }
}

/** A randomized desktop viewport (width 1280–1920). */
export function randomViewport(): { width: number; height: number } {
  const width = randInt(1280, 1920);
  const height = randInt(720, 1080);
  return { width, height };
}
