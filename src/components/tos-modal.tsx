"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsShape {
  tosAccepted: boolean;
}

/**
 * First-run disclaimer. Blocks the app until the operator acknowledges that
 * automating LinkedIn violates its User Agreement and carries account risk.
 */
export function TosModal() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<SettingsShape>("/api/settings")
      .then((s) => setOpen(!s.tosAccepted))
      .catch(() => setOpen(false));
  }, []);

  async function accept() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ tosAccepted: true }),
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Read before you continue</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-sm">
              <p>
                This tool automates actions on LinkedIn. Automating LinkedIn
                <strong> violates LinkedIn&apos;s User Agreement</strong> and may result in
                temporary restrictions or <strong>permanent account bans</strong>.
              </p>
              <p>
                It is provided <strong>as-is, for educational and authorized internal
                use only</strong>. You are solely responsible for how you use it,
                including compliance with LinkedIn&apos;s terms, applicable laws
                (e.g. GDPR/CAN-SPAM), and the consent of the people you contact.
              </p>
              <p>
                Use conservative limits, real human review, and a LinkedIn account
                you are willing to lose.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => void accept()} disabled={saving} className="w-full">
            I understand and accept the risks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
