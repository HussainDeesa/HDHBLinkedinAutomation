"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

import { useToast } from "@/components/ui/use-toast";
import { PageHeader } from "@/components/page-header";
import { LeadTable } from "@/components/lead-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
}

export default function LeadsPage() {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bumping this key remounts <LeadTable/> so it re-fetches after an import.
  const [tableKey, setTableKey] = useState<number>(0);

  async function handleImport(): Promise<void> {
    if (!file) {
      toast({ title: "Choose a CSV file first", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // Do not use apiFetch here: it would set a JSON content-type and break
      // the multipart boundary. Let the browser set the boundary itself.
      const res = await fetch("/api/leads/import", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        let message = `Import failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // non-JSON error body
        }
        throw new Error(message);
      }
      const result = (await res.json()) as ImportResult;
      toast({
        title: "Import complete",
        description: `Imported ${result.imported}, skipped ${result.skipped}`,
      });
      setImportOpen(false);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTableKey((k) => k + 1);
    } catch (e: unknown) {
      toast({
        title: "Could not import leads",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Leads" description="Manage your imported and scraped leads.">
        <Button variant="outline" asChild>
          <a href="/api/leads/export">
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </a>
        </Button>
        <Dialog
          open={importOpen}
          onOpenChange={(open) => {
            setImportOpen(open);
            if (!open) {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-1.5 h-4 w-4" />
              Import CSV
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import leads from CSV</DialogTitle>
              <DialogDescription>
                Include a header row. Required column: profileUrl. Optional:
                firstName, lastName, fullName, company, title, headline,
                location.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setImportOpen(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleImport()} disabled={uploading || !file}>
                {uploading ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <LeadTable key={tableKey} />
    </div>
  );
}
