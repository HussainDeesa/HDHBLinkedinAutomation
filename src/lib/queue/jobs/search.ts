import { prisma } from "@/lib/prisma";
import { runSearch } from "@/lib/linkedin/search";

interface SearchJobPayload {
  searchId: string;
}

/**
 * Process a queued `search` job. Reads {searchId} from the payload and runs
 * the scraper under the job's account, in headless mode per global settings.
 */
export async function runSearchJob(
  payload: SearchJobPayload,
  accountId: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  if (!accountId) return { ok: false, detail: "search job requires an accountId" };
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const result = await runSearch(payload.searchId, accountId, {
    headless: settings?.headless ?? true,
  });
  return result.ok
    ? { ok: true }
    : { ok: false, detail: result.detail ?? result.reason };
}
