"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { useApi } from "@/lib/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ActivityFeed } from "@/components/activity-feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AccountOption {
  id: string;
  label: string;
  status: string;
}

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

const ACTIVITY_TYPES = [
  "login",
  "search",
  "connect_sent",
  "message_sent",
  "error",
  "captcha",
  "info",
] as const;

const ROW_ACCENT: Record<string, string> = {
  error: "text-red-600",
  captcha: "text-yellow-600",
  connect_sent: "text-green-600",
  message_sent: "text-green-600",
  login: "text-blue-600",
  search: "text-blue-600",
  info: "text-slate-500",
};

export default function ActivityPage() {
  const [account, setAccount] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data: accounts } = useApi<AccountOption[]>("/api/accounts");

  const tableUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (account !== "all") params.set("accountId", account);
    if (type !== "all") params.set("type", type);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    return `/api/activity?${params.toString()}`;
  }, [account, type, from, to]);

  const { data: rows, loading } = useApi<ApiActivity[]>(tableUrl);

  function handleExport(): void {
    const params = new URLSearchParams();
    if (account !== "all") params.set("accountId", account);
    if (type !== "all") params.set("type", type);
    window.location.href = `/api/activity/export?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader title="Activity" description="Live and historical event log.">
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger>
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="activity-from">
              From
            </Label>
            <Input
              id="activity-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="activity-to">
              To
            </Label>
            <Input
              id="activity-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Events</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No matching activity.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[140px]">Account</TableHead>
                    <TableHead className="w-[110px] text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell
                        className={cn(
                          "font-medium capitalize",
                          ROW_ACCENT[row.type] ?? "text-slate-500",
                        )}
                      >
                        {row.type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="max-w-0 truncate">
                        {row.message}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.account?.label ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live feed</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed
              key={account}
              accountId={account === "all" ? undefined : account}
              limit={100}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
