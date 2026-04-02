import type { IssueStatus } from "@paperclipai/shared";

export type SyncDirection = "pull" | "push" | "bidirectional";

export interface LinearStatusMapping {
  linearStateId: string;
  paperclipStatus: IssueStatus;
}

export interface CompanyMappingConfig {
  companyId: string;
  teamId: string;
  apiTokenSecretRef: string;
  syncDirection?: SyncDirection;
  importLinearIssues?: boolean;
  autoCreateLinearIssues?: boolean;
  syncComments?: boolean;
  blockedStateName?: string;
  statusMappings?: LinearStatusMapping[];
  graphqlUrl?: string;
  webhookSecretRef?: string;
}

export interface LinearPluginConfig {
  companyMappings?: CompanyMappingConfig[];
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
}

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export interface LinearIssueRef {
  id: string;
  identifier: string;
  title: string;
  url: string;
}

export interface LinearComment {
  id: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
  } | null;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority?: number | null;
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
    nodes: LinearComment[];
  };
  relations: {
    nodes: Array<{
      id: string;
      type: string;
      relatedIssue: LinearIssueRef;
    }>;
  };
  inverseRelations: {
    nodes: Array<{
      id: string;
      type: string;
      issue: LinearIssueRef;
    }>;
  };
}

export interface LinearIssueLinkData {
  [key: string]: unknown;
  companyId: string;
  teamId: string;
  paperclipIssueId: string;
  linearIssueId: string;
  linearIdentifier: string;
  linearUrl: string;
  lastSyncedAt?: string;
  lastPulledAt?: string;
  lastPushedAt?: string;
  lastRemoteUpdatedAt?: string;
  lastImportedFingerprint?: string;
  unlinkedAt?: string | null;
}

export interface LinearCommentLinkData {
  [key: string]: unknown;
  companyId: string;
  paperclipIssueId: string;
  localCommentId: string;
  linearCommentId: string;
  linearIssueId: string;
  lastSyncedAt?: string;
  unlinkedAt?: string | null;
}

export interface SyncCheckpoint {
  lastRunAt?: string;
  lastCursor?: string;
  lastSuccessAt?: string;
  lastError?: string | null;
  lastWebhookAt?: string;
}
