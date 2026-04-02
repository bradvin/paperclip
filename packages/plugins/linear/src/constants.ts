export const PLUGIN_ID = "paperclip.linear";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "linear";

export const JOB_KEYS = {
  poll: "poll-linear",
} as const;

export const WEBHOOK_KEYS = {
  linear: "linear",
} as const;

export const SLOT_IDS = {
  page: "linear-page",
  settingsPage: "linear-settings",
  dashboardWidget: "linear-health",
  issueDetailTab: "linear-issue",
} as const;

export const EXPORT_NAMES = {
  page: "LinearPage",
  settingsPage: "LinearSettingsPage",
  dashboardWidget: "LinearDashboardWidget",
  issueDetailTab: "LinearIssueDetailTab",
} as const;

export const ENTITY_TYPES = {
  issueLink: "linear-issue-link",
  projectLink: "linear-project-link",
  commentLink: "linear-comment-link",
} as const;

export const STATE_NAMESPACE = "linear-sync";
export const DEFAULT_GRAPHQL_URL = "https://api.linear.app/graphql";
export const DEFAULT_POLL_SCHEDULE = "*/10 * * * *";
