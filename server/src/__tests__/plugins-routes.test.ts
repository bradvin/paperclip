import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaperclipPluginManifestV1, PluginRecord } from "@paperclipai/shared";
import { errorHandler } from "../middleware/index.js";
import { pluginRoutes } from "../routes/plugins.js";

const mockRegistry = vi.hoisted(() => ({
  getById: vi.fn(),
  getByKey: vi.fn(),
  update: vi.fn(),
  upsertConfig: vi.fn(),
}));

const mockLifecycle = vi.hoisted(() => ({
  load: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  unload: vi.fn(),
  markError: vi.fn(),
  markUpgradePending: vi.fn(),
  upgrade: vi.fn(),
  startWorker: vi.fn(),
  stopWorker: vi.fn(),
  restartWorker: vi.fn(),
  getStatus: vi.fn(),
  canTransition: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockPublishGlobalLiveEvent = vi.hoisted(() => vi.fn());

vi.mock("../services/plugin-registry.js", () => ({
  pluginRegistryService: () => mockRegistry,
}));

vi.mock("../services/plugin-lifecycle.js", () => ({
  pluginLifecycleManager: () => mockLifecycle,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

vi.mock("../services/live-events.js", () => ({
  publishGlobalLiveEvent: mockPublishGlobalLiveEvent,
}));

function createManifest(requiredFields: string[]): PaperclipPluginManifestV1 {
  return {
    id: "paperclip.linear",
    apiVersion: 1,
    version: "0.1.0",
    displayName: "Linear Sync",
    capabilities: [],
    instanceConfigSchema: {
      type: "object",
      properties: {
        companyMappings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              companyId: { type: "string" },
              teamId: { type: "string" },
              apiTokenSecretRef: { type: "string" },
            },
            required: requiredFields,
            additionalProperties: false,
          },
        },
      },
    },
  };
}

function createPlugin(manifestJson: PaperclipPluginManifestV1): PluginRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    pluginKey: "paperclip.linear",
    packageName: "@paperclipai/plugin-linear",
    version: manifestJson.version,
    apiVersion: manifestJson.apiVersion,
    categories: [],
    manifestJson,
    status: "ready",
    installOrder: 1,
    packagePath: "/tmp/paperclip-linear",
    lastError: null,
    installedAt: new Date("2026-04-02T00:00:00.000Z"),
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
  };
}

function createApp(loader: { loadManifest: ReturnType<typeof vi.fn> }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: true,
      companyIds: ["company-1"],
    } as any;
    next();
  });
  app.use("/api", pluginRoutes({} as any, loader as any));
  app.use(errorHandler);
  return app;
}

describe("plugin config routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the live local manifest before validating config saves", async () => {
    const persistedManifest = createManifest(["companyId", "teamId", "apiTokenSecretRef"]);
    const liveManifest = createManifest(["companyId", "apiTokenSecretRef"]);
    const persistedPlugin = createPlugin(persistedManifest);
    const refreshedPlugin = createPlugin(liveManifest);
    const loader = {
      loadManifest: vi.fn().mockResolvedValue(liveManifest),
    };

    mockRegistry.getById.mockResolvedValue(persistedPlugin);
    mockRegistry.update.mockResolvedValue(refreshedPlugin);
    mockRegistry.upsertConfig.mockResolvedValue({
      id: "config-1",
      pluginId: persistedPlugin.id,
      configJson: {
        companyMappings: [{ companyId: "company-1", apiTokenSecretRef: "secret-1" }],
      },
    });

    const app = createApp(loader);
    const response = await request(app)
      .post(`/api/plugins/${persistedPlugin.id}/config`)
      .send({
        configJson: {
          companyMappings: [{ companyId: "company-1", apiTokenSecretRef: "secret-1" }],
        },
      });

    expect(response.status).toBe(200);
    expect(loader.loadManifest).toHaveBeenCalledWith("/tmp/paperclip-linear");
    expect(mockRegistry.update).toHaveBeenCalledWith(persistedPlugin.id, {
      version: liveManifest.version,
      manifest: liveManifest,
    });
    expect(mockRegistry.upsertConfig).toHaveBeenCalledWith(persistedPlugin.id, {
      configJson: {
        companyMappings: [{ companyId: "company-1", apiTokenSecretRef: "secret-1" }],
      },
    });
  });
});
