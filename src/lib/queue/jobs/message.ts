import { sendMessage, type MessageOutcome } from "@/lib/linkedin/message";
import { incrementMessage } from "@/lib/limits";

/**
 * Perform one message step for a campaign lead. Increments the account's
 * daily message counter on success. Limit checks are enforced by the worker
 * before this is called.
 */
export async function processMessageStep(
  accountId: string,
  leadId: string,
  body: string,
  headless: boolean,
): Promise<MessageOutcome> {
  const outcome = await sendMessage(accountId, leadId, body, { headless });
  if (outcome.ok) {
    await incrementMessage(accountId);
  }
  return outcome;
}
