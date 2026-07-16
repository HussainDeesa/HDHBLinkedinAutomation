import { prisma } from "@/lib/prisma";
import { publishActivity } from "@/lib/sse";

export type ActivityType =
  | "login"
  | "search"
  | "connect_sent"
  | "message_sent"
  | "error"
  | "captcha"
  | "info";

export interface RecordActivityInput {
  accountId: string;
  type: ActivityType;
  message: string;
  leadId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Persist an activity row and publish it to the in-process SSE bus.
 * Single source of truth for "something happened" — used by both the web
 * process and the worker.
 */
export async function recordActivity(input: RecordActivityInput) {
  const activity = await prisma.activity.create({
    data: {
      accountId: input.accountId,
      type: input.type,
      message: input.message,
      leadId: input.leadId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  publishActivity({
    id: activity.id,
    accountId: activity.accountId,
    type: activity.type,
    leadId: activity.leadId,
    message: activity.message,
    metadata: activity.metadata,
    createdAt: activity.createdAt.toISOString(),
  });

  return activity;
}
