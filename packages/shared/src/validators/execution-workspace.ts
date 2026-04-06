import { z } from "zod";
import { normalizeHumanReviewStatus } from "../constants.js";

export const executionWorkspaceStatusSchema = z.enum([
  "active",
  "idle",
  "human_review",
  "archived",
  "cleanup_failed",
]);

const executionWorkspaceStatusInputSchema = z
  .enum([
    "active",
    "idle",
    "human_review",
    "in_review",
    "archived",
    "cleanup_failed",
  ])
  .transform((status) => normalizeHumanReviewStatus(status) as z.infer<typeof executionWorkspaceStatusSchema>);

export const updateExecutionWorkspaceSchema = z.object({
  status: executionWorkspaceStatusInputSchema.optional(),
  cleanupEligibleAt: z.string().datetime().optional().nullable(),
  cleanupReason: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
}).strict();

export type UpdateExecutionWorkspace = z.infer<typeof updateExecutionWorkspaceSchema>;
