import { describe, expect, it } from "vitest";
import { resolveCheckoutDependencyTarget } from "../services/issues.ts";

function node(input: {
  id: string;
  status: string;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  blockedByIds?: string[];
}) {
  return {
    id: input.id,
    status: input.status,
    assigneeAgentId: input.assigneeAgentId ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    blockedByIds: input.blockedByIds ?? [],
  };
}

describe("resolveCheckoutDependencyTarget", () => {
  it("returns the requested issue when it has no unresolved blockers", () => {
    const result = resolveCheckoutDependencyTarget({
      requestedIssueId: "issue-a",
      agentId: "agent-1",
      nodes: new Map([["issue-a", node({ id: "issue-a", status: "todo" })]]),
    });

    expect(result).toEqual({
      kind: "target",
      issueId: "issue-a",
      redirectedFromIssueId: null,
    });
  });

  it("redirects to the first actionable blocker in a dependency chain", () => {
    const result = resolveCheckoutDependencyTarget({
      requestedIssueId: "issue-a",
      agentId: "agent-1",
      nodes: new Map([
        ["issue-a", node({ id: "issue-a", status: "blocked", blockedByIds: ["issue-b"] })],
        ["issue-b", node({ id: "issue-b", status: "blocked", blockedByIds: ["issue-c"] })],
        ["issue-c", node({ id: "issue-c", status: "todo" })],
      ]),
    });

    expect(result).toEqual({
      kind: "target",
      issueId: "issue-c",
      redirectedFromIssueId: "issue-a",
    });
  });

  it("skips blockers owned by another agent when another actionable blocker exists", () => {
    const result = resolveCheckoutDependencyTarget({
      requestedIssueId: "issue-a",
      agentId: "agent-1",
      nodes: new Map([
        ["issue-a", node({ id: "issue-a", status: "blocked", blockedByIds: ["issue-b", "issue-c"] })],
        ["issue-b", node({ id: "issue-b", status: "todo", assigneeAgentId: "agent-2" })],
        ["issue-c", node({ id: "issue-c", status: "todo" })],
      ]),
    });

    expect(result).toEqual({
      kind: "target",
      issueId: "issue-c",
      redirectedFromIssueId: "issue-a",
    });
  });

  it("stays blocked when every unresolved blocker belongs to another agent", () => {
    const result = resolveCheckoutDependencyTarget({
      requestedIssueId: "issue-a",
      agentId: "agent-1",
      nodes: new Map([
        ["issue-a", node({ id: "issue-a", status: "blocked", blockedByIds: ["issue-b"] })],
        ["issue-b", node({ id: "issue-b", status: "in_progress", assigneeAgentId: "agent-2" })],
      ]),
    });

    expect(result).toEqual({
      kind: "blocked",
      issueId: "issue-a",
      blockingIssueIds: ["issue-b"],
      reason: "blocked_by_other_agent",
    });
  });

  it("detects dependency cycles", () => {
    const result = resolveCheckoutDependencyTarget({
      requestedIssueId: "issue-a",
      agentId: "agent-1",
      nodes: new Map([
        ["issue-a", node({ id: "issue-a", status: "blocked", blockedByIds: ["issue-b"] })],
        ["issue-b", node({ id: "issue-b", status: "blocked", blockedByIds: ["issue-a"] })],
      ]),
    });

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") {
      throw new Error("expected blocked result");
    }
    expect(result.reason).toBe("dependency_cycle");
    expect(result.blockingIssueIds.sort()).toEqual(["issue-a", "issue-b"]);
  });
});
