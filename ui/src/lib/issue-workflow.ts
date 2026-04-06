import type { Issue, Project } from "@paperclipai/shared";

const ALL_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "testing",
  "human_review",
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
      return ["in_progress", "human_review", "blocked", "cancelled"];
    case "testing":
      return ["testing", "rework", "blocked", "cancelled"];
    case "human_review":
      return ["human_review", "testing", "rework", "merging", "cancelled"];
    case "rework":
      return ["rework", "blocked", "cancelled"];
    case "merging":
      return ["merging", "rework", "human_review", "blocked", "cancelled"];
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
    case "human_review":
      return "Human intervention lane. Use this only when a person must act before work can continue, and include the required Human needed / Why the agent cannot continue / Requested action / After resolution route lines.";
    case "rework":
      return "Engineering rework queue. Leaving this unassigned routes it back to engineer/devops.";
    case "merging":
      return "CEO merge queue. Leaving this unassigned routes it to the CEO to merge and push.";
    case "blocked":
      return "Use blocked only for non-human blockers. Human questions, secrets, or missing decisions should go to human_review.";
    case "in_progress":
      if (input.assigneeRole === "engineer" || input.assigneeRole === "devops") {
        return "Active engineering work defaults to testing when implementation is complete. Use human_review only for true human-needed escalations with the required structured comment.";
      }
      if (input.assigneeRole === "qa") {
        return "Active QA work can hand off to rework, merging, human_review, or blocked. Use human_review only for true human-needed escalations with the required structured comment.";
      }
      if (input.assigneeRole === "ceo") {
        return "Active CEO merge work can only hand off to done, rework, human_review, or blocked. Done requires a clean pushed repo. human_review requires the structured human-needed comment.";
      }
      return "Active development work flows through testing, rework, merging, and CEO completion.";
    default:
      return null;
  }
}
