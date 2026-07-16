"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Send, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { apiFetch, useApi } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

interface AccountOption {
  id: string;
  label: string;
  status: string;
}

interface ConnectionLead {
  id: string;
  fullName: string;
  headline: string | null;
  profileUrl: string;
  status: string;
  connectedAt: string | null;
}

interface ConnectionsResponse {
  total: number;
  matching: number;
  since: string | null;
  leads: ConnectionLead[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

const DEFAULT_BODY =
  "Hi {{firstName}}, great to be connected! I wanted to reach out and say hello.";

export default function ConnectionsPage() {
  const { toast } = useToast();
  const { data: accountsData } = useApi<AccountOption[]>("/api/accounts");
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);

  const [accountId, setAccountId] = useState<string>("");
  const [month, setMonth] = useState<string>(String(new Date().getMonth())); // 0-based
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [limit, setLimit] = useState<string>("50"); // "50" | "100" | "all"
  const [body, setBody] = useState<string>(DEFAULT_BODY);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);

  // First day of the selected month, in UTC — "connected since <month>".
  const sinceIso = useMemo(
    () => new Date(Date.UTC(Number(year), Number(month), 1)).toISOString(),
    [year, month],
  );

  const {
    data: conn,
    loading,
    refresh,
  } = useApi<ConnectionsResponse>(`/api/connections?since=${encodeURIComponent(sinceIso)}`);

  const effectiveAccountId = accountId || accounts[0]?.id || "";
  const hasAccounts = accounts.length > 0;
  const matching = conn?.matching ?? 0;
  const limitNum = limit === "all" ? null : Number(limit);
  const willSend = limitNum === null ? matching : Math.min(matching, limitNum);
  const sinceLabel = `${MONTHS[Number(month)]} ${year}`;

  async function handleSync(): Promise<void> {
    if (!effectiveAccountId) {
      toast({ title: "Select an account first", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      await apiFetch<{ ok: boolean; jobId: string }>("/api/connections/sync", {
        method: "POST",
        body: JSON.stringify({ accountId: effectiveAccountId, since: sinceIso }),
      });
      toast({
        title: "Sync queued",
        description: "Scraping your connections in the background. Refresh in a minute to see them.",
      });
    } catch (e) {
      toast({
        title: "Could not start sync",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSend(): Promise<void> {
    if (!effectiveAccountId) {
      toast({ title: "Select an account first", variant: "destructive" });
      return;
    }
    if (!body.trim()) {
      toast({ title: "Write a message first", variant: "destructive" });
      return;
    }
    if (willSend === 0) {
      toast({
        title: "No connections to message",
        description: `No unmessaged connections found since ${sinceLabel}. Sync connections first.`,
        variant: "destructive",
      });
      return;
    }
    if (
      !window.confirm(
        `Message ${willSend} connection(s) added since ${sinceLabel}? Sending is paced and respects your daily message limit.`,
      )
    ) {
      return;
    }
    setSending(true);
    try {
      await apiFetch<{ ok: boolean; jobId: string }>("/api/connections/message", {
        method: "POST",
        body: JSON.stringify({
          accountId: effectiveAccountId,
          since: sinceIso,
          limit: limitNum,
          body: body.trim(),
        }),
      });
      toast({
        title: "Messaging queued",
        description: `Messaging up to ${willSend} connection(s). Watch progress in Activity.`,
      });
    } catch (e) {
      toast({
        title: "Could not queue messages",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Connections"
        description="Sync your existing LinkedIn connections and message the ones you connected with recently."
      >
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Message connections</CardTitle>
            <CardDescription>
              {hasAccounts
                ? "Pick a month, and message connections added since then."
                : "Add an account before syncing connections."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="conn-account">Account</Label>
              <Select value={effectiveAccountId} onValueChange={setAccountId}>
                <SelectTrigger id="conn-account">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="conn-month">Connected since</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger id="conn-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="conn-year">Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger id="conn-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="conn-limit">How many</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="conn-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">First 50</SelectItem>
                  <SelectItem value="100">First 100</SelectItem>
                  <SelectItem value="all">All matching</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="conn-body">Message</Label>
              <Textarea
                id="conn-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tokens: {"{{firstName}}"}, {"{{lastName}}"}, {"{{fullName}}"},{" "}
                {"{{company}}"}, {"{{title}}"}. Empty values fall back to
                &ldquo;there&rdquo;.
              </p>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              {loading ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <p>
                  <span className="font-medium">{matching}</span> unmessaged
                  connection(s) since <span className="font-medium">{sinceLabel}</span>.
                  {" "}This run will message{" "}
                  <span className="font-medium">{willSend}</span>.
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {conn?.total ?? 0} connection(s) synced in total.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleSync()}
              disabled={!hasAccounts || syncing}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              Sync connections
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={!hasAccounts || sending || willSend === 0}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Message {willSend > 0 ? willSend : ""}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Synced connections</CardTitle>
            <CardDescription>
              Newest first. Connection dates are approximate (from LinkedIn&apos;s
              &ldquo;connected X ago&rdquo; labels).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Headline</TableHead>
                  <TableHead>Connected</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (conn?.leads.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center">
                      <p className="text-sm text-muted-foreground">
                        No connections synced yet. Click &ldquo;Sync
                        connections&rdquo; to pull them from LinkedIn.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  conn!.leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        <a
                          href={lead.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {lead.fullName}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {lead.headline ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.connectedAt
                          ? formatRelativeTime(lead.connectedAt)
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
