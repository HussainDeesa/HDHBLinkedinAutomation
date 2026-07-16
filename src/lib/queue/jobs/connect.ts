import { sendConnectionRequest, type ConnectOutcome } from "@/lib/linkedin/connect";
import { incrementConnect } from "@/lib/limits";

/**
 * Perform one connection-request step for a campaign lead. Increments the
 * account's daily connect counter on success. Limit/availability checks are
 * the caller's responsibility (the worker enforces them before calling).
 */
export async function processConnectStep(
  accountId: string,
  leadId: string,
  note: string | null,
  headless: boolean,
): Promise<ConnectOutcome> {
  const outcome = await sendConnectionRequest(accountId, leadId, note, { headless });
  if (outcome.ok && !outcome.alreadyConnected) {
    await incrementConnect(accountId);
  }
  return outcome;
}
