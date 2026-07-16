"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CampaignBuilder } from "@/components/campaign-builder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApi } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type {
  CampaignLeadStatus,
  CampaignStatus,
  CampaignStep,
} from "@/types";

interface CampaignLead {
  id: string;
  currentStep: number;
  status: CampaignLeadStatus;
  lastError: string | null;
  lastActionAt: string | null;
  nextActionAt: string | null;
  lead: {
    id: string;
    fullName: string;
    headline: string | null;
    company: string | null;
    profileUrl: string;
    status: string;
  };
}

interface CampaignDetail {
  id: string;
  name: string;
  status: CampaignStatus;
  accountId: string;
  stepsJson: string;
  createdAt: string;
  startedAt: string | null;
  account: { id: string; label: string; status: string };
  campaignLeads: CampaignLead[];
  counts: Record<string, number>;
}

function parseSteps(stepsJson: string): CampaignStep[] {
  try {
    const parsed: unknown = JSON.parse(stepsJson);
    if (Array.isArray(parsed)) return parsed as CampaignStep[];
    return [];
  } catch {
    return [];
  }
}

const STAT_KEYS: { key: string; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { toast } = useToast();

  const { data, loading, error, refresh } = useApi<CampaignDetail>(
    id ? `/api/campaigns/${id}` : null,
  );

  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [savingSteps, setSavingSteps] = useState(false);

  // Sync the editable sequence whenever fresh data arrives.
  useEffect(() => {
    if (data) setSteps(parseSteps(data.stepsJson));
  }, [data]);

  async function handleToggleRun(): Promise<void> {
    if (!data) return;
    setBusy(true);
    try {
      if (data.status === "running") {
        await apiFetch<{ ok: boolean; status: string }>(
          `/api/campaigns/${data.id}/pause`,
          { method: "POST" },
        );
        toast({ title: "Campaign paused" });
      } else if (data.status === "paused") {
        await apiFetch<{ ok: boolean; status: string }>(
          `/api/campaigns/${data.id}/pause`,
          { method: "POST" },
        );
        toast({ title: "Campaign resumed" });
      } else {
        await apiFetch<{ ok: boolean }>(`/api/campaigns/${data.id}/start`, {
          method: "POST",
        });
        toast({ title: "Campaign started" });
      }
      refresh();
    } catch (e) {
      toast({
        title: "Could not update campaign",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSteps(): Promise<void> {
    if (!data) return;
    setSavingSteps(true);
    try {
      await apiFetch<CampaignDetail>(`/api/campaigns/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ steps }),
      });
      toast({ title: "Sequence saved" });
      refresh();
    } catch (e) {
      toast({
        title: "Could not save sequence",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingSteps(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!data) return;
    if (
      !window.confirm(
        `Delete campaign "${data.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch<{ ok: boolean }>(`/api/campaigns/${data.id}`, {
        method: "DELETE",
      });
      toast({ title: "Campaign deleted" });
      router.push("/campaigns");
    } catch (e) {
      toast({
        title: "Could not delete campaign",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Campaign" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error ?? "Campaign not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const campaign = data;
  const editable =
    campaign.status === "draft" || campaign.status === "paused";
  const totalLeads = campaign.campaignLeads.length;
  const isRunning = campaign.status === "running";

  return (
    <div>
      <PageHeader title={campaign.name}>
        <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={handleToggleRun} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : isRunning ? (
            <Pause className="mr-2 h-4 w-4" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {isRunning
            ? "Pause"
            : campaign.status === "paused"
              ? "Resume"
              : "Start"}
        </Button>
      </PageHeader>

      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{campaign.account.label}</span>
        <span aria-hidden>·</span>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {STAT_KEYS.map(({ key, label }) => (
          <Card key={key}>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">
                {campaign.counts[key] ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-semibold">{totalLeads}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
      </div>

      {/* Sequence */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sequence</CardTitle>
          <CardDescription>
            {editable
              ? "Edit the steps, then save your changes."
              : "Sequence is read-only while the campaign is running or completed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {editable ? (
            <CampaignBuilder steps={steps} onChange={setSteps} />
          ) : (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md border p-3 text-sm"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs">
                    {i + 1}
                  </span>
                  <span className="font-medium">
                    {s.type === "connect" ? "Connect" : "Message"}
                  </span>
                  <span className="text-muted-foreground">
                    · wait {s.delayDays}d
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
        {editable && (
          <CardFooter>
            <Button
              onClick={handleSaveSteps}
              disabled={savingSteps || steps.length === 0}
            >
              {savingSteps ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save sequence
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Leads */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Leads</CardTitle>
          <CardDescription>
            {totalLeads} lead{totalLeads === 1 ? "" : "s"} in this campaign.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Profile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalLeads === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No leads attached yet.
                  </TableCell>
                </TableRow>
              ) : (
                campaign.campaignLeads.map((cl) => (
                  <TableRow key={cl.id}>
                    <TableCell>
                      <div className="font-medium">{cl.lead.fullName}</div>
                      {cl.lead.company && (
                        <div className="text-xs text-muted-foreground">
                          {cl.lead.company}
                        </div>
                      )}
                      {cl.lastError && (
                        <div className="text-xs text-red-600">
                          {cl.lastError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      Step {cl.currentStep + 1}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={cl.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cl.nextActionAt
                        ? formatRelativeTime(cl.nextActionAt)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <a
                        href={cl.lead.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
          <CardDescription>
            Deleting a campaign removes it and its lead progress permanently.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete campaign
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
