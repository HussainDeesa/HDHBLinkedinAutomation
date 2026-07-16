"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Mail,
  Trash2,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/client";
import type { CampaignStep, StepType, TemplateType } from "@/types";

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  body: string;
}

const NONE_VALUE = "__none__";

function stepTemplateType(type: StepType): TemplateType {
  return type === "connect" ? "connection_note" : "message";
}

interface CampaignBuilderProps {
  steps: CampaignStep[];
  onChange: (steps: CampaignStep[]) => void;
}

export function CampaignBuilder({ steps, onChange }: CampaignBuilderProps) {
  const [templates, setTemplates] = useState<Record<TemplateType, Template[]>>({
    connection_note: [],
    message: [],
  });

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [connectionNotes, messages] = await Promise.all([
          apiFetch<Template[]>("/api/templates?type=connection_note"),
          apiFetch<Template[]>("/api/templates?type=message"),
        ]);
        if (!cancelled) {
          setTemplates({
            connection_note: connectionNotes,
            message: messages,
          });
        }
      } catch {
        // Template fetch failures leave the "no template" option available.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateStep(index: number, patch: Partial<CampaignStep>): void {
    onChange(
      steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  function removeStep(index: number): void {
    onChange(steps.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  function addStep(type: StepType): void {
    const isFirst = steps.length === 0;
    onChange([
      ...steps,
      {
        type,
        templateId: null,
        delayDays: isFirst ? 0 : type === "message" ? 3 : 1,
      },
    ]);
  }

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No steps yet. Add a Connect or Message step to build your sequence.
        </p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const isConnect = step.type === "connect";
            const options = templates[stepTemplateType(step.type)];
            const needsTemplate =
              step.type === "message" && step.templateId === null;
            return (
              <li key={index}>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {index + 1}
                      </span>
                      {isConnect ? (
                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      )}
                      {isConnect ? "Connect" : "Message"}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Move step up"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Move step down"
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Remove step"
                        onClick={() => removeStep(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Template</Label>
                      <Select
                        value={step.templateId ?? NONE_VALUE}
                        onValueChange={(value) =>
                          updateStep(index, {
                            templateId: value === NONE_VALUE ? null : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>
                            No template
                          </SelectItem>
                          {options.map((tpl) => (
                            <SelectItem key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {needsTemplate && (
                        <p className="text-xs text-amber-600">
                          A message step usually needs a template.
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`delay-${index}`}>
                        Wait {step.delayDays}{" "}
                        {step.delayDays === 1 ? "day" : "days"} before this step
                      </Label>
                      <Input
                        id={`delay-${index}`}
                        type="number"
                        min={0}
                        value={step.delayDays}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          updateStep(index, {
                            delayDays:
                              Number.isNaN(parsed) || parsed < 0 ? 0 : parsed,
                          });
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addStep("connect")}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add Connect
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addStep("message")}
        >
          <Mail className="mr-2 h-4 w-4" />
          Add Message
        </Button>
      </div>
    </div>
  );
}
