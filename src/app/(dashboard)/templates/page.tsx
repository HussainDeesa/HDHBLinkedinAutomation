"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { apiFetch, useApi } from "@/lib/client";
import type { TemplateType } from "@/types";
import { useToast } from "@/components/ui/use-toast";
import { PageHeader } from "@/components/page-header";
import { TemplateEditor, type Template } from "@/components/template-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TYPE_LABEL: Record<TemplateType, string> = {
  connection_note: "Connection note",
  message: "Message",
};

export default function TemplatesPage() {
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<Template[]>("/api/templates");

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const templates = data ?? [];
  const connectionNotes = templates.filter((t) => t.type === "connection_note");
  const messages = templates.filter((t) => t.type === "message");

  async function handleDelete(template: Template): Promise<void> {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await apiFetch(`/api/templates/${template.id}`, { method: "DELETE" });
      toast({ title: "Template deleted" });
      refresh();
    } catch (e: unknown) {
      toast({
        title: "Could not delete template",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function renderList(items: Template[], emptyLabel: string): JSX.Element {
    if (loading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{template.name}</CardTitle>
                <Badge variant="secondary" className="shrink-0">
                  {TYPE_LABEL[template.type]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                {template.body}
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(template)}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => void handleDelete(template)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Reusable connection notes and messages with variables."
      >
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Template
          </Button>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>New template</DialogTitle>
            </DialogHeader>
            <TemplateEditor
              onSaved={() => {
                setCreateOpen(false);
                refresh();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="connection_note">
        <TabsList>
          <TabsTrigger value="connection_note">
            Connection notes ({connectionNotes.length})
          </TabsTrigger>
          <TabsTrigger value="message">
            Messages ({messages.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="connection_note" className="mt-4">
          {renderList(connectionNotes, "No connection notes yet.")}
        </TabsContent>
        <TabsContent value="message" className="mt-4">
          {renderList(messages, "No messages yet.")}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
          </DialogHeader>
          {editing && (
            <TemplateEditor
              template={editing}
              onSaved={() => {
                setEditing(null);
                refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
