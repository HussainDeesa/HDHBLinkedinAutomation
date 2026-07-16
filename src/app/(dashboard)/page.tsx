"use client";

import { Activity, MessageSquare, TrendingUp, UserPlus, Users } from "lucide-react";

import { useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatsCard } from "@/components/stats-card";
import { ActivityFeed } from "@/components/activity-feed";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsAccount {
  id: string;
  label: string;
  status: string;
  dailyConnectCount: number;
  dailyMessageCount: number;
}

interface ActiveCampaign {
  id: string;
  name: string;
  total: number;
  completed: number;
}

interface StatsResponse {
  totalLeads: number;
  connections: { today: number; week: number };
  messages: { today: number; week: number };
  responseRate: number;
  limits: { connectionsPerDay: number; messagesPerDay: number };
  accounts: StatsAccount[];
  activeCampaigns: ActiveCampaign[];
}

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct(value, max)}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, loading } = useApi<StatsResponse>("/api/stats");

  return (
    <div>
      <PageHeader title="Dashboard" description="Your outreach at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-lg" />
          ))
        ) : (
          <>
            <StatsCard title="Total Leads" value={stats.totalLeads} icon={Users} />
            <StatsCard
              title="Connections Sent"
              value={stats.connections.today}
              sub={`${stats.connections.week} this week`}
              icon={UserPlus}
            />
            <StatsCard
              title="Messages Sent"
              value={stats.messages.today}
              sub={`${stats.messages.week} this week`}
              icon={MessageSquare}
            />
            <StatsCard
              title="Response Rate"
              value={`${stats.responseRate}%`}
              icon={TrendingUp}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed limit={20} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active campaigns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading || !stats ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : stats.activeCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active campaigns.
                </p>
              ) : (
                stats.activeCampaigns.map((c) => (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.completed} / {c.total}
                      </span>
                    </div>
                    <ProgressBar value={c.completed} max={c.total} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily limit usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading || !stats ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : stats.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                stats.accounts.map((acc) => (
                  <div key={acc.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-medium">
                        {acc.label}
                      </span>
                      <StatusBadge status={acc.status} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Connects</span>
                        <span>
                          {acc.dailyConnectCount} /{" "}
                          {stats.limits.connectionsPerDay}
                        </span>
                      </div>
                      <ProgressBar
                        value={acc.dailyConnectCount}
                        max={stats.limits.connectionsPerDay}
                        className="h-1.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Messages</span>
                        <span>
                          {acc.dailyMessageCount} / {stats.limits.messagesPerDay}
                        </span>
                      </div>
                      <ProgressBar
                        value={acc.dailyMessageCount}
                        max={stats.limits.messagesPerDay}
                        className="h-1.5"
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
