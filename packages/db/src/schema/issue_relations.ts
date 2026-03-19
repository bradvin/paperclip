import { pgTable, uuid, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import type { IssueRelationType } from "@paperclipai/shared";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";

export const issueRelations = pgTable(
  "issue_relations",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    fromIssueId: uuid("from_issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    toIssueId: uuid("to_issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    relationType: text("relation_type").$type<IssueRelationType>().notNull().default("blocks"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.fromIssueId, table.toIssueId, table.relationType],
      name: "issue_relations_pk",
    }),
    companyIdx: index("issue_relations_company_idx").on(table.companyId),
    fromIdx: index("issue_relations_from_idx").on(table.fromIssueId, table.relationType),
    toIdx: index("issue_relations_to_idx").on(table.toIssueId, table.relationType),
  }),
);
