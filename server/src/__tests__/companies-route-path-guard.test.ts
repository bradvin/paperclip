import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";

const listMock = vi.hoisted(() => vi.fn());
const statsMock = vi.hoisted(() => vi.fn());
const getByIdMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const archiveMock = vi.hoisted(() => vi.fn());
const stopMock = vi.hoisted(() => vi.fn());
const startMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
const cancelActiveForAgentMock = vi.hoisted(() => vi.fn());
const logActivityMock = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  companyService: () => ({
    list: listMock,
    stats: statsMock,
    getById: getByIdMock,
    create: createMock,
    update: updateMock,
    archive: archiveMock,
    stop: stopMock,
    start: startMock,
    remove: removeMock,
  }),
  companyPortabilityService: () => ({
    exportBundle: vi.fn(),
    previewImport: vi.fn(),
    importBundle: vi.fn(),
  }),
  accessService: () => ({
    canUser: vi.fn(),
    ensureMembership: vi.fn(),
  }),
  budgetService: () => ({
    upsertPolicy: vi.fn(),
  }),
  heartbeatService: () => ({
    cancelActiveForAgent: cancelActiveForAgentMock,
  }),
  logActivity: logActivityMock,
}));

function createCompany(status: "active" | "paused" | "archived", pauseReason: string | null = null) {
  return {
    id: "company-1",
    name: "Acme",
    description: null,
    status,
    pauseReason,
    pausedAt: pauseReason ? "2026-03-19T10:00:00.000Z" : null,
    issuePrefix: "ACM",
    issueCounter: 12,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-19T10:00:00.000Z",
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      source: "local_implicit",
      userId: "board-user",
      isInstanceAdmin: true,
    };
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  return app;
}

describe("company routes malformed issue path guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a clear error when companyId is missing for issues list path", async () => {
    const app = createApp();
    const res = await request(app).get("/api/companies/issues");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  it("stops a company and cancels active runs for each affected agent", async () => {
    stopMock.mockResolvedValue({
      company: createCompany("paused", "manual"),
      affectedAgentIds: ["agent-1", "agent-2"],
    });
    cancelActiveForAgentMock.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).post("/api/companies/company-1/stop").send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      company: createCompany("paused", "manual"),
      affectedAgentCount: 2,
    });
    expect(stopMock).toHaveBeenCalledWith("company-1");
    expect(cancelActiveForAgentMock).toHaveBeenCalledTimes(2);
    expect(cancelActiveForAgentMock).toHaveBeenNthCalledWith(1, "agent-1");
    expect(cancelActiveForAgentMock).toHaveBeenNthCalledWith(2, "agent-2");
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "company.paused",
        details: { affectedAgentCount: 2 },
      }),
    );
  });

  it("starts a company and only logs the company resume action", async () => {
    startMock.mockResolvedValue({
      company: createCompany("active"),
      affectedAgentIds: ["agent-3"],
    });

    const app = createApp();
    const res = await request(app).post("/api/companies/company-1/start").send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      company: createCompany("active"),
      affectedAgentCount: 1,
    });
    expect(startMock).toHaveBeenCalledWith("company-1");
    expect(cancelActiveForAgentMock).not.toHaveBeenCalled();
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "company.resumed",
        details: { affectedAgentCount: 1 },
      }),
    );
  });
});
