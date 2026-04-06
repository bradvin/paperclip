import type { Issue, Project } from "@paperclipai/shared";

const ALL_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "testing",
  "in_review",
  "rework",
  "merging",
  "done",
  "cancelled",
  "blocked",
];

type WorkflowIssue = Pick<
  Issue,
  "status" | "projectId" | "assigneeAgentId" | "queuedStatusBeforeCheckout"
> & { project?: Project | null };

export function isGitBackedDevelopmentIssue(issue: WorkflowIssue, project?: Project | null) {
  const resolvedProject = project ?? issue.project ?? null;
  return resolvedProject?.primaryWorkspace?.sourceType === "git_repo";
}

export function getBoardStatusOptions(issue: WorkflowIssue, project?: Project | null) {
  if (!isGitBackedDevelopmentIssue(issue, project)) return ALL_STATUSES;

  switch (issue.status) {
    case "backlog":
      return ["backlog", "todo", "cancelled"];
    case "todo":
      return ["todo", "blocked", "cancelled"];
    case "in_progress":
      return ["in_progress", "in_review", "blocked", "cancelled"];
    case "testing":
      return ["testing", "rework", "blocked", "cancelled"];
    case "in_review":
      return ["in_review", "testing", "rework", "merging", "cancelled"];
    case "rework":
      return ["rework", "blocked", "cancelled"];
    case "merging":
      return ["merging", "rework", "in_review", "blocked", "cancelled"];
    case "blocked":
      return ["blocked", "todo", "testing", "rework", "merging", "cancelled"];
    case "done":
      return ["done", "todo"];
    case "cancelled":
      return ["cancelled", "todo"];
    default:
      return ALL_STATUSES;
  }
}

export function getDevelopmentWorkflowHint(input: {
  issue: WorkflowIssue;
  project?: Project | null;
  assigneeRole?: string | null;
}) {
  if (!isGitBackedDevelopmentIssue(input.issue, input.project)) return null;

  switch (input.issue.status) {
    case "todo":
      return "Engineering queue. Leaving this unassigned routes it to engineer/devops.";
    case "testing":
      return "QA queue. Leaving this unassigned routes it to QA. QA should send failures to rework and passes to merging.";
    case "in_review":
      return "Human intervention lane. Use this only when a person must act before work can continue.";
    case "rework":
      return "Engineering rework queue. Leaving this unassigned routes it back to engineer/devops.";
    case "merging":
      return "CEO merge queue. Leaving this unassigned routes it to the CEO to merge and push.";
    case "blocked":
      return "Use blocked only for non-human blockers. Human questions, secrets, or missing decisions should go to in_review.";
    case "in_progress":
      if (input.assigneeRole === "engineer" || input.assigneeRole === "devops") {
        return "Active engineering work can only hand off to testing, in_review, or blocked.";
      }
      if (input.assigneeRole === "qa") {
        return "Active QA work can only hand off to rework, merging, in_review, or blocked.";
      }
      if (input.assigneeRole === "ceo") {
        return "Active CEO merge work can only hand off to done, rework, in_review, or blocked. Done requires a clean pushed repo.";
      }
      return "Active development work flows through testing, rework, merging, and CEO completion.";
    default:
      return null;
  }
}
