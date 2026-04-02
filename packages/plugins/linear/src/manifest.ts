import { ISSUE_STATUSES } from "@paperclipai/shared";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_POLL_SCHEDULE,
  EXPORT_NAMES,
  JOB_KEYS,
  PAGE_ROUTE,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  WEBHOOK_KEYS,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Linear Sync",
  description: "Sync Paperclip issues with Linear issues, including status, comments, and blocking dependencies.",
  author: "Paperclip",
  categories: ["connector", "automation", "ui"],
  capabilities: [
    "companies.read",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.read",
    "issue.comments.create",
    "events.subscribe",
    "jobs.schedule",
    "webhooks.receive",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "instance.settings.register",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      companyMappings: {
        type: "array",
        title: "Company Mappings",
        default: [],
        items: {
          type: "object",
          properties: {
            companyId: { type: "string", title: "Paperclip Company ID" },
            teamId: { type: "string", title: "Linear Team ID" },
            apiTokenSecretRef: { type: "string", title: "Linear API Token Secret Ref" },
            syncDirection: {
              type: "string",
              title: "Sync Direction",
              enum: ["pull", "push", "bidirectional"],
              default: "bidirectional",
            },
            importLinearIssues: {
              type: "boolean",
              title: "Import Linear Issues",
              default: true,
            },
            autoCreateLinearIssues: {
              type: "boolean",
              title: "Auto-create Linked Linear Issues",
              default: true,
            },
            syncComments: {
              type: "boolean",
              title: "Sync Comments",
              default: true,
            },
            blockedStateName: {
              type: "string",
              title: "Blocked Workflow State Name",
            },
            statusMappings: {
              type: "array",
              title: "Linear Workflow Status Mappings",
              default: [],
              items: {
                type: "object",
                properties: {
                  linearStateId: { type: "string", title: "Linear Workflow State ID" },
                  paperclipStatus: {
                    type: "string",
                    title: "Paperclip Status",
                    enum: [...ISSUE_STATUSES],
                  },
                  syncMode: {
                    type: "string",
                    title: "Sync Mode",
                    enum: ["pull", "push", "bidirectional"],
                    default: "bidirectional",
                  },
                },
                required: ["linearStateId", "paperclipStatus"],
                additionalProperties: false,
              },
            },
            graphqlUrl: {
              type: "string",
              title: "GraphQL URL Override",
              format: "uri",
            },
            webhookSecretRef: {
              type: "string",
              title: "Webhook Signing Secret Ref",
            },
          },
          required: ["companyId", "apiTokenSecretRef"],
          additionalProperties: false,
        },
      },
    },
  },
  jobs: [
    {
      jobKey: JOB_KEYS.poll,
      displayName: "Pull Linear Updates",
      description: "Imports changes from configured Linear teams into Paperclip.",
      schedule: DEFAULT_POLL_SCHEDULE,
    },
  ],
  webhooks: [
    {
      endpointKey: WEBHOOK_KEYS.linear,
      displayName: "Linear webhook",
      description: "Accepts Linear issue webhooks for faster sync than polling alone.",
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: "Linear",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "Linear Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "Linear Sync",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
      {
        type: "detailTab",
        id: SLOT_IDS.issueDetailTab,
        displayName: "Linear",
        exportName: EXPORT_NAMES.issueDetailTab,
        entityTypes: ["issue"],
      },
    ],
  },
};

export default manifest;
