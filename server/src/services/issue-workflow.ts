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
  in_progress: new Set(["testing", "in_review", "rework", "merging", "blocked", "done", "cancelled"]),
  testing: new Set(["in_progress", "in_review", "rework", "blocked", "cancelled"]),
  in_review: new Set(["rework", "merging", "done", "cancelled"]),
  rework: new Set(["in_progress", "blocked", "cancelled"]),
  merging: new Set(["in_progress", "blocked", "done", "cancelled"]),
  blocked: new Set(["todo", "testing", "rework", "merging", "in_progress", "cancelled"]),
  done: new Set(["todo"]),
  cancelled: new Set(["todo"]),
};

const DEVELOPMENT_ISSUE_TRANSITIONS: Record<string, Set<string>> = {
  backlog: new Set(["todo", "cancelled"]),
  todo: new Set(["in_progress", "blocked", "cancelled"]),
  in_progress: new Set(["testing", "in_review", "rework", "merging", "blocked", "done", "cancelled"]),
  testing: new Set(["in_progress", "rework", "blocked", "cancelled"]),
  in_review: new Set(["rework", "testing", "merging", "cancelled"]),
  rework: new Set(["in_progress", "blocked", "cancelled"]),
  merging: new Set(["in_progress", "rework", "in_review", "blocked", "cancelled"]),
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
  if (from === to) return true;
  const allowedTargets = ISSUE_TRANSITIONS[from];
  if (!allowedTargets) return false;
  return allowedTargets.has(to);
}

export function assertIssueStatusTransition(from: string, to: string) {
  if (canTransitionIssueStatus(from, to)) return;
  throw conflict(`Invalid issue status transition: ${from} -> ${to}`);
}

export function canTransitionDevelopmentIssueStatus(from: string, to: string) {
  if (from === to) return true;
  const allowedTargets = DEVELOPMENT_ISSUE_TRANSITIONS[from];
  if (!allowedTargets) return false;
  return allowedTargets.has(to);
}

export function assertDevelopmentIssueStatusTransition(from: string, to: string) {
  if (canTransitionDevelopmentIssueStatus(from, to)) return;
  throw conflict(`Invalid development issue status transition: ${from} -> ${to}`);
}

export function resolveReleaseStatus(
  queuedStatusBeforeCheckout: string | null | undefined,
) {
  if (
    queuedStatusBeforeCheckout &&
    queuedStatusBeforeCheckout !== "in_progress" &&
    queuedStatusBeforeCheckout !== "done" &&
    queuedStatusBeforeCheckout !== "cancelled"
  ) {
    return queuedStatusBeforeCheckout;
  }
  return "todo";
}
