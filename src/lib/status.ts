import type { VersionStatus } from "@/lib/types";

export const STATUS_LABELS: Record<VersionStatus, string> = {
  in_progress: "Draft",
  review_requested: "Review Requested",
  changes_requested: "Changes Requested",
  approved: "Approved",
};

export const STATUS_SHORT: Record<VersionStatus, string> = {
  in_progress: "Draft",
  review_requested: "In review",
  changes_requested: "Needs changes",
  approved: "Approved",
};

export function isVersionStatus(value: string): value is VersionStatus {
  return value in STATUS_LABELS;
}
