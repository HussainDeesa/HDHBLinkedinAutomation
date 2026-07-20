"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Send, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

const CUSTOM = "custom";
const DEFAULT_BODY =
  "Hi {{firstName}}, great to be connected! I wanted to reach out and say hello.";

export default function ConnectionsPage() {
  const { toast } = useToast();
  const { data: accountsData } = useApi<AccountOption[]>("/api/accounts");
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);
  const { data: templatesData } = useApi<MessageTemplate[]>("/api/templates?type=message");
  const templates = useMemo(() => templatesData ?? [], [templatesData]);

  const [accountId, setAccountId] = useState<string>("");
  const [month, setMonth] = useState<string>(String(new Date().getMonth())); // 0-based
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [limit, setLimit] = useState<string>("50"); // "50" | "100" | "all"
  const [templateId, setTemplateId] = useState<string>(CUSTOM);
  const [body, setBody] = useState<string>(DEFAULT_BODY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
  } = useApi<ConnectionsResponse>(
    `/api/connections?since=${encodeURIComponent(sinceIso)}&pageSize=200`,
  );

  const leads = useMemo(() => conn?.leads ?? [], [conn]);
  const effectiveAccountId = accountId || accounts[0]?.id || "";
  const hasAccounts = accounts.length > 0;
  const matching = conn?.matching ?? 0;
  const limitNum = limit === "all" ? null : Number(limit);
  const sinceLabel = `${MONTHS[Number(month)]} ${year}`;

  // Selection overrides the since-filter: if any rows are checked we message
  // exactly those; otherwise we message all matching since the chosen month.
  const selectedCount = selected.size;
  const willSendAll = limitNum === null ? matching : Math.min(matching, limitNum);
  const sendCount = selectedCount > 0 ? selectedCount : willSendAll;

  const allVisibleSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected((prev) =>
      leads.length > 0 && leads.every((l) => prev.has(l.id))
        ? new Set()
        : new Set(leads.map((l) => l.id)),
    );
  }

  function handleTemplate(value: string): void {
    setTemplateId(value);
    if (value !== CUSTOM) {
      const tpl = templates.find((t) => t.id === value);
      if (tpl) setBody(tpl.body);
    }
  }

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
    const useSelection = selectedCount > 0;
    const count = useSelection ? selectedCount : willSendAll;
    if (count === 0) {
      toast({
        title: "No connections to message",
        description: useSelection
          ? "Select at least one connection."
          : `No connections found since ${sinceLabel}. Sync connections first.`,
        variant: "destructive",
      });
      return;
    }
    const who = useSelection
      ? `${count} selected connection(s)`
      : `${count} connection(s) added since ${sinceLabel}`;
    if (
      !window.confirm(
        `Message ${who}? Sending is paced and respects your daily message limit.`,
      )
    ) {
      return;
    }
    setSending(true);
    try {
      const payload = useSelection
        ? { accountId: effectiveAccountId, leadIds: [...selected], body: body.trim() }
        : {
            accountId: effectiveAccountId,
            since: sinceIso,
            limit: limitNum,
            body: body.trim(),
          };
      await apiFetch<{ ok: boolean; jobId: string }>("/api/connections/message", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({
        title: "Messaging queued",
        description: `Messaging ${who}. Watch progress in Activity.`,
      });
      setSelected(new Set());
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
        description="Sync your existing LinkedIn connections and message specific ones or everyone connected since a chosen month."
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
                ? "Check specific connections on the right, or message everyone since a month."
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

            <fieldset
              className="grid gap-4 rounded-md border p-3 disabled:opacity-50"
              disabled={selectedCount > 0}
            >
              <legend className="px-1 text-xs text-muted-foreground">
                {selectedCount > 0
                  ? `Using ${selectedCount} selected — clear checkboxes to use these filters`
                  : "Or message everyone since:"}
              </legend>
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
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor="conn-template">Template</Label>
              <Select value={templateId} onValueChange={handleTemplate}>
                <SelectTrigger id="conn-template">
                  <SelectValue placeholder="Custom message" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOM}>Custom message</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="conn-body">Message</Label>
              <Textarea
                id="conn-body"
                rows={5}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (templateId !== CUSTOM) setTemplateId(CUSTOM);
                }}
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
              ) : selectedCount > 0 ? (
                <p>
                  Messaging <span className="font-medium">{selectedCount}</span>{" "}
                  selected connection(s).
                </p>
              ) : (
                <p>
                  <span className="font-medium">{matching}</span> connection(s)
                  since <span className="font-medium">{sinceLabel}</span>. This run
                  will message <span className="font-medium">{willSendAll}</span>.
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
              disabled={!hasAccounts || sending || sendCount === 0}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {selectedCount > 0
                ? `Message ${selectedCount} selected`
                : `Message ${sendCount > 0 ? sendCount : ""}`}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Synced connections</CardTitle>
            <CardDescription>
              Check rows to message specific people. Newest first; dates are
              approximate (from LinkedIn&apos;s &ldquo;connected X ago&rdquo; labels).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                      disabled={leads.length === 0}
                    />
                  </TableHead>
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
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <p className="text-sm text-muted-foreground">
                        No connections synced yet. Click &ldquo;Sync
                        connections&rdquo; to pull them from LinkedIn.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead) => (
                    <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(lead.id)}
                          onCheckedChange={() => toggleOne(lead.id)}
                          aria-label={`Select ${lead.fullName}`}
                        />
                      </TableCell>
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
