import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentService } from "../services/agents.ts";

function createSelectSequenceDb(results: unknown[]) {
  const pending = [...results];
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    then: vi.fn((resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(pending.shift() ?? []))),
  };

  return {
    db: {
      select: vi.fn(() => chain),
    },
  };
}

function makeAgentRow(overrides: Record<string, unknown>) {
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "Agent One",
    role: "engineer",
    title: null,
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    metadata: null,
    permissions: null,
    status: "idle",
    pauseReason: null,
    pausedAt: null,
    lastHeartbeatAt: new Date("2026-03-19T12:00:00.000Z"),
    createdAt: new Date("2026-03-19T12:00:00.000Z"),
    updatedAt: new Date("2026-03-19T12:00:00.000Z"),
    ...overrides,
  };
}

describe("selectDeterministicAssignee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the requested eligible agent before load balancing", async () => {
    const dbStub = createSelectSequenceDb([
      [
        makeAgentRow({ id: "eng-1", name: "Engineer One", role: "engineer", status: "idle" }),
        makeAgentRow({ id: "eng-2", name: "Engineer Two", role: "engineer", status: "running" }),
      ],
    ]);

    const agents = agentService(dbStub.db as any);
    const assignee = await agents.selectDeterministicAssignee("company-1", {
      roles: ["engineer", "devops"],
      preferredAgentId: "eng-2",
    });

    expect(assignee?.id).toBe("eng-2");
  });

  it("chooses the lowest-load eligible agent and ignores paused candidates", async () => {
    const dbStub = createSelectSequenceDb([
      [
        makeAgentRow({
          id: "eng-1",
          name: "Engineer One",
          role: "engineer",
          status: "idle",
          lastHeartbeatAt: new Date("2026-03-19T12:02:00.000Z"),
        }),
        makeAgentRow({
          id: "eng-2",
          name: "Engineer Two",
          role: "engineer",
          status: "active",
          lastHeartbeatAt: new Date("2026-03-19T12:05:00.000Z"),
        }),
        makeAgentRow({
          id: "devops-1",
          name: "DevOps One",
          role: "devops",
          status: "paused",
          lastHeartbeatAt: new Date("2026-03-19T12:10:00.000Z"),
        }),
      ],
      [
        { assigneeAgentId: "eng-1", status: "todo" },
        { assigneeAgentId: "eng-1", status: "in_progress" },
      ],
    ]);

    const agents = agentService(dbStub.db as any);
    const assignee = await agents.selectDeterministicAssignee("company-1", {
      roles: ["engineer", "devops"],
    });

    expect(assignee?.id).toBe("eng-2");
  });

  it("can include paused candidates for manual assignment flows", async () => {
    const dbStub = createSelectSequenceDb([
      [
        makeAgentRow({
          id: "eng-1",
          name: "Engineer One",
          role: "engineer",
          status: "paused",
          lastHeartbeatAt: new Date("2026-03-19T12:02:00.000Z"),
        }),
        makeAgentRow({
          id: "eng-2",
          name: "Engineer Two",
          role: "engineer",
          status: "pending_approval",
          lastHeartbeatAt: new Date("2026-03-19T12:05:00.000Z"),
        }),
      ],
      [
        { assigneeAgentId: "eng-1", status: "todo" },
      ],
    ]);

    const agents = agentService(dbStub.db as any);
    const assignee = await agents.selectDeterministicAssignee("company-1", {
      roles: ["engineer"],
      eligibility: "manual",
    });

    expect(assignee?.id).toBe("eng-1");
  });
});
