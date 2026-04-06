import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  create: vi.fn(),
  addRelation: vi.fn(),
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
  create: vi.fn(),
  createWorkspace: vi.fn(),
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
  createForIssue: vi.fn(),
  update: vi.fn(),
}));

const mockGitWorkspaceService = vi.hoisted(() => ({
  inspectIssueWorkspace: vi.fn(),
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
  gitWorkspaceService: () => mockGitWorkspaceService,
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

function createDevProject(projectId = "project-dev-1") {
  return {
    id: projectId,
    companyId: "company-1",
    name: "Dev Project",
    description: "Git-backed development project",
    status: "in_progress",
    goalId: null,
    goalIds: [],
    goals: [],
    leadAgentId: null,
    targetDate: null,
    color: "#000000",
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: "workspace-dev-1",
      repoUrl: "https://example.com/repo.git",
      repoRef: "main",
      defaultRef: "main",
      repoName: "repo",
      localFolder: "/tmp/dev-project",
      managedFolder: "/tmp/dev-project",
      effectiveLocalFolder: "/tmp/dev-project",
      origin: "local_folder",
    },
    workspaces: [
      {
        id: "workspace-dev-1",
        companyId: "company-1",
        projectId,
        name: "Primary Workspace",
        sourceType: "git_repo",
        cwd: "/tmp/dev-project",
        repoUrl: "https://example.com/repo.git",
        repoRef: "main",
        defaultRef: "main",
        visibility: "default",
        setupCommand: null,
        cleanupCommand: null,
        remoteProvider: null,
        remoteWorkspaceRef: null,
        sharedWorkspaceKey: null,
        metadata: null,
        isPrimary: true,
        runtimeServices: [],
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ],
    primaryWorkspace: {
      id: "workspace-dev-1",
      companyId: "company-1",
      projectId,
      name: "Primary Workspace",
      sourceType: "git_repo",
      cwd: "/tmp/dev-project",
      repoUrl: "https://example.com/repo.git",
      repoRef: "main",
      defaultRef: "main",
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      isPrimary: true,
      runtimeServices: [],
      createdAt: new Date("2026-03-20T12:00:00.000Z"),
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
    },
    archivedAt: null,
    createdAt: new Date("2026-03-20T12:00:00.000Z"),
    updatedAt: new Date("2026-03-20T12:00:00.000Z"),
    urlKey: "dev-project",
  };
}

describe("issue dependency route behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    for (const mockGroup of [
      mockIssueService,
      mockHeartbeatService,
      mockProjectService,
      mockGoalService,
      mockDocumentService,
      mockExecutionWorkspaceService,
      mockWorkProductService,
      mockGitWorkspaceService,
      mockAccessService,
      mockAgentService,
      mockApprovalService,
      mockBudgetService,
      mockIssueApprovalService,
      mockSecretService,
      mockWorkspaceOperationService,
    ]) {
      for (const mockFn of Object.values(mockGroup)) {
        mockFn.mockReset();
      }
    }
    mockLogActivity.mockReset();

    mockProjectService.getById.mockResolvedValue(null);
    mockProjectService.listByIds.mockResolvedValue([]);
    mockProjectService.createWorkspace.mockResolvedValue({
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "Project Workspace",
      sourceType: "git_repo",
      cwd: null,
      repoUrl: "https://example.com/repo",
      repoRef: "master",
      defaultRef: "master",
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      isPrimary: true,
      runtimeServices: [],
      createdAt: new Date("2026-03-20T12:00:00.000Z"),
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
    });
    mockProjectService.create.mockResolvedValue({
      id: "project-1",
      companyId: "company-1",
      name: "Workflow Project",
      description: "Workflow project",
      status: "in_progress",
      goalId: null,
      goalIds: [],
      goals: [],
      leadAgentId: null,
      targetDate: null,
      color: "#000000",
      pauseReason: null,
      pausedAt: null,
      executionWorkspacePolicy: null,
      codebase: {
        workspaceId: null,
        repoUrl: null,
        repoRef: null,
        defaultRef: null,
        repoName: null,
        localFolder: null,
        managedFolder: "/tmp/project-1",
        effectiveLocalFolder: "/tmp/project-1",
        origin: "managed_checkout",
      },
      workspaces: [],
      primaryWorkspace: null,
      archivedAt: null,
      createdAt: new Date("2026-03-20T12:00:00.000Z"),
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      urlKey: "workflow-project",
    });
    mockGoalService.getById.mockResolvedValue(null);
    mockGoalService.getDefaultCompanyGoal.mockResolvedValue(null);
    mockDocumentService.getIssueDocumentPayload.mockResolvedValue({});
    mockExecutionWorkspaceService.getById.mockResolvedValue(null);
    mockWorkProductService.listForIssue.mockResolvedValue([]);
    mockWorkProductService.createForIssue.mockResolvedValue(null);
    mockWorkProductService.update.mockResolvedValue(null);
    mockGitWorkspaceService.inspectIssueWorkspace.mockResolvedValue({
      cwd: "/tmp/dev-project",
      source: "project_workspace",
      executionWorkspaceId: null,
      projectWorkspaceId: "workspace-dev-1",
      repoUrl: "https://example.com/repo.git",
      branchName: "feature/pap-10",
      repoRoot: "/tmp/dev-project",
      branch: "feature/pap-10",
      upstream: "origin/feature/pap-10",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      aheadCount: 0,
      behindCount: 0,
      hasTrackedChanges: false,
    });
    mockIssueService.getAncestors.mockResolvedValue([]);
    mockIssueService.getCommentCursor.mockResolvedValue(null);
    mockIssueService.getComment.mockResolvedValue(null);
    mockIssueService.create.mockResolvedValue(null);
    mockIssueService.addRelation.mockResolvedValue(null);
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
    mockIssueService.listLabels.mockResolvedValue([]);
    mockIssueService.createLabel.mockImplementation(async (_companyId: string, data: { name: string; color: string }) => ({
      id: `label-${data.name}`,
      companyId: "company-1",
      name: data.name,
      color: data.color,
      createdAt: new Date("2026-03-20T12:00:00.000Z"),
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
    }));
    mockHeartbeatService.wakeup.mockResolvedValue({ id: "wake-1" });
    mockLogActivity.mockResolvedValue(undefined);
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(false);
    mockAgentService.getById.mockImplementation(async (id: string) => ({
      id,
      companyId: "company-1",
      role: "engineer",
      status: "idle",
    }));
    mockAgentService.getChainOfCommand.mockResolvedValue([]);
    mockAgentService.getCompanyCeo.mockResolvedValue(null);
    mockAgentService.selectDeterministicAssignee.mockResolvedValue(null);
    mockAgentService.getById.mockResolvedValue({
      id: "00000000-0000-4000-8000-0000000000a1",
      companyId: "company-1",
      role: "engineer",
      status: "idle",
      permissions: {},
    });
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
      status: "human_review",
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
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));
    mockIssueService.update.mockResolvedValue({
      id: "issue-8",
      companyId: "company-1",
      identifier: "PAP-8",
      title: "Ready for human review",
      status: "human_review",
      assigneeAgentId: null,
      assigneeUserId: "user-1",
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-8")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "human_review",
        assigneeAgentId: null,
        assigneeUserId: "user-1",
        comment: [
          "Human needed: Board confirmation that the new auth copy is approved for release.",
          "Why the agent cannot continue: The code is finished, but release cannot continue without that approval.",
          "Requested action: Review the updated auth wording and confirm it is approved.",
          "After resolution route to: testing",
        ].join("\n"),
      });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "issue-8",
      expect.objectContaining({
        status: "human_review",
        assigneeAgentId: null,
        assigneeUserId: "user-1",
      }),
    );
  });

  it("rejects engineer human_review handoffs without a structured human-needed reason", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-8b",
      companyId: "company-1",
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-8b")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "human_review",
        assigneeAgentId: null,
        assigneeUserId: "user-1",
        comment: "Implementation complete. Please review my work.",
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("structured justification comment");
    expect(res.body.details.nextAction).toContain("move the issue to testing");
    expect(res.body.details.missingFields).toEqual([
      "Human needed:",
      "Why the agent cannot continue:",
      "Requested action:",
      "After resolution route to:",
    ]);
    expect(mockIssueService.update).not.toHaveBeenCalled();
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

  it("rejects creating git-backed development issues directly in merging", async () => {
    const projectId = "00000000-0000-4000-8000-00000000d001";
    mockProjectService.getById.mockResolvedValue(createDevProject(projectId));

    const res = await request(createIssueApp()).post("/api/companies/company-1/issues").send({
      title: "Skip the workflow",
      projectId,
      status: "merging",
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("must be created in backlog, todo, or blocked");
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("records the creating board user as review owner for new development issues", async () => {
    const projectId = "00000000-0000-4000-8000-00000000d002";
    mockProjectService.getById.mockResolvedValue(createDevProject(projectId));
    mockIssueService.create.mockResolvedValue({
      id: "issue-dev-create",
      companyId: "company-1",
      identifier: "PAP-10A",
      title: "New development issue",
      projectId,
      status: "backlog",
      assigneeAgentId: null,
      assigneeUserId: null,
      hiddenAt: null,
      reviewOwnerUserId: "user-1",
      createdByUserId: "user-1",
      lastEngineerAgentId: null,
      lastQaAgentId: null,
    });

    const res = await request(createIssueApp()).post("/api/companies/company-1/issues").send({
      title: "New development issue",
      projectId,
      status: "backlog",
      reviewOwnerUserId: "user-override",
    });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        reviewOwnerUserId: "user-1",
      }),
    );
  });

  it("auto-routes completed dev work in testing to QA", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-10",
      companyId: "company-1",
      projectId: "project-dev-1",
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
        projectId: "project-dev-1",
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
        projectId: "project-dev-1",
      });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));
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

  it("rejects engineer attempts to move a development issue directly to done", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-dev-done",
      companyId: "company-1",
      identifier: "PAP-201",
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      queuedStatusBeforeCheckout: "todo",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-dev-done")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({ status: "done", comment: "Finished implementation." });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("Engineers and DevOps can only exit active development work");
    expect(mockIssueService.update).not.toHaveBeenCalled();
  });

  it("rejects handoff of a development issue when tracked git changes remain", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-dev-dirty",
      companyId: "company-1",
      identifier: "PAP-202",
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      queuedStatusBeforeCheckout: "todo",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));
    mockGitWorkspaceService.inspectIssueWorkspace.mockResolvedValue({
      cwd: "/tmp/dev-project",
      source: "project_workspace",
      executionWorkspaceId: null,
      projectWorkspaceId: "workspace-dev-1",
      repoUrl: "https://example.com/repo.git",
      branchName: "feature/pap-202",
      repoRoot: "/tmp/dev-project",
      branch: "feature/pap-202",
      upstream: "origin/feature/pap-202",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      aheadCount: 0,
      behindCount: 0,
      hasTrackedChanges: true,
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-dev-dirty")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Commit tracked changes before handing off this development issue");
    expect(mockIssueService.update).not.toHaveBeenCalled();
  });

  it("routes QA-passed development work in merging to the CEO", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-dev-merge",
      companyId: "company-1",
      identifier: "PAP-203",
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-1",
      queuedStatusBeforeCheckout: "testing",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));
    mockAgentService.getById.mockResolvedValue({
      id: "00000000-0000-4000-8000-0000000000a1",
      companyId: "company-1",
      role: "qa",
      status: "idle",
      permissions: {},
    });
    mockIssueService.update
      .mockResolvedValueOnce({
        id: "issue-dev-merge",
        companyId: "company-1",
        identifier: "PAP-203",
        title: "Ready to merge",
        projectId: "project-dev-1",
        status: "merging",
        assigneeAgentId: null,
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      })
      .mockResolvedValueOnce({
        id: "issue-dev-merge",
        companyId: "company-1",
        identifier: "PAP-203",
        title: "Ready to merge",
        projectId: "project-dev-1",
        status: "merging",
        assigneeAgentId: "ceo-1",
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue({
      id: "ceo-1",
      companyId: "company-1",
      role: "ceo",
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-dev-merge")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "merging",
        assigneeAgentId: null,
        assigneeUserId: null,
      });

    expect(res.status).toBe(200);
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["ceo"],
    });
    expect(res.body.assigneeAgentId).toBe("ceo-1");
  });

  it("keeps development issues unassigned instead of falling back to the CEO for QA", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-dev-no-qa",
      companyId: "company-1",
      identifier: "PAP-204",
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-missing",
      queuedStatusBeforeCheckout: "todo",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));
    mockIssueService.update.mockResolvedValue({
      id: "issue-dev-no-qa",
      companyId: "company-1",
      identifier: "PAP-204",
      title: "Needs QA",
      projectId: "project-dev-1",
      status: "testing",
      assigneeAgentId: null,
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-missing",
      hiddenAt: null,
    });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue(null);

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-dev-no-qa")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
      });

    expect(res.status).toBe(200);
    expect(mockAgentService.getCompanyCeo).not.toHaveBeenCalled();
    expect(res.body.assigneeAgentId).toBeNull();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.auto_route_failed",
        details: expect.objectContaining({
          reason: "no_eligible_qa_agent",
          requiredRole: "qa",
        }),
      }),
    );
  });

  it("rejects CEO completion when merge work has not been pushed", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-dev-unpushed",
      companyId: "company-1",
      identifier: "PAP-205",
      projectId: "project-dev-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      queuedStatusBeforeCheckout: "merging",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));
    mockAgentService.getById.mockResolvedValue({
      id: "00000000-0000-4000-8000-0000000000a1",
      companyId: "company-1",
      role: "ceo",
      status: "idle",
      permissions: {},
    });
    mockGitWorkspaceService.inspectIssueWorkspace.mockResolvedValue({
      cwd: "/tmp/dev-project",
      source: "project_workspace",
      executionWorkspaceId: null,
      projectWorkspaceId: "workspace-dev-1",
      repoUrl: "https://example.com/repo.git",
      branchName: "main",
      repoRoot: "/tmp/dev-project",
      branch: "main",
      upstream: "origin/main",
      headSha: "fedcba98765432100123456789abcdef01234567",
      aheadCount: 2,
      behindCount: 0,
      hasTrackedChanges: false,
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-dev-unpushed")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({ status: "done" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Push committed merge work before marking this development issue done");
    expect(mockIssueService.update).not.toHaveBeenCalled();
  });

  it("rejects board attempts to close development issues from human_review", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-dev-review",
      companyId: "company-1",
      identifier: "PAP-206",
      projectId: "project-dev-1",
      status: "human_review",
      assigneeAgentId: null,
      assigneeUserId: "user-1",
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      hiddenAt: null,
    });
    mockProjectService.getById.mockResolvedValue(createDevProject("project-dev-1"));

    const res = await request(createIssueApp())
      .patch("/api/issues/issue-dev-review")
      .send({ status: "done" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Invalid development issue status transition");
    expect(mockIssueService.update).not.toHaveBeenCalled();
  });

  it("auto-routes board-requested human_review work to the review owner user", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-10b",
      companyId: "company-1",
      status: "testing",
      assigneeAgentId: null,
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-2",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-1",
      hiddenAt: null,
    });
    mockIssueService.update
      .mockResolvedValueOnce({
        id: "issue-10b",
        companyId: "company-1",
        identifier: "PAP-10B",
        title: "Ready for review",
        status: "human_review",
        assigneeAgentId: null,
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-2",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      })
      .mockResolvedValueOnce({
        id: "issue-10b",
        companyId: "company-1",
        identifier: "PAP-10B",
        title: "Ready for review",
        status: "human_review",
        assigneeAgentId: null,
        assigneeUserId: "user-2",
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-2",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-1",
        hiddenAt: null,
      });

    const res = await request(createIssueApp())
      .patch("/api/issues/issue-10b")
      .send({
        status: "human_review",
        assigneeAgentId: null,
        assigneeUserId: null,
        comment: "QA passed. Ready for human review.",
      });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenNthCalledWith(
      2,
      "issue-10b",
      expect.objectContaining({
        assigneeAgentId: null,
        assigneeUserId: "user-2",
      }),
    );
    expect(res.body.assigneeUserId).toBe("user-2");
  });

  it("falls back to the CEO when no eligible QA agent exists", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-10c",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-9",
      hiddenAt: null,
    });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue(null);
    mockAgentService.getCompanyCeo.mockResolvedValue({
      id: "ceo-1",
      companyId: "company-1",
      role: "ceo",
      status: "idle",
    });
    mockIssueService.update
      .mockResolvedValueOnce({
        id: "issue-10c",
        companyId: "company-1",
        identifier: "PAP-10C",
        title: "Ready for QA fallback",
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-9",
        hiddenAt: null,
      })
      .mockResolvedValueOnce({
        id: "issue-10c",
        companyId: "company-1",
        identifier: "PAP-10C",
        title: "Ready for QA fallback",
        status: "testing",
        assigneeAgentId: "ceo-1",
        assigneeUserId: null,
        createdByUserId: "user-1",
        reviewOwnerUserId: "user-1",
        lastEngineerAgentId: "eng-1",
        lastQaAgentId: "qa-9",
        hiddenAt: null,
      });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-10c")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
        comment: "Ready for QA, falling back if needed.",
      });

    expect(res.status).toBe(200);
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["qa"],
      preferredAgentId: "qa-9",
    });
    expect(mockAgentService.getCompanyCeo).toHaveBeenCalledWith("company-1");
    expect(mockIssueService.update).toHaveBeenNthCalledWith(
      2,
      "issue-10c",
      expect.objectContaining({
        assigneeAgentId: "ceo-1",
        assigneeUserId: null,
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.auto_routed",
        details: expect.objectContaining({
          reason: "ceo_fallback",
          assigneeAgentId: "ceo-1",
        }),
      }),
    );
  });

  it("does not auto-route to a paused CEO fallback", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-10d",
      companyId: "company-1",
      status: "in_progress",
      assigneeAgentId: "00000000-0000-4000-8000-0000000000a1",
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-9",
      hiddenAt: null,
    });
    mockAgentService.selectDeterministicAssignee.mockResolvedValue(null);
    mockAgentService.getCompanyCeo.mockResolvedValue({
      id: "ceo-1",
      companyId: "company-1",
      role: "ceo",
      status: "paused",
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-10d",
      companyId: "company-1",
      identifier: "PAP-10D",
      title: "Ready for QA fallback",
      status: "testing",
      assigneeAgentId: null,
      assigneeUserId: null,
      createdByUserId: "user-1",
      reviewOwnerUserId: "user-1",
      lastEngineerAgentId: "eng-1",
      lastQaAgentId: "qa-9",
      hiddenAt: null,
    });

    const res = await request(createAgentIssueApp())
      .patch("/api/issues/issue-10d")
      .set("X-Paperclip-Run-Id", "run-1")
      .send({
        status: "testing",
        assigneeAgentId: null,
        assigneeUserId: null,
        comment: "Ready for QA, but only the paused CEO is left.",
      });

    expect(res.status).toBe(200);
    expect(mockAgentService.selectDeterministicAssignee).toHaveBeenCalledWith("company-1", {
      roles: ["qa"],
      preferredAgentId: "qa-9",
    });
    expect(mockAgentService.getCompanyCeo).toHaveBeenCalledWith("company-1");
    expect(mockIssueService.update).toHaveBeenCalledTimes(1);
    expect(res.body.assigneeAgentId).toBeNull();
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.auto_routed",
        details: expect.objectContaining({ reason: "ceo_fallback" }),
      }),
    );
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

    const res = await request(createIssueApp()).patch("/api/issues/issue-11").send({
      status: "todo",
    });

    expect(res.status).toBe(200);
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
