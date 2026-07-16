import { prisma } from "@/lib/prisma";

/**
 * Return the current date (YYYY-MM-DD) in a given IANA timezone. Used to
 * decide when an account's daily counters should reset (account-local
 * midnight).
 */
function localDateKey(timezone: string, when: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(when);
  }
}

/**
 * Reset an account's daily connect/message counters if its local day has
 * rolled over since `lastResetAt`. Returns the (possibly updated) account.
 */
export async function resetCountersIfNeeded(accountId: string) {
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return null;

  const today = localDateKey(account.timezone);
  const lastResetDay = localDateKey(account.timezone, account.lastResetAt);
  if (today !== lastResetDay) {
    return prisma.linkedInAccount.update({
      where: { id: accountId },
      data: { dailyConnectCount: 0, dailyMessageCount: 0, lastResetAt: new Date() },
    });
  }
  return account;
}

export interface LimitCheck {
  canConnect: boolean;
  canMessage: boolean;
  connectRemaining: number;
  messageRemaining: number;
}

export async function getLimitStatus(accountId: string): Promise<LimitCheck> {
  const account = await resetCountersIfNeeded(accountId);
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const connectionsPerDay = settings?.connectionsPerDay ?? 20;
  const messagesPerDay = settings?.messagesPerDay ?? 50;
  const connectUsed = account?.dailyConnectCount ?? 0;
  const messageUsed = account?.dailyMessageCount ?? 0;
  const connectRemaining = Math.max(0, connectionsPerDay - connectUsed);
  const messageRemaining = Math.max(0, messagesPerDay - messageUsed);
  return {
    canConnect: account?.status === "active" && connectRemaining > 0,
    canMessage: account?.status === "active" && messageRemaining > 0,
    connectRemaining,
    messageRemaining,
  };
}

export async function incrementConnect(accountId: string): Promise<void> {
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: { dailyConnectCount: { increment: 1 } },
  });
}

export async function incrementMessage(accountId: string): Promise<void> {
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: { dailyMessageCount: { increment: 1 } },
  });
}
