import { normalizeHumanReviewStatus } from "@paperclipai/shared";

export function normalizeStatusValue(status: string): string {
  return normalizeHumanReviewStatus(status);
}

export function formatStatusText(status: string): string {
  return normalizeStatusValue(status).replace(/_/g, " ");
}

export function formatStatusLabel(status: string): string {
  return formatStatusText(status).replace(/\b\w/g, (char) => char.toUpperCase());
}
