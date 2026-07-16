"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  UserPlus,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CampaignBuilder } from "@/components/campaign-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { CampaignStep, TemplateType } from "@/types";

interface Account {
  id: string;
  label: string;
  status: string;
}

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  body: string;
}

interface SavedSearch {
  id: string;
  name: string;
  _count: { leads: number };
}

interface Lead {
  id: string;
  fullName: string;
  company: string | null;
  headline: string | null;
  status: string;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
}

interface CreatedCampaign {
  id: string;
}

type LeadSource = "search" | "leads";

const STEP_LABELS = [
  "Details",
  "Sequence",
  "Templates",
  "Leads",
  "Review",
] as const;

const TOTAL_STEPS = STEP_LABELS.length;

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Step 2
  const [steps, setSteps] = useState<CampaignStep[]>([
    { type: "connect", templateId: null, delayDays: 0 },
  ]);

  // Templates (for review on step 3)
  const [templates, setTemplates] = useState<Template[]>([]);

  // Step 4
  const [leadSource, setLeadSource] = useState<LeadSource>("leads");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [searchId, setSearchId] = useState<string>("");
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    new Set(),
  );

  // Load reference data once.
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [acc, srch, conn, msg, leads] = await Promise.all([
          apiFetch<Account[]>("/api/accounts"),
          apiFetch<SavedSearch[]>("/api/searches"),
          apiFetch<Template[]>("/api/templates?type=connection_note"),
          apiFetch<Template[]>("/api/templates?type=message"),
          apiFetch<LeadsResponse>("/api/leads?status=all&pageSize=200"),
        ]);
        if (cancelled) return;
        setAccounts(acc);
        setSearches(srch);
        setTemplates([...conn, ...msg]);
        setAllLeads(leads.leads);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load campaign data",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Preselect leadIds from the query string.
  useEffect(() => {
    const raw = searchParams.get("leadIds");
    if (!raw) return;
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      setSelectedLeadIds(new Set(ids));
      setLeadSource("leads");
    }
  }, [searchParams]);

  const templateName = useMemo(() => {
    const map = new Map<string, string>();
    for (const tpl of templates) map.set(tpl.id, tpl.name);
    return map;
  }, [templates]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  const leadCount =
    leadSource === "search"
      ? searches.find((s) => s.id === searchId)?._count.leads ?? 0
      : selectedLeadIds.size;

  function toggleLead(id: string, checked: boolean): void {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function validateStep(current: number): string | null {
    if (current === 1) {
      if (!name.trim()) return "Please enter a campaign name.";
      if (!accountId) return "Please select an account.";
    }
    if (current === 2) {
      if (steps.length === 0) return "Add at least one step to the sequence.";
    }
    if (current === 4) {
      if (leadSource === "search" && !searchId)
        return "Select a saved search or switch to picking leads.";
      if (leadSource === "leads" && selectedLeadIds.size === 0)
        return "Select at least one lead.";
    }
    return null;
  }

  function goNext(): void {
    const err = validateStep(step);
    if (err) {
      toast({ title: "Check this step", description: err, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function goBack(): void {
    setStep((s) => Math.max(1, s - 1));
  }

  async function create(start: boolean): Promise<void> {
    // Validate all the gating steps before submitting.
    for (const s of [1, 2, 4]) {
      const err = validateStep(s);
      if (err) {
        toast({ title: "Check your campaign", description: err, variant: "destructive" });
        setStep(s);
        return;
      }
    }
    setSubmitting(true);
    try {
      const body: {
        name: string;
        accountId: string;
        steps: CampaignStep[];
        leadIds?: string[];
        searchId?: string;
      } = {
        name: name.trim(),
        accountId,
        steps,
      };
      if (leadSource === "search") body.searchId = searchId;
      else body.leadIds = Array.from(selectedLeadIds);

      const created = await apiFetch<CreatedCampaign>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (start) {
        await apiFetch<{ ok: boolean }>(`/api/campaigns/${created.id}/start`, {
          method: "POST",
        });
        toast({ title: "Campaign created and started" });
      } else {
        toast({ title: "Campaign saved as draft" });
      }
      router.push(`/campaigns/${created.id}`);
    } catch (e) {
      toast({
        title: start ? "Could not start campaign" : "Could not save campaign",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New Campaign"
        description="Build an outreach sequence and attach leads."
      >
        <Button variant="outline" onClick={() => router.push("/campaigns")}>
          Cancel
        </Button>
      </PageHeader>

      {/* Progress header */}
      <div className="mb-6 flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary bg-primary/10 text-primary",
                  !active && !done && "text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </div>
              <span
                className={cn(
                  "hidden text-xs sm:inline",
                  active ? "font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {n < TOTAL_STEPS && (
                <div className="h-px flex-1 bg-border" aria-hidden />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Step 1: Details */}
          {step === 1 && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="campaign-name">Campaign name</Label>
                <Input
                  id="campaign-name"
                  placeholder="e.g. Q3 Founders Outreach"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-account">Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="campaign-account">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Sequence */}
          {step === 2 && (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">
                Build the order of actions. Pick templates per step and the
                wait time before each runs.
              </p>
              <CampaignBuilder steps={steps} onChange={setSteps} />
            </div>
          )}

          {/* Step 3: Templates review */}
          {step === 3 && (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">
                Review which template each step will use.
              </p>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {i + 1}
                      </span>
                      {s.type === "connect" ? (
                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {s.type === "connect" ? "Connect" : "Message"}
                      </span>
                      <span className="text-muted-foreground">
                        · wait {s.delayDays}d
                      </span>
                    </div>
                    <span
                      className={cn(
                        s.templateId
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {s.templateId
                        ? templateName.get(s.templateId) ?? "Template"
                        : "No template"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Leads */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={leadSource === "leads" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLeadSource("leads")}
                >
                  Pick leads
                </Button>
                <Button
                  type="button"
                  variant={leadSource === "search" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLeadSource("search")}
                >
                  From a saved search
                </Button>
              </div>

              {leadSource === "search" ? (
                <div className="grid gap-2">
                  <Label htmlFor="lead-search">Saved search</Label>
                  <Select value={searchId} onValueChange={setSearchId}>
                    <SelectTrigger id="lead-search">
                      <SelectValue placeholder="Select a saved search" />
                    </SelectTrigger>
                    <SelectContent>
                      {searches.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s._count.leads})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {selectedLeadIds.size} selected
                  </p>
                  <div className="max-h-80 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allLeads.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="h-24 text-center text-sm text-muted-foreground"
                            >
                              No leads available.
                            </TableCell>
                          </TableRow>
                        ) : (
                          allLeads.map((lead) => (
                            <TableRow key={lead.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedLeadIds.has(lead.id)}
                                  onCheckedChange={(checked) =>
                                    toggleLead(lead.id, checked === true)
                                  }
                                  aria-label={`Select ${lead.fullName}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {lead.fullName}
                                </div>
                                {lead.headline && (
                                  <div className="text-xs text-muted-foreground">
                                    {lead.headline}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {lead.company ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {lead.status}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="grid gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">
                    {selectedAccount?.label ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Leads</span>
                  <span className="font-medium">{leadCount}</span>
                </div>
              </div>

              <Separator />

              <div>
                <p className="mb-2 text-sm font-medium">Sequence</p>
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs">
                        {i + 1}
                      </span>
                      {s.type === "connect" ? "Connect" : "Message"}
                      {" · wait "}
                      {s.delayDays}d ·{" "}
                      {s.templateId
                        ? templateName.get(s.templateId) ?? "Template"
                        : "No template"}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="outline" onClick={goBack} disabled={step === 1}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {step < TOTAL_STEPS ? (
          <Button onClick={goNext}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => create(false)}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create as draft
            </Button>
            <Button onClick={() => create(true)} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create &amp; Start
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
