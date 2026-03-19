import { describe, expect, it } from "vitest";
import { buildCostCheckpointIntervals } from "../services/costs.js";

describe("buildCostCheckpointIntervals", () => {
  it("builds closed intervals between checkpoints and an open interval from the latest checkpoint", () => {
    const now = new Date("2026-03-19T12:00:00.000Z");
    const checkpoints = [
      {
        id: "checkpoint-2",
        companyId: "company-1",
        name: "Run 1",
        notes: null,
        createdByAgentId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-03-19T10:00:00.000Z"),
      },
      {
        id: "checkpoint-1",
        companyId: "company-1",
        name: "Baseline",
        notes: null,
        createdByAgentId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-03-19T09:00:00.000Z"),
      },
      {
        id: "checkpoint-3",
        companyId: "company-1",
        name: "Run 2",
        notes: null,
        createdByAgentId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-03-19T11:00:00.000Z"),
      },
    ];

    expect(buildCostCheckpointIntervals(checkpoints, now)).toEqual([
      {
        id: "checkpoint-3:open",
        startCheckpointId: "checkpoint-3",
        startCheckpointName: "Run 2",
        startAt: new Date("2026-03-19T11:00:00.000Z"),
        endCheckpointId: null,
        endCheckpointName: null,
        endAt: now,
        isOpenInterval: true,
      },
      {
        id: "checkpoint-3",
        startCheckpointId: "checkpoint-2",
        startCheckpointName: "Run 1",
        startAt: new Date("2026-03-19T10:00:00.000Z"),
        endCheckpointId: "checkpoint-3",
        endCheckpointName: "Run 2",
        endAt: new Date("2026-03-19T11:00:00.000Z"),
        isOpenInterval: false,
      },
      {
        id: "checkpoint-2",
        startCheckpointId: "checkpoint-1",
        startCheckpointName: "Baseline",
        startAt: new Date("2026-03-19T09:00:00.000Z"),
        endCheckpointId: "checkpoint-2",
        endCheckpointName: "Run 1",
        endAt: new Date("2026-03-19T10:00:00.000Z"),
        isOpenInterval: false,
      },
    ]);
  });

  it("returns an empty list when there are no checkpoints", () => {
    expect(buildCostCheckpointIntervals([], new Date("2026-03-19T12:00:00.000Z"))).toEqual([]);
  });
});
