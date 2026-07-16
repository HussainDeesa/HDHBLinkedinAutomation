// Shared application types.

export type AccountStatus =
  | "inactive"
  | "active"
  | "paused"
  | "captcha"
  | "banned";

export type LeadStatus =
  | "new"
  | "queued"
  | "connected"
  | "messaged"
  | "replied"
  | "skipped";

export type CampaignStatus = "draft" | "running" | "paused" | "completed";

export type CampaignLeadStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type TemplateType = "connection_note" | "message";

export type StepType = "connect" | "message";

export interface CampaignStep {
  type: StepType;
  templateId: string | null;
  delayDays: number;
}

export interface ScrapedLead {
  fullName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  profileUrl: string;
  location?: string;
  company?: string;
  title?: string;
  connectionDegree?: string;
}

export interface ScrapedConnection {
  fullName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  profileUrl: string;
  /** Raw "Connected 2 months ago" text from the badge, if present. */
  connectedText?: string;
  /** Approximate connection date parsed from `connectedText`. */
  connectedAt?: Date;
}
