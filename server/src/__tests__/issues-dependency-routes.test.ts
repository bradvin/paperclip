import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conflict } from "../errors.js";
import { errorHandler } from "../middleware/index.js";
import { issueRoutes } from "../routes/issues.js";
import { agentRoutes } from "../routes/agents.js";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
  getAncestors: vi.fn(),
  getCommentCursor: vi.fn(),
  getComment: vi.fn(),
  assertCheckoutOwner: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  checkout: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
  listWakeableDependentsForResolvedBlocker: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
  listByIds: vi.fn(),
}));

const mockGoalService = vi.hoisted(() => ({
  getById: vi.fn(),
  getDefaultCompanyGoal: vi.fn(),
}));

const mockDocumentService = vi.hoisted(() => ({
  getIssueDocumentPayload: vi.fn(),
}));

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  getChainOfCommand: vi.fn(),
  getCompanyCeo: vi.fn(),
  selectDeterministicAssignee: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  getAgentMonthlySummary: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  resolveForAdapter: vi.fn(),
}));

const mockWorkspaceOperationService = vi.hoisted(() => ({
  listForWorkspace: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  issueService: () => mockIssueService,
  heartbeatService: () => mockHeartbeatService,
  projectService: () => mockProjectService,
  goalService: () => mockGoalService,
  documentService: () => mockDocumentService,
  executionWorkspaceService: () => mockExecutionWorkspaceService,
  workProductService: () => mockWorkProductService,
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  approvalService: () => mockApprovalService,
  budgetService: () => mockBudgetService,
  issueApprovalService: () => mockIssueApprovalService,
  secretService: () => mockSecretService,
  workspaceOperationService: () => mockWorkspaceOperationService,
  logActivity: mockLogActivity,
}));

function createIssueApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
      runId: null,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function createAgentApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "agent",
      agentId: "00000000-0000-4000-8000-0000000000a1",
      companyId: "company-1",
      runId: "run-1",
      source: "api_key",
    };
    next();
  });
  app.use("/api", agentRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function createAgentIssueApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "agent",
      agentId: "00000000-0000-4000-8000-0000000000a1",
      companyId: "company-1",
      runId: "run-1",
      source: "api_key",
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

describe("issue dependency route behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockProjectService.getById.mockResolvedValue(null);
    mockProjectService.listByIds.mockResolvedValue([]);
    mockGoalService.getById.mockResolvedValue(null);
    mockGoalService.getDefaultCompanyGoal.mockResolvedValue(null);
    mockDocumentService.getIssueDocumentPayload.mockResolvedValue({});
    mockExecutionWorkspaceService.getById.mockResolvedValue(null);
    mockWorkProductService.listForIssue.mockResolvedValue([]);
    mockIssueService.getAncestors.mockResolvedValue([]);
    mockIssueService.getCommentCursor.mockResolvedValue(null);
    mockIssueService.getComment.mockResolvedValue(null);
    mockIssueService.create.mockResolvedValue(null);
    mockIssueService.assertCheckoutOwner.mockResolvedValue({
      id: "issue-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      checkoutRunId: "run-1",
      adoptedFromRunId: null,
    });
    mockIssueService.addComment.mockResolvedValue({
      id: "comment-1",
      body: "Please address the review feedback.",
    });
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
    mockIssueService.listWakeableDependentsForResolvedBlocker.mockResolvedValue([]);
    mockHeartbeatService.wakeup.mockResolvedValue({ id: "wake-1" });
    mockLogActivity.mockResolvedValue(undefined);
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(false);
    mockAgentService.getById.mockResolvedValue(null);
    mockAgentService.getChainOfCommand.mockResolvedValue([]);
    mockAgentService.getCompanyCeo.mockResolvedValue(null);
    mockAgentService.selectDeterministicAssignee.mockResolvedValue(null);
  });

  it("returns blocks and blockedBy in heartbeat context", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      identifier: "PAP-1",
      title: "Blocked task",
      description: "Need dependency context",
      status: "blocked",
      priority: "high",
      projectId: null,
      goalId: null,
      parentId: null,
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      updatedAt: new Date("2026-03-19T12:00:00.000Z"),
      blocks: [{
        id: "issue-2",
        identifier: "PAP-2",
        title: "Follow-on task",
        status: "todo",
        priority: "medium",
        assigneeAgentId: null,
        assigneeUserId: null,
        relationType: "blocks",
      }],
      blockedBy: [{
        id: "issue-3",
        identifier: "PAP-3",
        title: "Blocking task",
        status: "in_progress",
        priority: "critical",
        assigneeAgentId: "00000000-0000-4000-8000-0000000000b1",
        assigneeUserId: null,
        relationType: "blocks",
      }],
    });

    const res = await request(createIssueApp()).get("/api/issues/issue-1/heartbeat-context");

    expect(res.status).toBe(200);
    expect(res.body.issue.blocks).toHaveLength(1);
    expect(res.body.issue.blockedBy).toHaveLength(1);
    expect(res.body.issue.blockedBy[0]).toMatchObject({
      id: "issue-3",
      title: "Blocking task",
      relationType: "blocks",
    });
  });

  it("redirects checkout to the actionable blocker and wakes on the redirected issue", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      projectId: null,
    });
    mockIssueService.checkout.mockResolvedValue({
      id: "issue-3",
      companyId: "company-1",
      title: "Blocking task",
      status: "in_progress",
    });

    const res = await request(createIssueApp())
      .post("/api/issues/issue-1/checkout")
      .send({
        agentId: "00000000-0000-4000-8000-0000000000a1",
        expectedStatuses: ["todo", "backlog", "blocked"],
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("issue-3");
    expect(mockIssueService.checkout).toHaveBeenCalledWith(
      "issue-1",
      "00000000-0000-4000-8000-0000000000a1",
      ["todo", "backlog", "blocked"],
      null,
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityId: "issue-3",
        details: expect.objectContaining({
          requestedIssueId: "issue-1",
          redirectedFromBlockedIssue: true,
        }),
      }),
    );
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-0000000000a1",
      expect.objectContaining({
        payload: expect.objectContaining({ issueId: "issue-3" }),
        contextSnapshot: expect.objectContaining({ issueId: "issue-3" }),
      }),
    );
  });

  it("returns a dependency-specific 409 when checkout is still blocked", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      projectId: null,
    });
    mockIssueService.checkout.mockRejectedValue(
      conflict("Issue blocked by dependencies", {
        issueId: "issue-1",
        blockingIssueIds: ["issue-3"],
        blockingReason: "blocked_by_other_agent",
      }),
    );

    const res = await request(createIssueApp())
      .post("/api/issues/issue-1/checkout")
      .send({
        agentId: "00000000-0000-4000-8000-0000000000a1",
        expectedStatuses: ["todo", "backlog", "blocked"],
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "Issue blocked by dependencies",
      details: {
        issueId: "issue-1",
        blockingIssueIds: ["issue-3"],
        blockingReason: "blocked_by_other_agent",
      },
    });
  });

  it("wakes dependent assignees when a blocker becomes resolved", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-3",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: null,
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-3",
      companyId: "company-1",
      identifier: "PAP-3",
      title: "Blocking task",
      status: "done",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
    });
    mockIssueService.listWakeableDependentsForResolvedBlocker.mockResolvedValue([
      {
        id: "issue-4",
        companyId: "company-1",
        assigneeAgentId: "00000000-0000-4000-8000-0000000000d1",
        status: "blocked",
      },
    ]);

    const res = await request(createIssueApp())
      .patch("/api/issues/issue-3")
      .send({ status: "done" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-0000000000d1",
        expect.objectContaining({
          reason: "issue_unblocked",
          payload: expect.objectContaining({
            issueId: "issue-4",
            unblockedByIssueId: "issue-3",
          }),
          contextSnapshot: expect.objectContaining({
            issueId: "issue-4",
            wakeReason: "issue_unblocked",
            unblockedByIssueId: "issue-3",
          }),
        }),
      );
    });
  });

  it("auto-routes board-requested rework to an engineer", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-5",
      companyId: "company-1",
      status: "in_review",
      assigneeAgentId: null,
      assigneeUserId: "user-1",
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-2",
      lastQaAgentId: "qa-1",
      hiddenAt: null,
    });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue({
      id: "eng-2",
      companyId: "company-1",
      role: "engineer",
    });
    mockIssueService.update
      .mockResolvedValueOnce({
        id: "issue-5",
        companyId: "company-1",
        identifier: "PAP-5",
        title: "Needs another pass",
        status: "rework",
        assigneeAgentId: null,
        assigneeUserId: null,
        reviewOwnerUserId: "user-1",
        createdByUserId: "user-1",
        lastEngineerAgentId: "eng-2",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      })
      .mockResolvedValueOnce({
        id: "issue-5",
        companyId: "company-1",
        identifier: "PAP-5",
        title: "Needs another pass",
        status: "rework",
        assigneeAgentId: "eng-2",
        assigneeUserId: null,
        reviewOwnerUserId: "user-1",
        createdByUserId: "user-1",
        lastEngineerAgentId: "eng-2",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      });

    const res = await request(createIssueApp())
      .patch("/api/issues/issue-5")
      .send({ status: "rework", comment: "Please address the review feedback." });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenNthCalledWith(1, "issue-5", { status: "rework" });
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["engineer", "devops"],
      preferredAgentId: "eng-2",
    });
    expect(mockIssueService.update).toHaveBeenNthCalledWith(
      2,
      "issue-5",
      expect.objectContaining({
        assigneeAgentId: "eng-2",
        assigneeUserId: null,
      }),
    );
    await vi.waitFor(() => {
      expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
        "eng-2",
        expect.objectContaining({
          reason: "issue_assigned",
          payload: expect.objectContaining({ issueId: "issue-5" }),
          contextSnapshot: expect.objectContaining({ issueId: "issue-5" }),
        }),
      );
    });
  });

  it("lets the current assignee move finished dev work to testing and clear assignment", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-6",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-6",
      companyId: "company-1",
      identifier: "PAP-6",
      title: "Ready for QA",
      status: "testing",
      assigneeAgentId: null,
      assigneeUserId: null,
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-6")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
        comment: "Implementation complete. Ready for QA.",
      });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "issue-6",
      expect.objectContaining({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
      }),
    );
  });

  it("lets the current assignee move failed QA work to rework and clear assignment", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-7",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-7",
      companyId: "company-1",
      identifier: "PAP-7",
      title: "QA found regressions",
      status: "rework",
      assigneeAgentId: null,
      assigneeUserId: null,
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-7")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "rework",
        assigneeAgentId: null,
        assigneeUserId: null,
        comment: "QA found issues that need another dev pass.",
      });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "issue-7",
      expect.objectContaining({
        status: "rework",
        assigneeAgentId: null,
        assigneeUserId: null,
      }),
    );
  });

  it("lets the current assignee hand work to the creator user for human review", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-8",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-8",
      companyId: "company-1",
      identifier: "PAP-8",
      title: "Ready for human review",
      status: "in_review",
      assigneeAgentId: null,
      assigneeUserId: "user-1",
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-8")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "in_review",
        assigneeAgentId: null,
        assigneeUserId: "user-1",
        comment: "QA passed. Ready for human review.",
      });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "issue-8",
      expect.objectContaining({
        status: "in_review",
        assigneeAgentId: null,
        assigneeUserId: "user-1",
      }),
    );
  });

  it("auto-routes new unassigned todo work to an engineer", async () => {
    mockIssueService.create.mockResolvedValue({
      id: "issue-9",
      companyId: "company-1",
      identifier: "PAP-9",
      title: "Fresh todo work",
      status: "todo",
      assigneeAgentId: null,
      assigneeUserId: null,
      hiddenAt: null,
      reviewOwnerUserId: "user-1",
      createdByUserId: "user-1",
      lastEngineerAgentId: null,
      lastQaAgentId: null,
    });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue({
      id: "eng-1",
      companyId: "company-1",
      role: "engineer",
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-9",
      companyId: "company-1",
      identifier: "PAP-9",
      title: "Fresh todo work",
      status: "todo",
      assigneeAgentId: "eng-1",
      assigneeUserId: null,
      hiddenAt: null,
      reviewOwnerUserId: "user-1",
      createdByUserId: "user-1",
      lastEngineerAgentId: null,
      lastQaAgentId: null,
    });

    const res = await request(createIssueApp()).post("/api/companies/company-1/issues").send({
      title: "Fresh todo work",
      status: "todo",
    });

    expect(res.status).toBe(201);
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["engineer", "devops"],
    });
    expect(mockIssueService.update).toHaveBeenCalledWith("issue-9", {
      assigneeAgentId: "eng-1",
      assigneeUserId: null,
    });
    expect(res.body.assigneeAgentId).toBe("eng-1");
  });

  it("auto-routes completed dev work in testing to QA", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-10",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-1",
      hiddenAt: null,
    });
    mockIssueService.update
      .mockResolvedValueOnce({
        id: "issue-10",
        companyId: "company-1",
        identifier: "PAP-10",
        title: "Ready for QA",
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      })
      .mockResolvedValueOnce({
        id: "issue-10",
        companyId: "company-1",
        identifier: "PAP-10",
        title: "Ready for QA",
        status: "testing",
        assigneeAgentId: "qa-1",
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue({
      id: "qa-1",
      companyId: "company-1",
      role: "qa",
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-10")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
        comment: "Implementation complete. Ready for QA.",
      });

    expect(res.status).toBe(200);
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["qa"],
      preferredAgentId: "qa-1",
    });
    expect(mockIssueService.update).toHaveBeenNthCalledWith(
      2,
      "issue-10",
      expect.objectContaining({
        assigneeAgentId: "qa-1",
        assigneeUserId: null,
      }),
    );
    expect(res.body.assigneeAgentId).toBe("qa-1");
  });

  it("auto-routes reopened closed work back to an engineer", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-11",
      companyId: "company-1",
      status: "done",
      assigneeAgentId: null,
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-2",
      lastQaAgentId: "qa-1",
      executionRunId: null,
      hiddenAt: null,
      identifier: "PAP-11",
      title: "Reopen me",
    });
    mockIssueService.update
      .mockResolvedValueOnce({
        id: "issue-11",
        companyId: "company-1",
        identifier: "PAP-11",
        title: "Reopen me",
        status: "todo",
        assigneeAgentId: null,
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-2",
        lastQaAgentId: "qa-1",
        executionRunId: null,
        hiddenAt: null,
      })
      .mockResolvedValueOnce({
        id: "issue-11",
        companyId: "company-1",
        identifier: "PAP-11",
        title: "Reopen me",
        status: "todo",
        assigneeAgentId: "eng-2",
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-2",
        lastQaAgentId: "qa-1",
        executionRunId: null,
        hiddenAt: null,
      });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue({
      id: "eng-2",
      companyId: "company-1",
      role: "engineer",
    });

    const res = await request(createIssueApp())
      .post("/api/issues/issue-11/comments")
      .send({
        body: "Please pick this back up.",
        reopen: true,
      });

    expect(res.status).toBe(201);
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["engineer", "devops"],
    });
    expect(mockIssueService.update).toHaveBeenNthCalledWith(
      2,
      "issue-11",
      expect.objectContaining({
        assigneeAgentId: "eng-2",
        assigneeUserId: null,
      }),
    );
  });

  it("returns blocks and blockedBy from agents me inbox-lite", async () => {
    mockIssueService.list.mockResolvedValue([
      {
        id: "issue-1",
        identifier: "PAP-1",
        title: "Blocked task",
        status: "blocked",
        priority: "high",
        projectId: null,
        goalId: null,
        parentId: null,
        updatedAt: new Date("2026-03-19T12:00:00.000Z"),
        activeRun: null,
        blocks: [{
          id: "issue-2",
          identifier: "PAP-2",
          title: "Downstream task",
          status: "todo",
          priority: "medium",
          assigneeAgentId: null,
          assigneeUserId: null,
          relationType: "blocks",
        }],
        blockedBy: [{
          id: "issue-3",
          identifier: "PAP-3",
          title: "Blocking task",
          status: "in_progress",
          priority: "critical",
          assigneeAgentId: "00000000-0000-4000-8000-0000000000b1",
          assigneeUserId: null,
          relationType: "blocks",
        }],
      },
    ]);

    const res = await request(createAgentApp()).get("/api/agents/me/inbox-lite");

    expect(res.status).toBe(200);
    expect(mockIssueService.list).toHaveBeenCalledWith("company-1", {
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      status: "todo,in_progress,testing,rework,merging,blocked",
    });
    expect(res.body[0]).toMatchObject({
      id: "issue-1",
      blocks: [{ id: "issue-2", relationType: "blocks" }],
      blockedBy: [{ id: "issue-3", relationType: "blocks" }],
    });
  });
});
