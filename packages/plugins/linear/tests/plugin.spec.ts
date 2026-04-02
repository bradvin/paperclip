import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Company, Issue } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

type LinearGraphqlRequest = {
  query: string;
  variables?: Record<string, unknown>;
};

type LinearIssueResponse = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  team: {
    id: string;
    key: string;
    name: string;
  };
  state: {
    id: string;
    name: string;
    type: string;
  };
  comments: {
    nodes: Array<{
      id: string;
      body: string | null;
      createdAt: string;
      updatedAt: string;
      user: { id: string; name: string } | null;
    }>;
  };
  relations: {
    nodes: Array<{
      id: string;
      type: string;
      relatedIssue: {
        id: string;
        identifier: string;
        title: string;
        url: string;
      };
    }>;
  };
  inverseRelations: {
    nodes: Array<{
      id: string;
      type: string;
      issue: {
        id: string;
        identifier: string;
        title: string;
        url: string;
      };
    }>;
  };
};

const NOW = new Date("2026-03-20T10:00:00.000Z");

function createCompany(): Company {
  return {
    id: "co_1",
    name: "Acme",
    description: null,
    status: "active",
    pauseReason: null,
    pausedAt: null,
    issuePrefix: "ACME",
    issueCounter: 12,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: false,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createIssue(overrides: Partial<Issue> & Pick<Issue, "id" | "companyId" | "title">): Issue {
  return {
    id: overrides.id,
    companyId: overrides.companyId,
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: overrides.title,
    description: overrides.description ?? null,
    status: overrides.status ?? "todo",
    priority: overrides.priority ?? "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    reviewOwnerUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    queuedStatusBeforeCheckout: null,
    lastEngineerAgentId: null,
    lastQaAgentId: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: null,
    identifier: overrides.identifier ?? null,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    blocks: overrides.blocks ?? [],
    blockedBy: overrides.blockedBy ?? [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createRemoteIssue(overrides: Partial<LinearIssueResponse> & Pick<LinearIssueResponse, "id" | "identifier" | "title">): LinearIssueResponse {
  return {
    id: overrides.id,
    identifier: overrides.identifier,
    title: overrides.title,
    description: overrides.description ?? null,
    priority: overrides.priority ?? 3,
    url: overrides.url ?? `https://linear.app/acme/issue/${overrides.identifier}/test`,
    createdAt: overrides.createdAt ?? NOW.toISOString(),
    updatedAt: overrides.updatedAt ?? NOW.toISOString(),
    team: overrides.team ?? {
      id: "team_1",
      key: "ACME",
      name: "Acme",
    },
    state: overrides.state ?? {
      id: "state_started",
      name: "In Progress",
      type: "started",
    },
    comments: overrides.comments ?? { nodes: [] },
    relations: overrides.relations ?? { nodes: [] },
    inverseRelations: overrides.inverseRelations ?? { nodes: [] },
  };
}

function installHostLikeEntityStore(harness: ReturnType<typeof createTestHarness>) {
  let nextId = 1;
  const records = new Map<string, {
    id: string;
    entityType: string;
    scopeKind: string;
    scopeId: string | null;
    externalId: string | null;
    title: string | null;
    status: string | null;
    data: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>();

  harness.ctx.entities = {
    async upsert(input) {
      const existing = [...records.values()].find((record) => (
        record.entityType === input.entityType &&
        record.externalId === (input.externalId ?? null)
      ));
      const now = NOW.toISOString();
      const record = existing
        ? {
          ...existing,
          entityType: input.entityType,
          scopeKind: input.scopeKind,
          scopeId: input.scopeId ?? null,
          externalId: input.externalId ?? null,
          title: input.title ?? null,
          status: input.status ?? null,
          data: input.data,
          updatedAt: now,
        }
        : {
          id: `entity_${nextId++}`,
          entityType: input.entityType,
          scopeKind: input.scopeKind,
          scopeId: input.scopeId ?? null,
          externalId: input.externalId ?? null,
          title: input.title ?? null,
          status: input.status ?? null,
          data: input.data,
          createdAt: now,
          updatedAt: now,
        };
      records.set(record.id, record);
      return record;
    },
    async list(query) {
      let out = [...records.values()];
      if (query.entityType) out = out.filter((record) => record.entityType === query.entityType);
      if (query.externalId) out = out.filter((record) => record.externalId === query.externalId);
      if (query.offset) out = out.slice(query.offset);
      if (query.limit) out = out.slice(0, query.limit);
      return out;
    },
  };
}

describe("Linear plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects duplicate company mappings", async () => {
    const result = await plugin.definition.onValidateConfig?.({
      companyMappings: [
        { companyId: "co_1", teamId: "team_1", apiTokenSecretRef: "secret.linear" },
        { companyId: "co_1", teamId: "team_2", apiTokenSecretRef: "secret.linear-2" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: ["Duplicate company mapping for co_1"],
    });
  });

  it("pushes Paperclip dependency links to Linear on issue events", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    await plugin.definition.setup(harness.ctx);
    harness.seed({
      companies: [createCompany()],
      issues: [
        createIssue({
          id: "iss_source",
          companyId: "co_1",
          title: "Source issue",
          description: "Source description",
          status: "blocked",
          priority: "high",
          blocks: [
            {
              id: "iss_target",
              identifier: "ACME-2",
              title: "Target issue",
              status: "todo",
              priority: "medium",
              assigneeAgentId: null,
              assigneeUserId: null,
              relationType: "blocks",
            },
          ],
        }),
        createIssue({
          id: "iss_target",
          companyId: "co_1",
          title: "Target issue",
          status: "todo",
          priority: "medium",
          blockedBy: [
            {
              id: "iss_source",
              identifier: "ACME-1",
              title: "Source issue",
              status: "blocked",
              priority: "high",
              assigneeAgentId: null,
              assigneeUserId: null,
              relationType: "blocks",
            },
          ],
        }),
      ],
    });

    const issueCreateCalls: Array<Record<string, unknown>> = [];
    const issueRelationCalls: Array<Record<string, unknown>> = [];
    const issueLookupCalls: string[] = [];

    const createdRemoteIssues = new Map<string, LinearIssueResponse>([
      ["linear_source", createRemoteIssue({ id: "linear_source", identifier: "ACME-101", title: "Source issue" })],
      ["linear_target", createRemoteIssue({ id: "linear_target", identifier: "ACME-102", title: "Target issue" })],
    ]);

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      const query = request.query;

      if (query.includes("workflowStates")) {
        expect(query).toContain("query LinearWorkflowStates($teamId: ID!)");
        return Response.json({
          data: {
            workflowStates: {
              nodes: [
                { id: "state_backlog", name: "Backlog", type: "backlog" },
                { id: "state_unstarted", name: "Todo", type: "unstarted" },
                { id: "state_started", name: "In Progress", type: "started" },
                { id: "state_done", name: "Done", type: "completed" },
                { id: "state_blocked", name: "Blocked", type: "started" },
              ],
            },
          },
        });
      }

      if (query.includes("issueCreate")) {
        issueCreateCalls.push(request.variables ?? {});
        const title = String((request.variables?.input as Record<string, unknown>)?.title ?? "");
        const id = title === "Source issue" ? "linear_source" : "linear_target";
        return Response.json({ data: { issueCreate: { issue: { id } } } });
      }

      if (query.includes("query LinearIssue($id: String!)")) {
        const id = String(request.variables?.id ?? "");
        issueLookupCalls.push(id);
        const issue = createdRemoteIssues.get(id);
        if (!issue) {
          return Response.json({ errors: [{ message: `Issue not found: ${id}` }] });
        }
        return Response.json({ data: { issue } });
      }

      if (query.includes("issueUpdate")) {
        return Response.json({ data: { issueUpdate: { success: true } } });
      }

      if (query.includes("issueRelationCreate")) {
        issueRelationCalls.push(request.variables?.input as Record<string, unknown>);
        return Response.json({ data: { issueRelationCreate: { issueRelation: { id: "rel_1" } } } });
      }

      throw new Error(`Unhandled Linear query: ${query}`);
    }));

    await harness.emit("issue.updated", { issueId: "iss_source" }, {
      companyId: "co_1",
      entityId: "iss_source",
      entityType: "issue",
    });

    expect(issueCreateCalls).toHaveLength(2);
    expect(issueCreateCalls[0]?.input).toMatchObject({
      teamId: "team_1",
      title: "Source issue",
      description: "Source description",
      priority: 2,
    });
    expect(issueCreateCalls[1]?.input).toMatchObject({
      teamId: "team_1",
      title: "Target issue",
      priority: 3,
    });
    expect(issueRelationCalls).toEqual([
      {
        type: "blocks",
        issueId: "linear_source",
        relatedIssueId: "linear_target",
      },
    ]);
    expect(issueLookupCalls).toContain("linear_source");
    expect(issueLookupCalls).toContain("linear_target");

    const issueLinkData = await harness.getData<{
      linked: boolean;
      link: { linearIssueId: string; linearIdentifier: string } | null;
    }>("issue-link", {
      companyId: "co_1",
      issueId: "iss_source",
    });
    expect(issueLinkData.linked).toBe(true);
    expect(issueLinkData.link).toMatchObject({
      linearIssueId: "linear_source",
      linearIdentifier: "ACME-101",
    });
  });

  it("pulls Linear blocking relations into Paperclip issues", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    await plugin.definition.setup(harness.ctx);
    harness.seed({
      companies: [createCompany()],
      issues: [createIssue({ id: "iss_source", companyId: "co_1", title: "Existing source issue", status: "backlog" })],
    });

    const remoteBlockingIssue = createRemoteIssue({
      id: "linear_source",
      identifier: "ACME-201",
      title: "Existing source issue",
      description: "Pulled from Linear",
      priority: 1,
      state: {
        id: "state_blocked",
        name: "Blocked",
        type: "started",
      },
      relations: {
        nodes: [
          {
            id: "rel_blocks",
            type: "blocks",
            relatedIssue: {
              id: "linear_target",
              identifier: "ACME-202",
              title: "Imported target issue",
              url: "https://linear.app/acme/issue/ACME-202/imported-target-issue",
            },
          },
        ],
      },
    });
    const remoteTargetIssue = createRemoteIssue({
      id: "linear_target",
      identifier: "ACME-202",
      title: "Imported target issue",
      state: {
        id: "state_unstarted",
        name: "Todo",
        type: "unstarted",
      },
    });

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      const id = String(request.variables?.id ?? "");

      if (request.query.includes("query LinearIssueByNumber")) {
        expect(request.query).toContain("query LinearIssueByNumber($teamId: ID!, $number: Float!)");
        return Response.json({
          data: {
            issues: {
              nodes: [remoteBlockingIssue],
            },
          },
        });
      }

      if (request.query.includes("query LinearIssue($id: String!)")) {
        if (id === "linear_source") {
          return Response.json({ data: { issue: remoteBlockingIssue } });
        }
        if (id === "linear_target") {
          return Response.json({ data: { issue: remoteTargetIssue } });
        }
        return Response.json({ errors: [{ message: `Issue not found: ${id}` }] });
      }

      throw new Error(`Unhandled Linear query: ${request.query}`);
    }));

    await harness.performAction("link-linear-issue", {
      companyId: "co_1",
      issueId: "iss_source",
      linearIssueRef: "ACME-201",
    });

    const sourceIssue = await harness.ctx.issues.get("iss_source", "co_1");
    expect(sourceIssue?.status).toBe("blocked");
    expect(sourceIssue?.priority).toBe("critical");
    expect(sourceIssue?.blocks).toHaveLength(1);

    const importedTargetId = sourceIssue?.blocks?.[0]?.id;
    expect(importedTargetId).toBeTruthy();

    const importedTarget = importedTargetId ? await harness.ctx.issues.get(importedTargetId, "co_1") : null;
    expect(importedTarget?.title).toBe("Imported target issue");
    expect(importedTarget?.blockedBy?.[0]?.id).toBe("iss_source");
  });

  it("creates completed Linear issues directly as done during pull", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    await plugin.definition.setup(harness.ctx);
    harness.seed({
      companies: [createCompany()],
      issues: [],
    });

    const remoteIssue = createRemoteIssue({
      id: "linear_done",
      identifier: "ACME-301",
      title: "Imported done issue",
      state: {
        id: "state_done",
        name: "Done",
        type: "completed",
      },
    });

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      if (request.query.includes("query LinearIssues")) {
        return Response.json({
          data: {
            issues: {
              nodes: [remoteIssue],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        });
      }
      throw new Error(`Unhandled Linear query: ${request.query}`);
    }));

    await harness.performAction("resync-company", {
      companyId: "co_1",
      full: true,
    });

    const imported = await harness.ctx.issues.list({ companyId: "co_1" });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.status).toBe("done");
  });

  it("caches the resolved Linear credential across multiple API calls in one sync flow", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear.auth-cache",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    const originalResolve = harness.ctx.secrets.resolve.bind(harness.ctx.secrets);
    const resolveSpy = vi.fn(async (secretRef: string) => await originalResolve(secretRef));
    harness.ctx.secrets.resolve = resolveSpy;
    await plugin.definition.setup(harness.ctx);
    harness.seed({
      companies: [createCompany()],
      issues: [createIssue({ id: "iss_source", companyId: "co_1", title: "Existing source issue", status: "backlog" })],
    });
    const remoteBlockingIssue = createRemoteIssue({
      id: "linear_source",
      identifier: "ACME-401",
      title: "Existing source issue",
      state: {
        id: "state_blocked",
        name: "Blocked",
        type: "started",
      },
      relations: {
        nodes: [
          {
            id: "rel_blocks",
            type: "blocks",
            relatedIssue: {
              id: "linear_target",
              identifier: "ACME-402",
              title: "Imported target issue",
              url: "https://linear.app/acme/issue/ACME-402/imported-target-issue",
            },
          },
        ],
      },
    });
    const remoteTargetIssue = createRemoteIssue({
      id: "linear_target",
      identifier: "ACME-402",
      title: "Imported target issue",
      state: {
        id: "state_unstarted",
        name: "Todo",
        type: "unstarted",
      },
    });

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      const id = String(request.variables?.id ?? "");

      if (request.query.includes("query LinearIssueByNumber")) {
        return Response.json({
          data: {
            issues: {
              nodes: [remoteBlockingIssue],
            },
          },
        });
      }

      if (request.query.includes("query LinearIssue($id: String!)")) {
        if (id === "linear_source") {
          return Response.json({ data: { issue: remoteBlockingIssue } });
        }
        if (id === "linear_target") {
          return Response.json({ data: { issue: remoteTargetIssue } });
        }
      }

      throw new Error(`Unhandled Linear query: ${request.query}`);
    }));

    await harness.performAction("link-linear-issue", {
      companyId: "co_1",
      issueId: "iss_source",
      linearIssueRef: "ACME-401",
    });

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith("secret.linear.auth-cache");
  });

  it("imports started Linear issues as todo when no local assignee exists", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    await plugin.definition.setup(harness.ctx);
    harness.seed({
      companies: [createCompany()],
      issues: [],
    });

    const remoteIssue = createRemoteIssue({
      id: "linear_started",
      identifier: "ACME-302",
      title: "Imported started issue",
    });

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      if (request.query.includes("query LinearIssues")) {
        return Response.json({
          data: {
            issues: {
              nodes: [remoteIssue],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        });
      }
      throw new Error(`Unhandled Linear query: ${request.query}`);
    }));

    await harness.performAction("resync-company", {
      companyId: "co_1",
      full: true,
    });

    const imported = await harness.ctx.issues.list({ companyId: "co_1" });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.status).toBe("todo");
  });

  it("uses an ID-typed team variable and omits updatedAt when doing the first pull", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    await plugin.definition.setup(harness.ctx);
    harness.seed({
      companies: [createCompany()],
      issues: [],
    });

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      expect(request.query).toContain("query LinearIssues($teamId: ID!, $after: String)");
      expect(request.query).not.toContain("$updatedAt: DateTimeOrDuration");
      expect(request.query).not.toContain("updatedAt: { gte: $updatedAt }");
      expect(request.variables).toMatchObject({
        teamId: "team_1",
        after: null,
      });
      return Response.json({
        data: {
          issues: {
            nodes: [],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      });
    }));

    await expect(harness.performAction("resync-company", {
      companyId: "co_1",
      full: false,
    })).resolves.toMatchObject({
      syncedIssues: 0,
      lastCursor: null,
    });
  });

  it("does not create duplicate Paperclip issues on repeated pull syncs when entity scope filters are unavailable", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyMappings: [
          {
            companyId: "co_1",
            teamId: "team_1",
            apiTokenSecretRef: "secret.linear",
            syncDirection: "bidirectional",
          },
        ],
      },
    });
    await plugin.definition.setup(harness.ctx);
    installHostLikeEntityStore(harness);
    harness.seed({
      companies: [createCompany()],
      issues: [],
    });

    const remoteIssues = [
      createRemoteIssue({
        id: "linear_dup_1",
        identifier: "ACME-501",
        title: "Imported issue one",
        updatedAt: "2026-03-20T10:00:00.000Z",
      }),
      createRemoteIssue({
        id: "linear_dup_2",
        identifier: "ACME-502",
        title: "Imported issue two",
        updatedAt: "2026-03-20T10:01:00.000Z",
      }),
    ];

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as LinearGraphqlRequest;
      if (request.query.includes("query LinearIssues")) {
        return Response.json({
          data: {
            issues: {
              nodes: remoteIssues,
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        });
      }
      throw new Error(`Unhandled Linear query: ${request.query}`);
    }));

    await harness.performAction("resync-company", {
      companyId: "co_1",
      full: true,
    });
    await harness.performAction("resync-company", {
      companyId: "co_1",
      full: true,
    });

    const imported = await harness.ctx.issues.list({ companyId: "co_1" });
    expect(imported).toHaveLength(2);
    expect(imported.map((issue) => issue.title).sort()).toEqual([
      "Imported issue one",
      "Imported issue two",
    ]);

    const overview = await harness.getData<{
      linkedIssueCount: number;
      companies: Array<{ companyId: string; linkedIssues: number }>;
    }>("overview", {
      companyId: "co_1",
    });
    expect(overview.linkedIssueCount).toBe(2);
    expect(overview.companies.find((company) => company.companyId === "co_1")?.linkedIssues).toBe(2);
  });
});
