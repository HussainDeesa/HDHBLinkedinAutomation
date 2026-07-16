"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import type { CampaignStatus } from "@/types";

interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  accountId: string;
  stepsJson: string;
  createdAt: string;
  startedAt: string | null;
  account: { id: string; label: string; status: string };
  _count: { campaignLeads: number };
  completedLeads: number;
  totalLeads: number;
}

function ProgressBar({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {completed} / {total}
      </span>
    </div>
  );
}

export default function CampaignsPage() {
  const router = useRouter();
  const { data, loading } = useApi<CampaignListItem[]>("/api/campaigns");
  const campaigns = data ?? [];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Outreach sequences running across your LinkedIn accounts."
      >
        <Button onClick={() => router.push("/campaigns/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <p className="text-sm text-muted-foreground">
                      No campaigns yet. Click{" "}
                      <span className="font-medium">New Campaign</span> to
                      build your first outreach sequence.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium hover:underline"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {campaign.account.label}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {campaign.totalLeads}
                    </TableCell>
                    <TableCell>
                      <ProgressBar
                        completed={campaign.completedLeads}
                        total={campaign.totalLeads}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(campaign.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
