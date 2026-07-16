"use client";

import { useRef, useState } from "react";

import { apiFetch } from "@/lib/client";
import { renderTemplate } from "@/lib/utils";
import type { TemplateType } from "@/types";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  body: string;
  createdAt: string;
}

interface TemplateEditorProps {
  template?: Template | null;
  onSaved: () => void;
  onCancel?: () => void;
}

const CONNECTION_NOTE_MAX = 300;

const VARIABLES = ["firstName", "lastName", "company", "title"] as const;

const PREVIEW_VARS: Record<string, string> = {
  firstName: "Sarah",
  lastName: "Lee",
  company: "Acme",
  title: "VP Sales",
  fullName: "Sarah Lee",
};

export function TemplateEditor({
  template,
  onSaved,
  onCancel,
}: TemplateEditorProps) {
  const { toast } = useToast();
  const [name, setName] = useState<string>(template?.name ?? "");
  const [type, setType] = useState<TemplateType>(template?.type ?? "message");
  const [body, setBody] = useState<string>(template?.body ?? "");
  const [saving, setSaving] = useState<boolean>(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isConnectionNote = type === "connection_note";
  const overLimit = isConnectionNote && body.length > CONNECTION_NOTE_MAX;

  function insertVariable(variable: string): void {
    const token = `{{${variable}}}`;
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + token.length;
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      setBody((prev) => prev + token);
    }
  }

  async function handleSave(): Promise<void> {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!body.trim()) {
      toast({ title: "Body is required", variant: "destructive" });
      return;
    }
    if (overLimit) return;

    setSaving(true);
    try {
      const payload = { name: name.trim(), type, body };
      if (template) {
        await apiFetch(`/api/templates/${template.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast({ title: "Template updated" });
      } else {
        await apiFetch("/api/templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ title: "Template created" });
      }
      onSaved();
    } catch (error: unknown) {
      toast({
        title: "Could not save template",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Friendly intro"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-type">Type</Label>
          <Select
            value={type}
            onValueChange={(value) => setType(value as TemplateType)}
          >
            <SelectTrigger id="template-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="connection_note">Connection note</SelectItem>
              <SelectItem value="message">Message</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="template-body">Body</Label>
            {isConnectionNote && (
              <span
                className={
                  overLimit
                    ? "text-xs font-medium text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {body.length} / {CONNECTION_NOTE_MAX}
              </span>
            )}
          </div>
          <Textarea
            id="template-body"
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi {{firstName}}, I noticed you work at {{company}}..."
            rows={8}
          />
          <div className="flex flex-wrap gap-2">
            {VARIABLES.map((variable) => (
              <Button
                key={variable}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 font-mono text-xs"
                onClick={() => insertVariable(variable)}
              >
                {`{{${variable}}}`}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={handleSave} disabled={saving || overLimit}>
            {saving ? "Saving..." : template ? "Save changes" : "Create template"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Preview</Label>
        <div className="min-h-[12rem] whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm">
          {body.trim() ? (
            renderTemplate(body, PREVIEW_VARS)
          ) : (
            <span className="text-muted-foreground">
              Your rendered message will appear here.
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Preview uses sample values (Sarah Lee · VP Sales · Acme). Missing
          variables fall back to &ldquo;there&rdquo;.
        </p>
      </div>
    </div>
  );
}
