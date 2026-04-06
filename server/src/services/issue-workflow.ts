import { normalizeHumanReviewStatus } from "@paperclipai/shared";
import { conflict } from "../errors.js";

export const MANUALLY_ASSIGNABLE_AGENT_STATUSES = new Set([
  "active",
  "idle",
  "running",
  "error",
  "paused",
]);

export const INVOKABLE_AGENT_STATUSES = new Set([
  "active",
  "idle",
  "running",
  "error",
]);

const ISSUE_TRANSITIONS: Record<string, Set<string>> = {
  backlog: new Set(["todo", "cancelled"]),
  todo: new Set(["in_progress", "blocked", "cancelled"]),
  in_progress: new Set(["testing", "human_review", "rework", "merging", "blocked", "done", "cancelled"]),
  testing: new Set(["in_progress", "human_review", "rework", "merging", "blocked", "cancelled"]),
  human_review: new Set(["rework", "merging", "done", "cancelled"]),
  rework: new Set(["in_progress", "blocked", "cancelled"]),
  merging: new Set(["in_progress", "blocked", "done", "cancelled"]),
  blocked: new Set(["todo", "testing", "rework", "merging", "in_progress", "cancelled"]),
  done: new Set(["todo"]),
  cancelled: new Set(["todo"]),
};

const DEVELOPMENT_ISSUE_TRANSITIONS: Record<string, Set<string>> = {
  backlog: new Set(["todo", "cancelled"]),
  todo: new Set(["in_progress", "blocked", "cancelled"]),
  in_progress: new Set(["testing", "human_review", "rework", "merging", "blocked", "done", "cancelled"]),
  testing: new Set(["in_progress", "rework", "merging", "blocked", "cancelled"]),
  human_review: new Set(["rework", "testing", "merging", "cancelled"]),
  rework: new Set(["in_progress", "blocked", "cancelled"]),
  merging: new Set(["in_progress", "rework", "human_review", "blocked", "cancelled"]),
  blocked: new Set(["todo", "testing", "rework", "merging", "in_progress", "cancelled"]),
  done: new Set(["todo"]),
  cancelled: new Set(["todo"]),
};

export function isAssignableAgentStatus(status: string | null | undefined) {
  return typeof status === "string" && MANUALLY_ASSIGNABLE_AGENT_STATUSES.has(status);
}

export function isInvokableAgentStatus(status: string | null | undefined) {
  return typeof status === "string" && INVOKABLE_AGENT_STATUSES.has(status);
}

export function canTransitionIssueStatus(from: string, to: string) {
  const normalizedFrom = normalizeHumanReviewStatus(from);
  const normalizedTo = normalizeHumanReviewStatus(to);
  if (normalizedFrom === normalizedTo) return true;
  const allowedTargets = ISSUE_TRANSITIONS[normalizedFrom];
  if (!allowedTargets) return false;
  return allowedTargets.has(normalizedTo);
}

export function assertIssueStatusTransition(from: string, to: string) {
  if (canTransitionIssueStatus(from, to)) return;
  throw conflict(`Invalid issue status transition: ${normalizeHumanReviewStatus(from)} -> ${normalizeHumanReviewStatus(to)}`);
}

export function canTransitionDevelopmentIssueStatus(from: string, to: string) {
  const normalizedFrom = normalizeHumanReviewStatus(from);
  const normalizedTo = normalizeHumanReviewStatus(to);
  if (normalizedFrom === normalizedTo) return true;
  const allowedTargets = DEVELOPMENT_ISSUE_TRANSITIONS[normalizedFrom];
  if (!allowedTargets) return false;
  return allowedTargets.has(normalizedTo);
}

export function assertDevelopmentIssueStatusTransition(from: string, to: string) {
  if (canTransitionDevelopmentIssueStatus(from, to)) return;
  throw conflict(
    `Invalid development issue status transition: ${normalizeHumanReviewStatus(from)} -> ${normalizeHumanReviewStatus(to)}`,
  );
}

export function canTransitionWorkflowScopedIssueStatus(
  from: string,
  to: string,
  options?: { isDevelopmentIssue?: boolean | null },
) {
  return options?.isDevelopmentIssue
    ? canTransitionDevelopmentIssueStatus(from, to)
    : canTransitionIssueStatus(from, to);
}

export function assertWorkflowScopedIssueStatusTransition(
  from: string,
  to: string,
  options?: { isDevelopmentIssue?: boolean | null },
) {
  if (options?.isDevelopmentIssue) {
    assertDevelopmentIssueStatusTransition(from, to);
    return;
  }
  assertIssueStatusTransition(from, to);
}

export function resolveReleaseStatus(
  queuedStatusBeforeCheckout: string | null | undefined,
) {
  const normalizedQueuedStatus = normalizeHumanReviewStatus(queuedStatusBeforeCheckout);
  if (
    normalizedQueuedStatus &&
    normalizedQueuedStatus !== "in_progress" &&
    normalizedQueuedStatus !== "done" &&
    normalizedQueuedStatus !== "cancelled"
  ) {
    return normalizedQueuedStatus;
  }
  return "todo";
}
