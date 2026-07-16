"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApi } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

interface Settings {
  id: string;
  connectionsPerDay: number;
  messagesPerDay: number;
  delayMinMs: number;
  delayMaxMs: number;
  profileDelayMinMs: number;
  profileDelayMaxMs: number;
  headless: boolean;
  defaultProxy: string | null;
  tosAccepted: boolean;
}

interface SettingsForm {
  connectionsPerDay: string;
  messagesPerDay: string;
  delayMinMs: string;
  delayMaxMs: string;
  profileDelayMinMs: string;
  profileDelayMaxMs: string;
  headless: boolean;
  defaultProxy: string;
}

function toForm(s: Settings): SettingsForm {
  return {
    connectionsPerDay: String(s.connectionsPerDay),
    messagesPerDay: String(s.messagesPerDay),
    delayMinMs: String(s.delayMinMs),
    delayMaxMs: String(s.delayMaxMs),
    profileDelayMinMs: String(s.profileDelayMinMs),
    profileDelayMaxMs: String(s.profileDelayMaxMs),
    headless: s.headless,
    defaultProxy: s.defaultProxy ?? "",
  };
}

export default function SettingsPage() {
  const { data, loading, refresh } = useApi<Settings>("/api/settings");
  const { toast } = useToast();

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  function update<K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ): void {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function parseNumber(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  async function handleSave(): Promise<void> {
    if (!form) return;

    const payload = {
      connectionsPerDay: parseNumber(form.connectionsPerDay),
      messagesPerDay: parseNumber(form.messagesPerDay),
      delayMinMs: parseNumber(form.delayMinMs),
      delayMaxMs: parseNumber(form.delayMaxMs),
      profileDelayMinMs: parseNumber(form.profileDelayMinMs),
      profileDelayMaxMs: parseNumber(form.profileDelayMaxMs),
      headless: form.headless,
      defaultProxy: form.defaultProxy.trim() || null,
    };

    if (payload.delayMinMs > payload.delayMaxMs) {
      toast({
        title: "Invalid delays",
        description: "Min delay must be less than or equal to max delay.",
        variant: "destructive",
      });
      return;
    }
    if (payload.profileDelayMinMs > payload.profileDelayMaxMs) {
      toast({
        title: "Invalid profile delays",
        description:
          "Profile min delay must be less than or equal to max delay.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await apiFetch<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast({ title: "Settings saved" });
      refresh();
    } catch (e) {
      toast({
        title: "Could not save settings",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadBackup(): void {
    window.location.href = "/api/settings/backup";
  }

  async function handleRestore(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await apiFetch<{ ok: boolean; note: string }>(
        "/api/settings/backup",
        { method: "POST", body },
      );
      toast({ title: "Backup restored", description: result.note });
      refresh();
    } catch (err) {
      toast({
        title: "Could not restore backup",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading || !form) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure rate limits, delays, browser behaviour and backups."
      >
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      </PageHeader>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Daily limits</CardTitle>
            <CardDescription>
              Caps applied per account each day to stay within safe bounds.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="connectionsPerDay">Connections per day</Label>
              <Input
                id="connectionsPerDay"
                type="number"
                min={0}
                value={form.connectionsPerDay}
                onChange={(e) =>
                  update("connectionsPerDay", e.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="messagesPerDay">Messages per day</Label>
              <Input
                id="messagesPerDay"
                type="number"
                min={0}
                value={form.messagesPerDay}
                onChange={(e) => update("messagesPerDay", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delays (ms)</CardTitle>
            <CardDescription>
              A random delay between the min and max is used to mimic human
              behaviour.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="delayMinMs">Action delay min</Label>
              <Input
                id="delayMinMs"
                type="number"
                min={0}
                value={form.delayMinMs}
                onChange={(e) => update("delayMinMs", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Minimum pause between actions.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="delayMaxMs">Action delay max</Label>
              <Input
                id="delayMaxMs"
                type="number"
                min={0}
                value={form.delayMaxMs}
                onChange={(e) => update("delayMaxMs", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum pause between actions.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profileDelayMinMs">Profile delay min</Label>
              <Input
                id="profileDelayMinMs"
                type="number"
                min={0}
                value={form.profileDelayMinMs}
                onChange={(e) =>
                  update("profileDelayMinMs", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Minimum dwell time on a profile.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profileDelayMaxMs">Profile delay max</Label>
              <Input
                id="profileDelayMaxMs"
                type="number"
                min={0}
                value={form.profileDelayMaxMs}
                onChange={(e) =>
                  update("profileDelayMaxMs", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Maximum dwell time on a profile.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Browser</CardTitle>
            <CardDescription>
              Control how the automation browser runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-1">
                <Label htmlFor="headless">Headless mode</Label>
                <p className="text-xs text-muted-foreground">
                  Run the browser without a visible window.
                </p>
              </div>
              <Switch
                id="headless"
                checked={form.headless}
                onCheckedChange={(checked) => update("headless", checked)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="defaultProxy">Default proxy</Label>
              <Input
                id="defaultProxy"
                placeholder="http://user:pass@host:port"
                value={form.defaultProxy}
                onChange={(e) => update("defaultProxy", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used for accounts without their own proxy.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
            <CardDescription>
              Download a backup of the database or restore from a backup file.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={handleDownloadBackup}>
              <Download className="mr-2 h-4 w-4" />
              Download backup
            </Button>
            <Button
              variant="outline"
              disabled={restoring}
              onClick={() => fileInputRef.current?.click()}
            >
              {restoring ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Restore backup
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleRestore}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
