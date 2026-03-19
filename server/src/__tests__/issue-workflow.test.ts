import { describe, expect, it } from "vitest";
import {
  assertIssueStatusTransition,
  canTransitionIssueStatus,
  isAssignableAgentStatus,
  resolveReleaseStatus,
} from "../services/issue-workflow.js";

describe("issue workflow rules", () => {
  it("accepts the supported workflow transitions", () => {
    expect(canTransitionIssueStatus("backlog", "todo")).toBe(true);
    expect(canTransitionIssueStatus("todo", "in_progress")).toBe(true);
    expect(canTransitionIssueStatus("in_progress", "testing")).toBe(true);
    expect(canTransitionIssueStatus("in_progress", "in_review")).toBe(true);
    expect(canTransitionIssueStatus("testing", "rework")).toBe(true);
    expect(canTransitionIssueStatus("in_review", "merging")).toBe(true);
    expect(canTransitionIssueStatus("done", "todo")).toBe(true);
    expect(canTransitionIssueStatus("cancelled", "todo")).toBe(true);
  });

  it("rejects unsupported workflow transitions", () => {
    expect(canTransitionIssueStatus("backlog", "done")).toBe(false);
    expect(canTransitionIssueStatus("todo", "testing")).toBe(false);
    expect(canTransitionIssueStatus("in_review", "testing")).toBe(false);
    expect(canTransitionIssueStatus("done", "blocked")).toBe(false);
    expect(() => assertIssueStatusTransition("todo", "testing")).toThrow(
      "Invalid issue status transition: todo -> testing",
    );
  });

  it("only treats invokable agent states as assignable", () => {
    expect(isAssignableAgentStatus("active")).toBe(true);
    expect(isAssignableAgentStatus("idle")).toBe(true);
    expect(isAssignableAgentStatus("running")).toBe(true);
    expect(isAssignableAgentStatus("error")).toBe(true);
    expect(isAssignableAgentStatus("paused")).toBe(false);
    expect(isAssignableAgentStatus("pending_approval")).toBe(false);
    expect(isAssignableAgentStatus("terminated")).toBe(false);
  });

  it("restores the queued workflow stage on release", () => {
    expect(resolveReleaseStatus("testing")).toBe("testing");
    expect(resolveReleaseStatus("rework")).toBe("rework");
    expect(resolveReleaseStatus("merging")).toBe("merging");
    expect(resolveReleaseStatus("todo")).toBe("todo");
    expect(resolveReleaseStatus("in_progress")).toBe("todo");
    expect(resolveReleaseStatus("done")).toBe("todo");
    expect(resolveReleaseStatus(null)).toBe("todo");
  });
});
