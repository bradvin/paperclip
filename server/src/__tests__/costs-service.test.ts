import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costRoutes } from "../routes/costs.js";
import { errorHandler } from "../middleware/index.js";

function makeDb(overrides: Record<string, unknown> = {}) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue([]),
  };

  const thenableChain = Object.assign(Promise.resolve([]), selectChain);

  return {
    select: vi.fn().mockReturnValue(thenableChain),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    ...overrides,
  };
}

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockHeartbeatService = vi.hoisted(() => ({
  cancelBudgetScopeWork: vi.fn().mockResolvedValue(undefined),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockFetchAllQuotaWindows = vi.hoisted(() => vi.fn());
const mockCostService = vi.hoisted(() => ({
  createEvent: vi.fn(),
  createCheckpoint: vi.fn(),
  listCheckpoints: vi.fn().mockResolvedValue([]),
  reportByCheckpoint: vi.fn().mockResolvedValue([]),
  summary: vi.fn().mockResolvedValue({ spendCents: 0 }),
  byAgent: vi.fn().mockResolvedValue([]),
  byAgentModel: vi.fn().mockResolvedValue([]),
  byProvider: vi.fn().mockResolvedValue([]),
  byBiller: vi.fn().mockResolvedValue([]),
  windowSpend: vi.fn().mockResolvedValue([]),
  byProject: vi.fn().mockResolvedValue([]),
}));
const mockFinanceService = vi.hoisted(() => ({
  createEvent: vi.fn(),
  summary: vi.fn().mockResolvedValue({ debitCents: 0, creditCents: 0, netCents: 0, estimatedDebitCents: 0, eventCount: 0 }),
  byBiller: vi.fn().mockResolvedValue([]),
  byKind: vi.fn().mockResolvedValue([]),
  list: vi.fn().mockResolvedValue([]),
}));
const mockBudgetService = vi.hoisted(() => ({
  overview: vi.fn().mockResolvedValue({
    companyId: "company-1",
    policies: [],
    activeIncidents: [],
    pausedAgentCount: 0,
    pausedProjectCount: 0,
    pendingApprovalCount: 0,
  }),
  upsertPolicy: vi.fn(),
  resolveIncident: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  budgetService: () => mockBudgetService,
  costService: () => mockCostService,
  financeService: () => mockFinanceService,
  companyService: () => mockCompanyService,
  agentService: () => mockAgentService,
  heartbeatService: () => mockHeartbeatService,
  logActivity: mockLogActivity,
}));

vi.mock("../services/quota-windows.js", () => ({
  fetchAllQuotaWindows: mockFetchAllQuotaWindows,
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = { type: "board", userId: "board-user", source: "local_implicit" };
    next();
  });
  app.use("/api", costRoutes(makeDb() as any));
  app.use(errorHandler);
  return app;
}

function createAppWithActor(actor: any) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", costRoutes(makeDb() as any));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCostService.listCheckpoints.mockResolvedValue([]);
  mockCostService.reportByCheckpoint.mockResolvedValue([]);
  mockCompanyService.update.mockResolvedValue({
    id: "company-1",
    name: "Paperclip",
    budgetMonthlyCents: 100,
    spentMonthlyCents: 0,
  });
  mockAgentService.update.mockResolvedValue({
    id: "agent-1",
    companyId: "company-1",
    name: "Budget Agent",
    budgetMonthlyCents: 100,
    spentMonthlyCents: 0,
  });
  mockBudgetService.upsertPolicy.mockResolvedValue(undefined);
});

describe("cost routes", () => {
  it("accepts valid ISO date strings and passes them to cost summary routes", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/costs/summary")
      .query({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T23:59:59.999Z" });
    expect(res.status).toBe(200);
  });

  it("returns 400 for an invalid 'from' date string", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/costs/summary")
      .query({ from: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid 'from' date/i);
  });

  it("returns 400 for an invalid 'to' date string", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/costs/summary")
      .query({ to: "banana" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid 'to' date/i);
  });

  it("returns finance summary rows for valid requests", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/costs/finance-summary")
      .query({ from: "2026-02-01T00:00:00.000Z", to: "2026-02-28T23:59:59.999Z" });
    expect(res.status).toBe(200);
    expect(mockFinanceService.summary).toHaveBeenCalled();
  });

  it("returns 400 for invalid finance event list limits", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/costs/finance-events")
      .query({ limit: "0" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid 'limit'/i);
  });

  it("accepts valid finance event list limits", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/costs/finance-events")
      .query({ limit: "25" });
    expect(res.status).toBe(200);
    expect(mockFinanceService.list).toHaveBeenCalledWith("company-1", undefined, 25);
  });

  it("lists cost checkpoints for board users", async () => {
    const app = createApp();
    const checkpoints = [
      {
        id: "checkpoint-1",
        companyId: "company-1",
        name: "Baseline",
        notes: "Before workflow run",
        createdByAgentId: null,
        createdByUserId: "board-user",
        createdAt: "2026-03-19T09:00:00.000Z",
      },
    ];
    mockCostService.listCheckpoints.mockResolvedValue(checkpoints);

    const res = await request(app).get("/api/companies/company-1/cost-checkpoints");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(checkpoints);
    expect(mockCostService.listCheckpoints).toHaveBeenCalledWith("company-1");
  });

  it("creates a cost checkpoint and logs activity", async () => {
    const app = createApp();
    mockCostService.createCheckpoint.mockResolvedValue({
      id: "checkpoint-1",
      companyId: "company-1",
      name: "After run",
      notes: "Workflow v2",
      createdByAgentId: null,
      createdByUserId: "board-user",
      createdAt: "2026-03-19T10:00:00.000Z",
    });

    const res = await request(app)
      .post("/api/companies/company-1/cost-checkpoints")
      .send({ name: "After run", notes: "Workflow v2" });

    expect(res.status).toBe(201);
    expect(mockCostService.createCheckpoint).toHaveBeenCalledWith("company-1", {
      name: "After run",
      notes: "Workflow v2",
      createdByAgentId: null,
      createdByUserId: "board-user",
    });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "cost.checkpoint_created",
      entityType: "cost_checkpoint",
      entityId: "checkpoint-1",
      details: { name: "After run" },
    }));
  });

  it("reports costs by checkpoint interval", async () => {
    const app = createApp();
    const rows = [
      {
        id: "checkpoint-2",
        startCheckpointId: "checkpoint-1",
        startCheckpointName: "Baseline",
        startAt: "2026-03-19T09:00:00.000Z",
        endCheckpointId: "checkpoint-2",
        endCheckpointName: "Run 1",
        endAt: "2026-03-19T10:00:00.000Z",
        isOpenInterval: false,
        costCents: 123,
        inputTokens: 1000,
        cachedInputTokens: 200,
        outputTokens: 500,
        eventCount: 4,
      },
    ];
    mockCostService.reportByCheckpoint.mockResolvedValue(rows);

    const res = await request(app).get("/api/companies/company-1/costs/by-checkpoint");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(mockCostService.reportByCheckpoint).toHaveBeenCalledWith("company-1");
  });

  it("rejects company budget updates for board users outside the company", async () => {
    const app = createAppWithActor({
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: false,
      companyIds: ["company-2"],
    });

    const res = await request(app)
      .patch("/api/companies/company-1/budgets")
      .send({ budgetMonthlyCents: 2500 });

    expect(res.status).toBe(403);
    expect(mockCompanyService.update).not.toHaveBeenCalled();
  });

  it("rejects agent budget updates for board users outside the agent company", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: "agent-1",
      companyId: "company-1",
      name: "Budget Agent",
      budgetMonthlyCents: 100,
      spentMonthlyCents: 0,
    });
    const app = createAppWithActor({
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: false,
      companyIds: ["company-2"],
    });

    const res = await request(app)
      .patch("/api/agents/agent-1/budgets")
      .send({ budgetMonthlyCents: 2500 });

    expect(res.status).toBe(403);
    expect(mockAgentService.update).not.toHaveBeenCalled();
  });
});
