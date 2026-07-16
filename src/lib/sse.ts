import { EventEmitter } from "events";

/**
 * In-process pub/sub for real-time activity events.
 *
 * NOTE: the Next.js server and the background worker run as separate
 * processes, so this emitter only carries events within a single process.
 * For genuine cross-process delivery the SSE route at
 * `/api/activity/stream` also polls the Activity table. This emitter gives
 * instant delivery for events produced inside the web process (e.g. a
 * manually triggered search) and is harmless for the worker.
 */

export interface ActivityEvent {
  id: string;
  accountId: string;
  type: string;
  leadId?: string | null;
  message: string;
  metadata?: string | null;
  createdAt: string;
}

const globalForBus = globalThis as unknown as {
  activityBus: EventEmitter | undefined;
};

export const activityBus =
  globalForBus.activityBus ??
  (() => {
    const bus = new EventEmitter();
    bus.setMaxListeners(100);
    return bus;
  })();

globalForBus.activityBus = activityBus;

export const ACTIVITY_EVENT = "activity";

export function publishActivity(event: ActivityEvent): void {
  activityBus.emit(ACTIVITY_EVENT, event);
}

export function subscribeActivity(
  handler: (event: ActivityEvent) => void,
): () => void {
  activityBus.on(ACTIVITY_EVENT, handler);
  return () => activityBus.off(ACTIVITY_EVENT, handler);
}
