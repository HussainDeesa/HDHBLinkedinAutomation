/**
 * Standalone background worker process.
 *
 *   npm run worker
 *
 * Runs the campaign engine + one-off job queue in a loop, independent of the
 * Next.js web server. Shut down cleanly on SIGINT/SIGTERM.
 */
import { runWorker, requestStop } from "@/lib/queue/worker";
import { closeAllSessions } from "@/lib/linkedin/browser";

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n[worker] received ${signal}, shutting down…`);
  requestStop();
  await closeAllSessions().catch(() => undefined);
  // Give the loop a moment to exit its current tick.
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

runWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal:", err);
  process.exit(1);
});
