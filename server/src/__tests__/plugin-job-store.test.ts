import { describe, expect, it } from "vitest";
import { pluginJobs, plugins } from "@paperclipai/db";
import { pluginJobStore } from "../services/plugin-job-store.js";

type FakePluginRow = {
  id: string;
};

type FakePluginJobRow = {
  id: string;
  pluginId: string;
  jobKey: string;
  schedule: string;
  status: "active" | "paused" | "failed";
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createFakeDb(options?: {
  pluginsRows?: FakePluginRow[];
  pluginJobRows?: FakePluginJobRow[];
}) {
  const state = {
    pluginsRows: [...(options?.pluginsRows ?? [{ id: "plugin-1" }])],
    pluginJobRows: [...(options?.pluginJobRows ?? [])],
  };

  return {
    state,
    select() {
      return {
        from(table: unknown) {
          return {
            where: async () => {
              if (table === plugins) {
                return state.pluginsRows;
              }
              if (table === pluginJobs) {
                return state.pluginJobRows;
              }
              return [];
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(updates: Partial<FakePluginJobRow>) {
          return {
            where: async () => {
              if (table === pluginJobs) {
                state.pluginJobRows = state.pluginJobRows.map((row) => ({
                  ...row,
                  ...updates,
                }));
              }
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values: async (values: Partial<FakePluginJobRow>) => {
          if (table === pluginJobs) {
            state.pluginJobRows.push({
              id: values.id ?? `job-${state.pluginJobRows.length + 1}`,
              pluginId: values.pluginId ?? "plugin-1",
              jobKey: values.jobKey ?? "job",
              schedule: values.schedule ?? "",
              status: values.status ?? "active",
              lastRunAt: values.lastRunAt ?? null,
              nextRunAt: values.nextRunAt ?? null,
              createdAt: values.createdAt ?? new Date(),
              updatedAt: values.updatedAt ?? new Date(),
            });
          }
        },
      };
    },
  };
}

describe("pluginJobStore.syncJobDeclarations", () => {
  it("preserves a paused job when plugin declarations resync on startup", async () => {
    const db = createFakeDb({
      pluginJobRows: [{
        id: "job-1",
        pluginId: "plugin-1",
        jobKey: "poll-linear",
        schedule: "*/10 * * * *",
        status: "paused",
        lastRunAt: null,
        nextRunAt: new Date("2026-04-03T12:00:00.000Z"),
        createdAt: new Date("2026-04-03T09:00:00.000Z"),
        updatedAt: new Date("2026-04-03T09:00:00.000Z"),
      }],
    });
    const store = pluginJobStore(db as any);

    await store.syncJobDeclarations("plugin-1", [{
      jobKey: "poll-linear",
      displayName: "Poll Linear",
      schedule: "*/5 * * * *",
    }]);

    expect(db.state.pluginJobRows).toHaveLength(1);
    expect(db.state.pluginJobRows[0]).toMatchObject({
      id: "job-1",
      jobKey: "poll-linear",
      schedule: "*/5 * * * *",
      status: "paused",
    });
  });
});
