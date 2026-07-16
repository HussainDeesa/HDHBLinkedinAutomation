"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Info,
  LogIn,
  MessageSquare,
  Search,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { useApi } from "@/lib/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityType =
  | "login"
  | "search"
  | "connect_sent"
  | "message_sent"
  | "error"
  | "captcha"
  | "info";

/** Shape returned by GET /api/activity. */
interface ApiActivity {
  id: string;
  accountId: string | null;
  type: string;
  leadId: string | null;
  message: string;
  metadata: unknown;
  createdAt: string;
  account: { label: string } | null;
  lead: { fullName: string } | null;
}

/** Shape emitted by the SSE /api/activity/stream endpoint. */
interface StreamActivity {
  id: string;
  accountId: string | null;
  accountLabel: string | null;
  leadName: string | null;
  type: string;
  message: string;
  metadata: unknown;
  createdAt: string;
}

/** Normalised row used for rendering, from either source. */
interface FeedItem {
  id: string;
  accountId: string | null;
  accountLabel: string | null;
  type: string;
  message: string;
  createdAt: string;
}

const MAX_ITEMS = 50;

const TYPE_META: Record<
  ActivityType,
  { icon: LucideIcon; dot: string; text: string }
> = {
  login: { icon: LogIn, dot: "bg-blue-500", text: "text-blue-600" },
  search: { icon: Search, dot: "bg-blue-500", text: "text-blue-600" },
  connect_sent: { icon: UserPlus, dot: "bg-green-500", text: "text-green-600" },
  message_sent: {
    icon: MessageSquare,
    dot: "bg-green-500",
    text: "text-green-600",
  },
  error: { icon: AlertTriangle, dot: "bg-red-500", text: "text-red-600" },
  captcha: { icon: ShieldAlert, dot: "bg-yellow-500", text: "text-yellow-600" },
  info: { icon: Info, dot: "bg-slate-400", text: "text-slate-500" },
};

function metaFor(type: string): { icon: LucideIcon; dot: string; text: string } {
  return TYPE_META[type as ActivityType] ?? TYPE_META.info;
}

function fromApi(a: ApiActivity): FeedItem {
  return {
    id: a.id,
    accountId: a.accountId,
    accountLabel: a.account?.label ?? null,
    type: a.type,
    message: a.message,
    createdAt: a.createdAt,
  };
}

function fromStream(a: StreamActivity): FeedItem {
  return {
    id: a.id,
    accountId: a.accountId,
    accountLabel: a.accountLabel,
    type: a.type,
    message: a.message,
    createdAt: a.createdAt,
  };
}

export interface ActivityFeedProps {
  accountId?: string;
  limit?: number;
  className?: string;
}

export function ActivityFeed({
  accountId,
  limit = 50,
  className,
}: ActivityFeedProps) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (accountId) params.set("accountId", accountId);
  const url = `/api/activity?${params.toString()}`;

  const { data, loading } = useApi<ApiActivity[]>(url);
  const [items, setItems] = useState<FeedItem[]>([]);

  // Seed the live list from the initial fetch.
  useEffect(() => {
    if (data) setItems(data.map(fromApi));
  }, [data]);

  // Subscribe to live updates and prepend matching events.
  useEffect(() => {
    const es = new EventSource("/api/activity/stream");

    const onActivity = (event: Event): void => {
      const message = event as MessageEvent<string>;
      let parsed: StreamActivity;
      try {
        parsed = JSON.parse(message.data) as StreamActivity;
      } catch {
        return;
      }
      if (accountId && parsed.accountId !== accountId) return;

      setItems((prev) => {
        if (prev.some((p) => p.id === parsed.id)) return prev;
        return [fromStream(parsed), ...prev].slice(0, MAX_ITEMS);
      });
    };

    es.addEventListener("activity", onActivity);
    return () => {
      es.removeEventListener("activity", onActivity);
      es.close();
    };
  }, [accountId]);

  if (loading && items.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No activity yet.
      </div>
    );
  }

  return (
    <ul className={cn("divide-y divide-border", className)}>
      {items.map((item) => {
        const meta = metaFor(item.type);
        const Icon = meta.icon;
        return (
          <li key={item.id} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center">
              <Icon className={cn("h-4 w-4", meta.text)} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle",
                    meta.dot,
                  )}
                />
                {item.accountLabel ? `${item.accountLabel} · ` : ""}
                {formatRelativeTime(item.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
