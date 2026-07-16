"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ExternalLink,
  Trash2,
} from "lucide-react";

import { apiFetch, useApi } from "@/lib/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { LeadStatus } from "@/types";
import { useToast } from "@/components/ui/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LeadSearchRef {
  id: string;
  name: string;
}

interface Lead {
  id: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  profileUrl: string;
  location: string | null;
  company: string | null;
  title: string | null;
  connectionDegree: string | null;
  status: LeadStatus;
  notes: string | null;
  importedAt: string;
  searchId: string | null;
  search: LeadSearchRef | null;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

interface SearchSummary {
  id: string;
  name: string;
  _count: { leads: number };
}

type SortField = "importedAt" | "fullName" | "company" | "status";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS: LeadStatus[] = [
  "new",
  "queued",
  "connected",
  "messaged",
  "replied",
  "skipped",
];

const PAGE_SIZE = 50;

export function LeadTable({ className }: { className?: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [rawQuery, setRawQuery] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<string>("all");
  const [searchId, setSearchId] = useState<string>("all");
  const [sort, setSort] = useState<SortField>("importedAt");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [mutating, setMutating] = useState<boolean>(false);

  // Debounce the search input (~300ms).
  useEffect(() => {
    const handle = setTimeout(() => setQuery(rawQuery), 300);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  // Reset to first page whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [query, status, searchId, sort, dir]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({
      status,
      searchId,
      sort,
      dir,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (query) params.set("q", query);
    return `/api/leads?${params.toString()}`;
  }, [status, searchId, sort, dir, page, query]);

  const { data, loading, error, refresh } = useApi<LeadsResponse>(listUrl);
  const { data: searches } = useApi<SearchSummary[]>("/api/searches");

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Drop selections that are no longer on the current page.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(leads.map((l) => l.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [leads]);

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const someSelected = selected.size > 0;

  function toggleSort(field: SortField): void {
    if (sort === field) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir("asc");
    }
  }

  function toggleAll(checked: boolean): void {
    setSelected(checked ? new Set(leads.map((l) => l.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectedIds(): string[] {
    return Array.from(selected);
  }

  async function bulkSetStatus(value: string): Promise<void> {
    const ids = selectedIds();
    if (ids.length === 0) return;
    setMutating(true);
    try {
      const result = await apiFetch<{ ok: boolean; count: number }>(
        "/api/leads",
        {
          method: "PATCH",
          body: JSON.stringify({ ids, status: value as LeadStatus }),
        },
      );
      toast({ title: `Updated ${result.count} lead${result.count === 1 ? "" : "s"}` });
      setSelected(new Set());
      refresh();
    } catch (e: unknown) {
      toast({
        title: "Could not update leads",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setMutating(false);
    }
  }

  async function bulkDelete(): Promise<void> {
    const ids = selectedIds();
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setMutating(true);
    try {
      const result = await apiFetch<{ ok: boolean; count: number }>(
        "/api/leads",
        {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        },
      );
      toast({ title: `Deleted ${result.count} lead${result.count === 1 ? "" : "s"}` });
      setSelected(new Set());
      refresh();
    } catch (e: unknown) {
      toast({
        title: "Could not delete leads",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setMutating(false);
    }
  }

  function addToCampaign(): void {
    const ids = selectedIds();
    if (ids.length === 0) return;
    router.push(`/campaigns/new?leadIds=${ids.join(",")}`);
  }

  function SortHeader({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }): JSX.Element {
    const active = sort === field;
    const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Search name, company, title..."
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchId} onValueChange={setSearchId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {(searches ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <Separator orientation="vertical" className="h-5" />
          <Button
            variant="outline"
            size="sm"
            onClick={addToCampaign}
            disabled={mutating}
          >
            Add to campaign
          </Button>
          <Select
            onValueChange={(value) => void bulkSetStatus(value)}
            disabled={mutating}
          >
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Set status..." />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => void bulkDelete()}
            disabled={mutating}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => toggleAll(c === true)}
                  aria-label="Select all"
                  disabled={leads.length === 0}
                />
              </TableHead>
              <TableHead>
                <SortHeader field="fullName">Name</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="company">Company</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="status">Status</SortHeader>
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">
                <SortHeader field="importedAt">Imported</SortHeader>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No leads match your filters.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer"
                  onClick={() => setDetailLead(lead)}
                  data-state={selected.has(lead.id) ? "selected" : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(lead.id)}
                      onCheckedChange={(c) => toggleOne(lead.id, c === true)}
                      aria-label={`Select ${lead.fullName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{lead.fullName}</div>
                    {lead.headline && (
                      <div className="truncate text-xs text-muted-foreground">
                        {lead.headline}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{lead.company ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.search ? lead.search.name : lead.searchId ? "—" : "Import"}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatRelativeTime(lead.importedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "No results"
            : `Page ${data?.page ?? page} of ${totalPages} · ${total} total`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={detailLead !== null} onOpenChange={(open) => !open && setDetailLead(null)}>
        <DialogContent className="max-w-lg">
          {detailLead && (
            <>
              <DialogHeader>
                <DialogTitle>{detailLead.fullName}</DialogTitle>
                {detailLead.headline && (
                  <DialogDescription>{detailLead.headline}</DialogDescription>
                )}
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={detailLead.status} />
                  {detailLead.connectionDegree && (
                    <span className="text-xs text-muted-foreground">
                      {detailLead.connectionDegree} connection
                    </span>
                  )}
                </div>
                <Separator />
                <DetailRow label="Company" value={detailLead.company} />
                <DetailRow label="Title" value={detailLead.title} />
                <DetailRow label="Location" value={detailLead.location} />
                <DetailRow
                  label="Source"
                  value={
                    detailLead.search
                      ? detailLead.search.name
                      : detailLead.searchId
                        ? null
                        : "CSV import"
                  }
                />
                <DetailRow
                  label="Imported"
                  value={formatRelativeTime(detailLead.importedAt)}
                />
                <div>
                  <Label className="text-xs text-muted-foreground">Profile</Label>
                  <a
                    href={detailLead.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 flex items-center gap-1 break-all text-primary hover:underline"
                  >
                    {detailLead.profileUrl}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </div>
                {detailLead.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <p className="mt-0.5 whitespace-pre-wrap">{detailLead.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}): JSX.Element {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}
