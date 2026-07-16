import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  // account
  active: "bg-green-100 text-green-800 hover:bg-green-100",
  inactive: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  paused: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  captcha: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  banned: "bg-red-100 text-red-800 hover:bg-red-100",
  // lead / campaign-lead
  new: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  queued: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  connected: "bg-green-100 text-green-800 hover:bg-green-100",
  messaged: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  replied: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  skipped: "bg-slate-100 text-slate-500 hover:bg-slate-100",
  pending: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  in_progress: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  completed: "bg-green-100 text-green-800 hover:bg-green-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
  // campaign
  draft: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  running: "bg-green-100 text-green-800 hover:bg-green-100",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", COLORS[status] ?? "bg-slate-100 text-slate-700")}
    >
      {label}
    </Badge>
  );
}
