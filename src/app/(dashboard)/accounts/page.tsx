"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApi } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

interface AccountActivity {
  createdAt: string;
  type: string;
  message: string;
}

interface Account {
  id: string;
  label: string;
  email: string;
  status: string;
  dailyConnectCount: number;
  dailyMessageCount: number;
  lastResetAt: string;
  timezone: string;
  proxy: string | null;
  createdAt: string;
  _count: { campaigns: number };
  activities: AccountActivity[];
}

const TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
  "UTC",
] as const;

interface NewAccountForm {
  label: string;
  email: string;
  password: string;
  proxy: string;
  timezone: string;
}

const EMPTY_FORM: NewAccountForm = {
  label: "",
  email: "",
  password: "",
  proxy: "",
  timezone: "UTC",
};

export default function AccountsPage() {
  const { data, loading, refresh } = useApi<Account[]>("/api/accounts");
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewAccountForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accounts = data ?? [];

  function updateForm<K extends keyof NewAccountForm>(
    key: K,
    value: NewAccountForm[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(): Promise<void> {
    if (!form.label.trim() || !form.email.trim() || !form.password) {
      toast({
        title: "Missing fields",
        description: "Label, email and password are required.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      await apiFetch<Account>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          label: form.label.trim(),
          email: form.email.trim(),
          password: form.password,
          proxy: form.proxy.trim() || undefined,
          timezone: form.timezone,
        }),
      });
      toast({ title: "Account added" });
      setForm(EMPTY_FORM);
      setDialogOpen(false);
      refresh();
    } catch (e) {
      toast({
        title: "Could not add account",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleLogin(account: Account): Promise<void> {
    setBusyId(account.id);
    try {
      await apiFetch<{ ok: boolean; jobId: string }>(
        `/api/accounts/${account.id}/login`,
        { method: "POST" },
      );
      toast({
        title: "Login started",
        description:
          "Complete 2FA in the browser window the worker opened.",
      });
    } catch (e) {
      toast({
        title: "Login failed to start",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleStatus(account: Account): Promise<void> {
    const nextStatus = account.status === "paused" ? "active" : "paused";
    setBusyId(account.id);
    try {
      await apiFetch<Account>(`/api/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast({
        title: nextStatus === "paused" ? "Account paused" : "Account resumed",
      });
      refresh();
    } catch (e) {
      toast({
        title: "Could not update account",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(account: Account): Promise<void> {
    if (
      !window.confirm(
        `Delete account "${account.label}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(account.id);
    try {
      await apiFetch<{ ok: boolean }>(`/api/accounts/${account.id}`, {
        method: "DELETE",
      });
      toast({ title: "Account deleted" });
      refresh();
    } catch (e) {
      toast({
        title: "Could not delete account",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="LinkedIn Accounts"
        description="Manage the LinkedIn accounts your automation runs on."
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add LinkedIn account</DialogTitle>
              <DialogDescription>
                Credentials are used by the worker to sign in. You complete any
                2FA in the browser window it opens.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="account-label">Label</Label>
                <Input
                  id="account-label"
                  placeholder="e.g. Sales – Jane"
                  value={form.label}
                  onChange={(e) => updateForm("label", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-email">Email</Label>
                <Input
                  id="account-email"
                  type="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-password">Password</Label>
                <Input
                  id="account-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-proxy">Proxy (optional)</Label>
                <Input
                  id="account-proxy"
                  placeholder="http://user:pass@host:port"
                  value={form.proxy}
                  onChange={(e) => updateForm("proxy", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-timezone">Timezone</Label>
                <Select
                  value={form.timezone}
                  onValueChange={(v) => updateForm("timezone", v)}
                >
                  <SelectTrigger id="account-timezone">
                    <SelectValue placeholder="Select a timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Today</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>Campaigns</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <p className="text-sm text-muted-foreground">
                      No accounts yet. Click{" "}
                      <span className="font-medium">Add Account</span> to
                      connect your first LinkedIn account.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((account) => {
                  const activity = account.activities[0];
                  const busy = busyId === account.id;
                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="font-medium">{account.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {account.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={account.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {account.dailyConnectCount} conn ·{" "}
                        {account.dailyMessageCount} msg
                      </TableCell>
                      <TableCell className="text-sm">
                        {activity ? (
                          <div>
                            <div>{activity.message}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatRelativeTime(activity.createdAt)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {account._count.campaigns}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleLogin(account)}
                          >
                            Login
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleToggleStatus(account)}
                          >
                            {account.status === "paused" ? "Resume" : "Pause"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleDelete(account)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
