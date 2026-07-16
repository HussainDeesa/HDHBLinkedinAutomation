"use client";

import { useState } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
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
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
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

interface Search {
  id: string;
  name: string;
  keywords: string | null;
  location: string | null;
  industry: string | null;
  currentCompany: string | null;
  pastCompany: string | null;
  title: string | null;
  connectionDegree: string | null;
  maxPages: number;
  lastRunAt: string | null;
  resultCount: number;
  createdAt: string;
  _count: { leads: number };
}

interface AccountOption {
  id: string;
  label: string;
  status: string;
}

type ConnectionDegree = "any" | "1st" | "2nd" | "3rd";

interface SearchForm {
  name: string;
  keywords: string;
  location: string;
  industry: string;
  currentCompany: string;
  pastCompany: string;
  title: string;
  connectionDegree: ConnectionDegree;
  maxPages: string;
}

const EMPTY_FORM: SearchForm = {
  name: "",
  keywords: "",
  location: "",
  industry: "",
  currentCompany: "",
  pastCompany: "",
  title: "",
  connectionDegree: "any",
  maxPages: "5",
};

function summarizeFilters(search: Search): string {
  const parts: string[] = [];
  if (search.keywords) parts.push(search.keywords);
  if (search.title) parts.push(`title: ${search.title}`);
  if (search.location) parts.push(`in ${search.location}`);
  if (search.industry) parts.push(search.industry);
  if (search.currentCompany) parts.push(`@ ${search.currentCompany}`);
  if (search.pastCompany) parts.push(`ex-${search.pastCompany}`);
  if (search.connectionDegree) parts.push(`${search.connectionDegree} degree`);
  return parts.length > 0 ? parts.join(" · ") : "No filters";
}

export default function SearchesPage() {
  const {
    data: searchesData,
    loading,
    refresh,
  } = useApi<Search[]>("/api/searches");
  const { data: accountsData } = useApi<AccountOption[]>("/api/accounts");
  const { toast } = useToast();

  const [form, setForm] = useState<SearchForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState<Search | null>(null);
  const [pickedAccountId, setPickedAccountId] = useState<string>("");

  const searches = searchesData ?? [];
  const accounts = accountsData ?? [];
  const hasAccounts = accounts.length > 0;

  function update<K extends keyof SearchForm>(
    key: K,
    value: SearchForm[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(): Promise<void> {
    if (!form.name.trim()) {
      toast({
        title: "Name required",
        description: "Give the search a name to save it.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await apiFetch<Search>("/api/searches", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          keywords: form.keywords.trim() || undefined,
          location: form.location.trim() || undefined,
          industry: form.industry.trim() || undefined,
          currentCompany: form.currentCompany.trim() || undefined,
          pastCompany: form.pastCompany.trim() || undefined,
          title: form.title.trim() || undefined,
          connectionDegree:
            form.connectionDegree === "any" ? null : form.connectionDegree,
          maxPages: Number(form.maxPages) || 5,
        }),
      });
      toast({ title: "Search saved" });
      setForm(EMPTY_FORM);
      refresh();
    } catch (e) {
      toast({
        title: "Could not save search",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runSearch(
    search: Search,
    accountId: string,
  ): Promise<void> {
    setRunningId(search.id);
    try {
      await apiFetch<{ ok: boolean; jobId: string }>(
        `/api/searches/${search.id}/run`,
        { method: "POST", body: JSON.stringify({ accountId }) },
      );
      toast({
        title: "Search queued",
        description: "Results will appear in Leads.",
      });
    } catch (e) {
      toast({
        title: "Could not run search",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningId(null);
    }
  }

  function handleRunNow(search: Search): void {
    if (!hasAccounts) return;
    if (accounts.length === 1) {
      const first = accounts[0];
      if (first) void runSearch(search, first.id);
      return;
    }
    setPickerSearch(search);
    setPickedAccountId(accounts[0]?.id ?? "");
    setPickerOpen(true);
  }

  function handleConfirmPicker(): void {
    if (!pickerSearch || !pickedAccountId) return;
    const search = pickerSearch;
    const accountId = pickedAccountId;
    setPickerOpen(false);
    setPickerSearch(null);
    void runSearch(search, accountId);
  }

  async function handleDelete(search: Search): Promise<void> {
    if (
      !window.confirm(`Delete search "${search.name}"? This cannot be undone.`)
    ) {
      return;
    }
    setBusyId(search.id);
    try {
      await apiFetch<{ ok: boolean }>(`/api/searches/${search.id}`, {
        method: "DELETE",
      });
      toast({ title: "Search deleted" });
      refresh();
    } catch (e) {
      toast({
        title: "Could not delete search",
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
        title="Searches"
        description="Build LinkedIn searches and run them to collect leads."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Build search</CardTitle>
            <CardDescription>
              Define filters, then save and run it on an account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="search-name">Name</Label>
              <Input
                id="search-name"
                placeholder="e.g. SF founders"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-keywords">Keywords</Label>
              <Input
                id="search-keywords"
                value={form.keywords}
                onChange={(e) => update("keywords", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-location">Location</Label>
              <Input
                id="search-location"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-industry">Industry</Label>
              <Input
                id="search-industry"
                value={form.industry}
                onChange={(e) => update("industry", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-current-company">Current company</Label>
              <Input
                id="search-current-company"
                value={form.currentCompany}
                onChange={(e) => update("currentCompany", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-past-company">Past company</Label>
              <Input
                id="search-past-company"
                value={form.pastCompany}
                onChange={(e) => update("pastCompany", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-title">Title</Label>
              <Input
                id="search-title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-degree">Connection degree</Label>
              <Select
                value={form.connectionDegree}
                onValueChange={(v) =>
                  update("connectionDegree", v as ConnectionDegree)
                }
              >
                <SelectTrigger id="search-degree">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="1st">1st</SelectItem>
                  <SelectItem value="2nd">2nd</SelectItem>
                  <SelectItem value="3rd">3rd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="search-max-pages">Max pages</Label>
              <Input
                id="search-max-pages"
                type="number"
                min={1}
                value={form.maxPages}
                onChange={(e) => update("maxPages", e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Search
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved searches</CardTitle>
            <CardDescription>
              {hasAccounts
                ? "Run a saved search to queue lead collection."
                : "Add an account before running searches."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Filters</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : searches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <p className="text-sm text-muted-foreground">
                        No saved searches yet. Build one on the left to get
                        started.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  searches.map((search) => {
                    const results = search._count.leads || search.resultCount;
                    const running = runningId === search.id;
                    const busy = busyId === search.id;
                    return (
                      <TableRow key={search.id}>
                        <TableCell className="font-medium">
                          {search.name}
                        </TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          {summarizeFilters(search)}
                        </TableCell>
                        <TableCell className="text-sm">{results}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {search.lastRunAt
                            ? formatRelativeTime(search.lastRunAt)
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!hasAccounts || running}
                              title={
                                hasAccounts
                                  ? undefined
                                  : "Add an account to run searches"
                              }
                              onClick={() => handleRunNow(search)}
                            >
                              {running ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <SearchIcon className="mr-2 h-4 w-4" />
                              )}
                              Run Now
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy}
                              onClick={() => handleDelete(search)}
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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose an account</DialogTitle>
            <DialogDescription>
              Pick which account should run
              {pickerSearch ? ` "${pickerSearch.name}"` : " this search"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="run-account">Account</Label>
            <Select value={pickedAccountId} onValueChange={setPickedAccountId}>
              <SelectTrigger id="run-account">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={handleConfirmPicker}
              disabled={!pickedAccountId}
            >
              Run search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
