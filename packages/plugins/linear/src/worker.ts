import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEntityRecord,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import { ISSUE_STATUSES, type Issue, type IssueComment } from "@paperclipai/shared";
import {
  ENTITY_TYPES,
  JOB_KEYS,
  PAGE_ROUTE,
  PLUGIN_ID,
  STATE_NAMESPACE,
  WEBHOOK_KEYS,
} from "./constants.js";
import {
  clearAuthHeaderCache,
  createLinearComment,
  createLinearIssue,
  createLinearRelation,
  deleteLinearRelation,
  getLinearIssue,
  getLinearIssueByRef,
  listLinearIssuesUpdatedSince,
  listLinearTeams,
  listWorkflowStates,
  updateLinearIssue,
} from "./linear-api.js";
import type {
  CompanyMappingConfig,
  LinearCommentLinkData,
  LinearIssue,
  LinearIssueLinkData,
  LinearPluginConfig,
  LinearStatusMapping,
  LinearWorkflowState,
  SyncCheckpoint,
} from "./types.js";

type StoredCompanyMapping = {
  companyId: string;
  teamId: string;
  apiTokenSecretRef: string;
  syncDirection?: CompanyMappingConfig["syncDirection"];
  importLinearIssues: boolean;
  autoCreateLinearIssues: boolean;
  syncComments: boolean;
  blockedStateName?: string;
  statusMappings?: LinearStatusMapping[];
  graphqlUrl?: string;
  webhookSecretRef?: string;
};

let currentContext: PluginContext | null = null;
const workflowStateCache = new Map<string, LinearWorkflowState[]>();
const ISSUE_STATUS_TRANSITIONS: Record<Issue["status"], Issue["status"][]> = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["testing", "in_review", "rework", "merging", "blocked", "done", "cancelled"],
  testing: ["in_progress", "in_review", "rework", "blocked", "cancelled"],
  in_review: ["rework", "merging", "done", "cancelled"],
  rework: ["in_progress", "blocked", "cancelled"],
  merging: ["in_progress", "blocked", "done", "cancelled"],
  blocked: ["todo", "testing", "rework", "merging", "in_progress", "cancelled"],
  done: ["todo"],
  cancelled: ["todo"],
};

function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function nowIso() {
  return new Date().toISOString();
}

function isPushEnabled(mapping: CompanyMappingConfig): boolean {
  return mapping.syncDirection === "push" || mapping.syncDirection === "bidirectional" || !mapping.syncDirection;
}

function isPullEnabled(mapping: CompanyMappingConfig): boolean {
  return mapping.syncDirection === "pull" || mapping.syncDirection === "bidirectional" || !mapping.syncDirection;
}

function parseStoredMappings(config: Record<string, unknown> | null | undefined): StoredCompanyMapping[] {
  const rawMappings = Array.isArray(config?.companyMappings) ? config.companyMappings : [];
  return rawMappings
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry): StoredCompanyMapping => {
      const rawStatusMappings = Array.isArray(entry.statusMappings) ? entry.statusMappings : null;
      return {
        companyId: String(entry.companyId ?? "").trim(),
        teamId: String(entry.teamId ?? "").trim(),
        apiTokenSecretRef: String(entry.apiTokenSecretRef ?? "").trim(),
        syncDirection: (entry.syncDirection as CompanyMappingConfig["syncDirection"]) || "bidirectional",
        importLinearIssues: entry.importLinearIssues !== false,
        autoCreateLinearIssues: entry.autoCreateLinearIssues !== false,
        syncComments: entry.syncComments !== false,
        blockedStateName: typeof entry.blockedStateName === "string" ? entry.blockedStateName.trim() : undefined,
        statusMappings: rawStatusMappings
          ? rawStatusMappings
              .filter((mapping): mapping is Record<string, unknown> => Boolean(mapping) && typeof mapping === "object")
              .map((mapping) => ({
                linearStateId: String(mapping.linearStateId ?? "").trim(),
                paperclipStatus: String(mapping.paperclipStatus ?? "").trim() as Issue["status"],
              }))
              .filter((mapping) => mapping.linearStateId && Boolean(mapping.paperclipStatus))
          : undefined,
        graphqlUrl: typeof entry.graphqlUrl === "string" ? entry.graphqlUrl.trim() : undefined,
        webhookSecretRef: typeof entry.webhookSecretRef === "string" ? entry.webhookSecretRef.trim() : undefined,
      };
    })
    .filter((entry) => entry.companyId && entry.apiTokenSecretRef);
}

function normalizeConfig(config: Record<string, unknown> | null | undefined): LinearPluginConfig {
  const companyMappings: CompanyMappingConfig[] = parseStoredMappings(config)
    .filter((entry) => Boolean(entry.teamId))
    .map((entry) => ({ ...entry }));
  return { companyMappings };
}

async function getConfig(ctx: PluginContext): Promise<LinearPluginConfig> {
  return normalizeConfig(await ctx.config.get());
}

async function getStoredMapping(ctx: PluginContext, companyId: string): Promise<StoredCompanyMapping | null> {
  return parseStoredMappings(await ctx.config.get()).find((entry) => entry.companyId === companyId) ?? null;
}

async function getMapping(ctx: PluginContext, companyId: string): Promise<CompanyMappingConfig | null> {
  const config = await getConfig(ctx);
  return config.companyMappings?.find((entry) => entry.companyId === companyId) ?? null;
}

function parseEntityData<T>(entity: PluginEntityRecord): T {
  return entity.data as T;
}

function isActiveLinkRecord(entity: PluginEntityRecord): boolean {
  const data = entity.data as { unlinkedAt?: string | null } | undefined;
  return !data?.unlinkedAt;
}

function sortNewestFirst<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

async function listIssueLinks(ctx: PluginContext): Promise<Array<PluginEntityRecord & { data: LinearIssueLinkData }>> {
  const records = await ctx.entities.list({ entityType: ENTITY_TYPES.issueLink, limit: 5000 });
  return records
    .filter(isActiveLinkRecord)
    .map((record) => ({ ...record, data: parseEntityData<LinearIssueLinkData>(record) }));
}

async function listCommentLinksForIssue(
  ctx: PluginContext,
  issueId: string,
): Promise<Array<PluginEntityRecord & { data: LinearCommentLinkData }>> {
  const records = await ctx.entities.list({
    entityType: ENTITY_TYPES.commentLink,
    limit: 5000,
  });
  return records
    .filter(isActiveLinkRecord)
    .filter((record) => record.scopeKind === "issue" && record.scopeId === issueId)
    .map((record) => ({ ...record, data: parseEntityData<LinearCommentLinkData>(record) }));
}

async function getIssueLinkByLocalIssueId(
  ctx: PluginContext,
  issueId: string,
): Promise<(PluginEntityRecord & { data: LinearIssueLinkData }) | null> {
  const records = await listIssueLinks(ctx);
  const record = sortNewestFirst(
    records.filter((entry) => entry.scopeKind === "issue" && entry.scopeId === issueId),
  )[0];
  return record ?? null;
}

async function getIssueLinkByLinearIssueId(
  ctx: PluginContext,
  linearIssueId: string,
): Promise<(PluginEntityRecord & { data: LinearIssueLinkData }) | null> {
  const byExternalId = await ctx.entities.list({
    entityType: ENTITY_TYPES.issueLink,
    externalId: linearIssueId,
    limit: 10,
  });
  const matchingExternalRecord = sortNewestFirst(
    byExternalId
      .filter(isActiveLinkRecord)
      .map((record) => ({ ...record, data: parseEntityData<LinearIssueLinkData>(record) }))
      .filter((record) => record.data.linearIssueId === linearIssueId || record.externalId === linearIssueId),
  )[0];
  if (matchingExternalRecord) {
    return matchingExternalRecord;
  }
  const records = await listIssueLinks(ctx);
  const record = sortNewestFirst(
    records.filter((entry) => entry.data.linearIssueId === linearIssueId),
  )[0];
  return record ?? null;
}

async function upsertIssueLink(
  ctx: PluginContext,
  input: LinearIssueLinkData,
): Promise<PluginEntityRecord & { data: LinearIssueLinkData }> {
  const existingByRemote = await getIssueLinkByLinearIssueId(ctx, input.linearIssueId);
  const existingByLocal = await getIssueLinkByLocalIssueId(ctx, input.paperclipIssueId);

  if (
    !input.unlinkedAt &&
    existingByLocal &&
    existingByLocal.data.linearIssueId !== input.linearIssueId
  ) {
    const retiredAt = input.lastSyncedAt ?? nowIso();
    await ctx.entities.upsert({
      entityType: ENTITY_TYPES.issueLink,
      scopeKind: "issue",
      scopeId: existingByLocal.data.paperclipIssueId,
      externalId: existingByLocal.externalId ?? existingByLocal.data.linearIssueId,
      title: existingByLocal.data.linearIdentifier,
      status: "unlinked",
      data: {
        ...existingByLocal.data,
        lastSyncedAt: retiredAt,
        unlinkedAt: retiredAt,
      },
    });
  }

  const record = await ctx.entities.upsert({
    entityType: ENTITY_TYPES.issueLink,
    scopeKind: "issue",
    scopeId: input.paperclipIssueId,
    externalId: existingByRemote?.externalId ?? input.linearIssueId,
    title: input.linearIdentifier,
    status: input.unlinkedAt ? "unlinked" : "linked",
    data: input,
  });
  return { ...record, data: parseEntityData<LinearIssueLinkData>(record) };
}

async function upsertCommentLink(
  ctx: PluginContext,
  input: LinearCommentLinkData,
): Promise<void> {
  await ctx.entities.upsert({
    entityType: ENTITY_TYPES.commentLink,
    scopeKind: "issue",
    scopeId: input.paperclipIssueId,
    externalId: input.linearCommentId,
    title: input.linearCommentId,
    status: input.unlinkedAt ? "unlinked" : "linked",
    data: input,
  });
}

async function getCheckpoint(ctx: PluginContext, mapping: CompanyMappingConfig): Promise<SyncCheckpoint> {
  const value = await ctx.state.get({
    scopeKind: "company",
    scopeId: mapping.companyId,
    namespace: `${STATE_NAMESPACE}:${mapping.teamId}`,
    stateKey: "checkpoint",
  });
  return value && typeof value === "object" ? value as SyncCheckpoint : {};
}

async function saveCheckpoint(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  patch: Partial<SyncCheckpoint>,
): Promise<SyncCheckpoint> {
  const current = await getCheckpoint(ctx, mapping);
  const next: SyncCheckpoint = { ...current, ...patch };
  await ctx.state.set({
    scopeKind: "company",
    scopeId: mapping.companyId,
    namespace: `${STATE_NAMESPACE}:${mapping.teamId}`,
    stateKey: "checkpoint",
  }, next);
  return next;
}

async function markSuppressWindow(
  ctx: PluginContext,
  issueId: string,
  stateKey: string,
  ttlMs: number,
): Promise<void> {
  await ctx.state.set({
    scopeKind: "issue",
    scopeId: issueId,
    namespace: STATE_NAMESPACE,
    stateKey,
  }, Date.now() + ttlMs);
}

async function getSuppressWindow(
  ctx: PluginContext,
  issueId: string,
  stateKey: string,
): Promise<number> {
  const value = await ctx.state.get({
    scopeKind: "issue",
    scopeId: issueId,
    namespace: STATE_NAMESPACE,
    stateKey,
  });
  return typeof value === "number" ? value : 0;
}

function fingerprintIssue(issue: Issue): string {
  const blocks = (issue.blocks ?? []).map((entry) => `${entry.id}:${entry.relationType}`).sort();
  const blockedBy = (issue.blockedBy ?? []).map((entry) => `${entry.id}:${entry.relationType}`).sort();
  const payload = JSON.stringify({
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    blocks,
    blockedBy,
  });
  return createHash("sha1").update(payload).digest("hex");
}

function mapPaperclipPriorityToLinear(issue: Issue): number {
  switch (issue.priority) {
    case "critical":
      return 1;
    case "high":
      return 2;
    case "low":
      return 4;
    case "medium":
    default:
      return 3;
  }
}

function mapLinearPriorityToPaperclip(priority: number | null | undefined): Issue["priority"] {
  if (priority === 1) return "critical";
  if (priority === 2) return "high";
  if (priority && priority >= 4) return "low";
  return "medium";
}

function inferSuggestedPaperclipStatusForLinearState(
  state: Pick<LinearWorkflowState, "name" | "type">,
): Issue["status"] {
  const stateType = state.type.toLowerCase();
  const stateName = state.name.toLowerCase();
  if (stateType === "completed") return "done";
  if (stateType === "canceled") return "cancelled";
  if (stateName.includes("block")) return "blocked";
  if (stateType === "backlog") return "backlog";
  if (stateType === "unstarted") return "todo";
  return "in_progress";
}

function hasExplicitStatusMappings(mapping: Pick<CompanyMappingConfig, "statusMappings">): boolean {
  return Array.isArray(mapping.statusMappings);
}

function getConfiguredPaperclipStatusForLinearState(
  mapping: Pick<CompanyMappingConfig, "statusMappings">,
  linearStateId: string,
): Issue["status"] | null {
  if (!hasExplicitStatusMappings(mapping)) return null;
  return mapping.statusMappings?.find((entry) => entry.linearStateId === linearStateId)?.paperclipStatus ?? null;
}

function mapLinearStateToPaperclipStatus(
  mapping: CompanyMappingConfig,
  remote: LinearIssue,
): Issue["status"] | null {
  if (hasExplicitStatusMappings(mapping)) {
    return getConfiguredPaperclipStatusForLinearState(mapping, remote.state.id);
  }
  const suggested = inferSuggestedPaperclipStatusForLinearState(remote.state);
  if (suggested !== "in_progress") return suggested;
  if (remote.inverseRelations.nodes.some((entry) => entry.type === "blocks")) {
    return "blocked";
  }
  return suggested;
}

function hasLocalAssignee(issue: Pick<Issue, "assigneeAgentId" | "assigneeUserId"> | null | undefined): boolean {
  return Boolean(issue?.assigneeAgentId || issue?.assigneeUserId);
}

function normalizeDesiredPullStatus(
  currentIssue: Pick<Issue, "status" | "assigneeAgentId" | "assigneeUserId"> | null,
  desiredStatus: Issue["status"],
  opts?: { forCreate?: boolean },
): Issue["status"] {
  if (desiredStatus === "in_progress" && !hasLocalAssignee(currentIssue)) {
    return "todo";
  }
  if (!opts?.forCreate && desiredStatus === "backlog" && currentIssue && currentIssue.status !== "backlog") {
    return "todo";
  }
  return desiredStatus;
}

function findStatusTransitionPath(
  from: Issue["status"],
  to: Issue["status"],
  issue: Pick<Issue, "assigneeAgentId" | "assigneeUserId">,
): Issue["status"][] | null {
  if (from === to) return [from];

  const queue: Array<{ status: Issue["status"]; path: Issue["status"][] }> = [{ status: from, path: [from] }];
  const visited = new Set<Issue["status"]>([from]);
  const allowInProgress = hasLocalAssignee(issue);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    for (const next of ISSUE_STATUS_TRANSITIONS[current.status] ?? []) {
      if (!allowInProgress && next === "in_progress") continue;
      if (visited.has(next)) continue;
      const path = [...current.path, next];
      if (next === to) return path;
      visited.add(next);
      queue.push({ status: next, path });
    }
  }

  return null;
}

async function applyPulledStatusToIssue(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issue: Issue,
  desiredStatus: Issue["status"],
  remoteIssue: LinearIssue,
): Promise<Issue> {
  const path = findStatusTransitionPath(issue.status, desiredStatus, issue);
  if (!path) {
    if (issue.status !== desiredStatus) {
      ctx.logger.warn("Linear pull kept local issue status because no valid workflow path exists", {
        companyId: mapping.companyId,
        issueId: issue.id,
        linearIssueId: remoteIssue.id,
        linearIdentifier: remoteIssue.identifier,
        currentStatus: issue.status,
        desiredStatus,
      });
    }
    return issue;
  }

  let current = issue;
  for (const nextStatus of path.slice(1)) {
    current = await ctx.issues.update(current.id, { status: nextStatus }, mapping.companyId);
  }
  return current;
}

async function getWorkflowStatesForMapping(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
): Promise<LinearWorkflowState[]> {
  const cacheKey = `${mapping.companyId}:${mapping.teamId}`;
  const cached = workflowStateCache.get(cacheKey);
  if (cached) return cached;
  const states = await listWorkflowStates(ctx, mapping);
  workflowStateCache.set(cacheKey, states);
  return states;
}

function pickWorkflowStateId(
  states: LinearWorkflowState[],
  issue: Issue,
  mapping: CompanyMappingConfig,
): string | undefined {
  if (hasExplicitStatusMappings(mapping)) {
    const configuredStateId = mapping.statusMappings
      ?.find((entry) => entry.paperclipStatus === issue.status && states.some((state) => state.id === entry.linearStateId))
      ?.linearStateId;
    if (configuredStateId) {
      return configuredStateId;
    }
  }
  if (issue.status === "blocked" && mapping.blockedStateName) {
    const explicit = states.find((entry) => entry.name.toLowerCase() === mapping.blockedStateName!.toLowerCase());
    if (explicit) return explicit.id;
  }
  const desiredType =
    issue.status === "backlog"
      ? "backlog"
      : issue.status === "todo"
        ? "unstarted"
        : issue.status === "done"
          ? "completed"
          : issue.status === "cancelled"
            ? "canceled"
            : "started";
  return states.find((entry) => entry.type.toLowerCase() === desiredType)?.id;
}

function normalizeLinearIssueRef(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("/issue/")) {
    const match = trimmed.match(/\/issue\/([^/]+)/i);
    if (match?.[1]) return match[1];
  }
  return trimmed;
}

async function ensureNoConflictingRemoteLink(
  ctx: PluginContext,
  localIssueId: string,
  linearIssueId: string,
): Promise<void> {
  const existing = await getIssueLinkByLinearIssueId(ctx, linearIssueId);
  if (existing && existing.data.paperclipIssueId !== localIssueId) {
    throw new Error(`Linear issue ${existing.data.linearIdentifier} is already linked to another Paperclip issue`);
  }
}

async function ensurePaperclipIssue(ctx: PluginContext, companyId: string, issueId: string): Promise<Issue> {
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) throw new Error(`Paperclip issue not found: ${issueId}`);
  return issue;
}

async function listPaperclipComments(ctx: PluginContext, issueId: string, companyId: string): Promise<IssueComment[]> {
  return await ctx.issues.listComments(issueId, companyId);
}

async function applyRemoteCommentsToPaperclip(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  localIssueId: string,
  remoteIssue: LinearIssue,
): Promise<void> {
  if (!mapping.syncComments) return;
  const links = await listCommentLinksForIssue(ctx, localIssueId);
  const commentIdsByExternal = new Map(links.map((entry) => [entry.data.linearCommentId, entry.data.localCommentId]));

  for (const remoteComment of remoteIssue.comments.nodes) {
    if (!remoteComment.body?.trim()) continue;
    if (commentIdsByExternal.has(remoteComment.id)) continue;
    await markSuppressWindow(ctx, localIssueId, "comment-suppress-until", 5000);
    const comment = await ctx.issues.createComment(localIssueId, remoteComment.body, mapping.companyId);
    await upsertCommentLink(ctx, {
      companyId: mapping.companyId,
      paperclipIssueId: localIssueId,
      localCommentId: comment.id,
      linearCommentId: remoteComment.id,
      linearIssueId: remoteIssue.id,
      lastSyncedAt: nowIso(),
    });
  }
}

async function ensurePaperclipIssueForRemote(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  linearIssueId: string,
  visited = new Set<string>(),
): Promise<Issue | null> {
  const linked = await getIssueLinkByLinearIssueId(ctx, linearIssueId);
  if (linked) {
    return await ensurePaperclipIssue(ctx, mapping.companyId, linked.data.paperclipIssueId);
  }
  if (!mapping.importLinearIssues) return null;
  if (visited.has(linearIssueId)) return null;
  visited.add(linearIssueId);
  const remote = await getLinearIssue(ctx, mapping, linearIssueId);
  return await syncRemoteIssueToPaperclip(ctx, mapping, remote, undefined, visited);
}

async function reconcileRemoteRelationsToPaperclip(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  localIssueId: string,
  remoteIssue: LinearIssue,
  visited = new Set<string>(),
): Promise<void> {
  const localIssue = await ensurePaperclipIssue(ctx, mapping.companyId, localIssueId);
  const desiredTargetIds = new Set<string>();

  for (const relation of remoteIssue.relations.nodes.filter((entry) => entry.type === "blocks")) {
    const targetIssue = await ensurePaperclipIssueForRemote(ctx, mapping, relation.relatedIssue.id, visited);
    if (!targetIssue) continue;
    desiredTargetIds.add(targetIssue.id);
  }

  const currentManagedTargetIds = new Set<string>();
  for (const current of localIssue.blocks ?? []) {
    const link = await getIssueLinkByLocalIssueId(ctx, current.id);
    if (link?.data.companyId === mapping.companyId) {
      currentManagedTargetIds.add(current.id);
    }
  }

  for (const targetId of desiredTargetIds) {
    if (!currentManagedTargetIds.has(targetId)) {
      await ctx.issues.addRelation(localIssueId, targetId, mapping.companyId, "blocks");
    }
  }

  for (const currentTargetId of currentManagedTargetIds) {
    if (!desiredTargetIds.has(currentTargetId)) {
      await ctx.issues.removeRelation(localIssueId, currentTargetId, mapping.companyId, "blocks");
    }
  }
}

async function syncRemoteIssueToPaperclip(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  remoteIssue: LinearIssue,
  localIssueId?: string,
  visited = new Set<string>(),
): Promise<Issue | null> {
  if (localIssueId) {
    await ensureNoConflictingRemoteLink(ctx, localIssueId, remoteIssue.id);
  }

  const mappedStatus = mapLinearStateToPaperclipStatus(mapping, remoteIssue);
  if (!mappedStatus) {
    ctx.logger.info("Skipping Linear issue because its workflow state is not mapped to a Paperclip status", {
      companyId: mapping.companyId,
      teamId: mapping.teamId,
      linearIssueId: remoteIssue.id,
      linearIdentifier: remoteIssue.identifier,
      linearStateId: remoteIssue.state.id,
      linearStateName: remoteIssue.state.name,
    });
    return null;
  }

  const linked = localIssueId
    ? await getIssueLinkByLocalIssueId(ctx, localIssueId)
    : await getIssueLinkByLinearIssueId(ctx, remoteIssue.id);
  const resolvedLocalIssueId = localIssueId || linked?.data.paperclipIssueId;

  let issue = resolvedLocalIssueId
    ? await ctx.issues.get(resolvedLocalIssueId, mapping.companyId)
    : null;

  if (!issue) {
    if (!mapping.importLinearIssues) {
      throw new Error(`Linear issue ${remoteIssue.identifier} is not linked and imports are disabled`);
    }
    const desiredStatus = normalizeDesiredPullStatus(null, mappedStatus, {
      forCreate: true,
    });
    issue = await ctx.issues.create({
      companyId: mapping.companyId,
      title: remoteIssue.title,
      description: remoteIssue.description ?? undefined,
      status: desiredStatus,
      priority: mapLinearPriorityToPaperclip(remoteIssue.priority),
    });
  }

  await markSuppressWindow(ctx, issue.id, "issue-suppress-until", 5000);
  const updatedFields = await ctx.issues.update(issue.id, {
    title: remoteIssue.title,
    description: remoteIssue.description ?? null,
    priority: mapLinearPriorityToPaperclip(remoteIssue.priority),
  }, mapping.companyId);
  const desiredStatus = normalizeDesiredPullStatus(updatedFields, mappedStatus);
  const updated = await applyPulledStatusToIssue(ctx, mapping, updatedFields, desiredStatus, remoteIssue);

  await upsertIssueLink(ctx, {
    companyId: mapping.companyId,
    teamId: mapping.teamId,
    paperclipIssueId: updated.id,
    linearIssueId: remoteIssue.id,
    linearIdentifier: remoteIssue.identifier,
    linearUrl: remoteIssue.url,
    lastPulledAt: nowIso(),
    lastSyncedAt: nowIso(),
    lastRemoteUpdatedAt: remoteIssue.updatedAt,
  });

  await applyRemoteCommentsToPaperclip(ctx, mapping, updated.id, remoteIssue);
  await reconcileRemoteRelationsToPaperclip(ctx, mapping, updated.id, remoteIssue, visited);

  const refreshed = await ensurePaperclipIssue(ctx, mapping.companyId, updated.id);
  await upsertIssueLink(ctx, {
    companyId: mapping.companyId,
    teamId: mapping.teamId,
    paperclipIssueId: refreshed.id,
    linearIssueId: remoteIssue.id,
    linearIdentifier: remoteIssue.identifier,
    linearUrl: remoteIssue.url,
    lastPulledAt: nowIso(),
    lastSyncedAt: nowIso(),
    lastRemoteUpdatedAt: remoteIssue.updatedAt,
    lastImportedFingerprint: fingerprintIssue(refreshed),
  });
  return refreshed;
}

async function ensureRemoteIssueLink(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  localIssueId: string,
  allowCreate: boolean,
  visited = new Set<string>(),
): Promise<{ issue: Issue; link: PluginEntityRecord & { data: LinearIssueLinkData }; remoteIssue: LinearIssue }> {
  if (visited.has(localIssueId)) {
    const existingLink = await getIssueLinkByLocalIssueId(ctx, localIssueId);
    if (!existingLink) throw new Error(`Circular dependency encountered before Linear link existed for ${localIssueId}`);
    const remoteIssue = await getLinearIssue(ctx, mapping, existingLink.data.linearIssueId);
    return {
      issue: await ensurePaperclipIssue(ctx, mapping.companyId, localIssueId),
      link: existingLink,
      remoteIssue,
    };
  }
  visited.add(localIssueId);

  const issue = await ensurePaperclipIssue(ctx, mapping.companyId, localIssueId);
  const existingLink = await getIssueLinkByLocalIssueId(ctx, localIssueId);
  if (existingLink) {
    const remoteIssue = await getLinearIssue(ctx, mapping, existingLink.data.linearIssueId);
    return { issue, link: existingLink, remoteIssue };
  }

  if (!allowCreate) {
    throw new Error(`Paperclip issue ${issue.title} is not linked to Linear`);
  }

  const states = await getWorkflowStatesForMapping(ctx, mapping);
  const stateId = pickWorkflowStateId(states, issue, mapping);
  const remoteIssue = await createLinearIssue(ctx, mapping, {
    title: issue.title,
    description: issue.description,
    stateId,
    priority: mapPaperclipPriorityToLinear(issue),
  });
  const link = await upsertIssueLink(ctx, {
    companyId: mapping.companyId,
    teamId: mapping.teamId,
    paperclipIssueId: issue.id,
    linearIssueId: remoteIssue.id,
    linearIdentifier: remoteIssue.identifier,
    linearUrl: remoteIssue.url,
    lastPushedAt: nowIso(),
    lastSyncedAt: nowIso(),
    lastRemoteUpdatedAt: remoteIssue.updatedAt,
  });
  await ctx.activity.log({
    companyId: mapping.companyId,
    message: `Created Linear issue ${remoteIssue.identifier} from Paperclip issue ${issue.title}`,
    entityType: "issue",
    entityId: issue.id,
    metadata: {
      linearIssueId: remoteIssue.id,
      linearIdentifier: remoteIssue.identifier,
    },
  });
  return { issue, link, remoteIssue };
}

async function reconcilePaperclipRelationsToLinear(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issue: Issue,
  remoteIssue: LinearIssue,
  visited = new Set<string>(),
): Promise<void> {
  const desiredRemoteIssueIds = new Set<string>();
  const managedLinks = await listIssueLinks(ctx);
  const managedRemoteIds = new Set(
    managedLinks
      .filter((entry) => entry.data.companyId === mapping.companyId)
      .map((entry) => entry.data.linearIssueId),
  );

  for (const relation of issue.blocks ?? []) {
    const targetLink = await ensureRemoteIssueLink(
      ctx,
      mapping,
      relation.id,
      mapping.autoCreateLinearIssues !== false,
      visited,
    ).catch(() => null);
    if (!targetLink) continue;
    desiredRemoteIssueIds.add(targetLink.link.data.linearIssueId);
  }

  const currentRelations = new Map(
    remoteIssue.relations.nodes
      .filter((entry) => entry.type === "blocks")
      .map((entry) => [entry.relatedIssue.id, entry.id]),
  );

  for (const desiredRemoteIssueId of desiredRemoteIssueIds) {
    if (!currentRelations.has(desiredRemoteIssueId)) {
      await createLinearRelation(ctx, mapping, remoteIssue.id, desiredRemoteIssueId);
    }
  }

  for (const [relatedIssueId, relationId] of currentRelations.entries()) {
    if (managedRemoteIds.has(relatedIssueId) && !desiredRemoteIssueIds.has(relatedIssueId)) {
      await deleteLinearRelation(ctx, mapping, relationId);
    }
  }
}

async function pushPaperclipIssueToLinear(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  localIssueId: string,
  allowCreate: boolean,
): Promise<LinearIssue> {
  const { issue, link } = await ensureRemoteIssueLink(ctx, mapping, localIssueId, allowCreate);
  const states = await getWorkflowStatesForMapping(ctx, mapping);
  const stateId = pickWorkflowStateId(states, issue, mapping);
  const updatedRemote = await updateLinearIssue(ctx, mapping, link.data.linearIssueId, {
    title: issue.title,
    description: issue.description,
    stateId,
    priority: mapPaperclipPriorityToLinear(issue),
  });
  await reconcilePaperclipRelationsToLinear(ctx, mapping, issue, updatedRemote);
  await upsertIssueLink(ctx, {
    ...link.data,
    linearIdentifier: updatedRemote.identifier,
    linearUrl: updatedRemote.url,
    lastPushedAt: nowIso(),
    lastSyncedAt: nowIso(),
    lastRemoteUpdatedAt: updatedRemote.updatedAt,
  });
  return updatedRemote;
}

async function pushPaperclipCommentToLinear(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issueId: string,
  commentId: string,
): Promise<void> {
  if (!mapping.syncComments) return;
  const commentLinks = await listCommentLinksForIssue(ctx, issueId);
  if (commentLinks.some((entry) => entry.data.localCommentId === commentId)) return;

  const issueLink = await ensureRemoteIssueLink(ctx, mapping, issueId, mapping.autoCreateLinearIssues !== false);
  const comments = await listPaperclipComments(ctx, issueId, mapping.companyId);
  const comment = comments.find((entry) => entry.id === commentId);
  if (!comment?.body?.trim()) return;
  const remoteComment = await createLinearComment(ctx, mapping, issueLink.link.data.linearIssueId, comment.body);
  await upsertCommentLink(ctx, {
    companyId: mapping.companyId,
    paperclipIssueId: issueId,
    localCommentId: comment.id,
    linearCommentId: remoteComment.id,
    linearIssueId: issueLink.link.data.linearIssueId,
    lastSyncedAt: nowIso(),
  });
}

async function syncCompanyFromLinear(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  options?: { full?: boolean },
): Promise<{ syncedIssues: number; lastCursor: string | null }> {
  if (!isPullEnabled(mapping)) return { syncedIssues: 0, lastCursor: null };
  const checkpoint = await getCheckpoint(ctx, mapping);
  const cursor = options?.full ? null : checkpoint.lastCursor ?? null;
  const remoteIssues = await listLinearIssuesUpdatedSince(ctx, mapping, cursor);
  let lastCursor = cursor;
  let syncedIssues = 0;

  for (const remoteIssue of remoteIssues) {
    const synced = await syncRemoteIssueToPaperclip(ctx, mapping, remoteIssue);
    if (synced) {
      syncedIssues += 1;
    }
    if (!lastCursor || remoteIssue.updatedAt > lastCursor) {
      lastCursor = remoteIssue.updatedAt;
    }
  }

  await saveCheckpoint(ctx, mapping, {
    lastRunAt: nowIso(),
    lastCursor: lastCursor ?? undefined,
    lastSuccessAt: nowIso(),
    lastError: null,
  });

  return {
    syncedIssues,
    lastCursor,
  };
}

async function handlePaperclipIssueEvent(
  ctx: PluginContext,
  companyId: string,
  issueId: string,
): Promise<void> {
  const mapping = await getMapping(ctx, companyId);
  if (!mapping || !isPushEnabled(mapping)) return;
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) return;

  const suppressUntil = await getSuppressWindow(ctx, issueId, "issue-suppress-until");
  if (suppressUntil > Date.now()) return;

  const link = await getIssueLinkByLocalIssueId(ctx, issueId);
  if (link?.data.lastImportedFingerprint && link.data.lastImportedFingerprint === fingerprintIssue(issue)) {
    return;
  }

  if (!link && mapping.autoCreateLinearIssues === false) return;
  await pushPaperclipIssueToLinear(ctx, mapping, issueId, mapping.autoCreateLinearIssues !== false);
}

async function handlePaperclipCommentEvent(
  ctx: PluginContext,
  companyId: string,
  issueId: string,
  commentId: string,
): Promise<void> {
  const mapping = await getMapping(ctx, companyId);
  if (!mapping || !isPushEnabled(mapping) || !mapping.syncComments) return;
  const suppressUntil = await getSuppressWindow(ctx, issueId, "comment-suppress-until");
  if (suppressUntil > Date.now()) return;
  await pushPaperclipCommentToLinear(ctx, mapping, issueId, commentId);
}

async function verifyWebhookSignature(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  input: PluginWebhookInput,
): Promise<void> {
  if (!mapping.webhookSecretRef) return;
  const header = input.headers["linear-signature"] ?? input.headers["Linear-Signature"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (typeof signature !== "string" || !signature) {
    throw new Error("Missing Linear-Signature header");
  }
  const secret = await ctx.secrets.resolve(mapping.webhookSecretRef);
  const expected = createHmac("sha256", secret).update(input.rawBody).digest();
  const normalized = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;
  if (!/^[a-f0-9]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Invalid Linear webhook signature format");
  }
  const actual = Buffer.from(normalized, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid Linear webhook signature");
  }
}

async function getOverviewData(ctx: PluginContext, companyId?: string | null) {
  const companies = await ctx.companies.list({ limit: 500, offset: 0 });
  const config = await getConfig(ctx);
  const allLinks = await listIssueLinks(ctx);

  const summaries = await Promise.all(config.companyMappings?.map(async (mapping) => {
    const company = companies.find((entry) => entry.id === mapping.companyId) ?? null;
    const checkpoint = await getCheckpoint(ctx, mapping);
    const linkedIssues = allLinks.filter((entry) => entry.data.companyId === mapping.companyId).length;
    return {
      companyId: mapping.companyId,
      companyName: company?.name ?? mapping.companyId,
      teamId: mapping.teamId,
      syncDirection: mapping.syncDirection ?? "bidirectional",
      linkedIssues,
      lastSuccessAt: checkpoint.lastSuccessAt ?? null,
      lastRunAt: checkpoint.lastRunAt ?? null,
      lastError: checkpoint.lastError ?? null,
      lastCursor: checkpoint.lastCursor ?? null,
    };
  }) ?? []);

  return {
    pluginId: PLUGIN_ID,
    pageRoute: PAGE_ROUTE,
    activeCompanyId: companyId ?? null,
    companyCount: summaries.length,
    linkedIssueCount: allLinks.length,
    companies: summaries,
  };
}

async function getIssueLinkData(ctx: PluginContext, companyId: string, issueId: string) {
  const mapping = await getMapping(ctx, companyId);
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) throw new Error("Issue not found");
  const link = await getIssueLinkByLocalIssueId(ctx, issueId);
  return {
    issueId,
    issueTitle: issue.title,
    companyId,
    mappingConfigured: !!mapping,
    syncDirection: mapping?.syncDirection ?? "bidirectional",
    autoCreateLinearIssues: mapping?.autoCreateLinearIssues !== false,
    syncComments: mapping?.syncComments !== false,
    linked: !!link,
    link: link?.data ?? null,
    blocks: issue.blocks ?? [],
    blockedBy: issue.blockedBy ?? [],
  };
}

const plugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;

    ctx.events.on("issue.created", async (event) => {
      if (!event.companyId || !event.entityId) return;
      await handlePaperclipIssueEvent(ctx, event.companyId, event.entityId);
    });

    ctx.events.on("issue.updated", async (event) => {
      if (!event.companyId || !event.entityId) return;
      await handlePaperclipIssueEvent(ctx, event.companyId, event.entityId);
    });

    ctx.events.on("issue.comment.created", async (event) => {
      if (!event.companyId) return;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const issueId = typeof payload.issueId === "string" ? payload.issueId : event.entityId;
      const commentId = typeof payload.commentId === "string"
        ? payload.commentId
        : typeof payload.id === "string"
          ? payload.id
          : event.entityId;
      if (!issueId || !commentId) return;
      await handlePaperclipCommentEvent(ctx, event.companyId, issueId, commentId);
    });

    ctx.jobs.register(JOB_KEYS.poll, async () => {
      const config = await getConfig(ctx);
      for (const mapping of config.companyMappings ?? []) {
        if (!isPullEnabled(mapping)) continue;
        try {
          await syncCompanyFromLinear(ctx, mapping);
        } catch (error) {
          await saveCheckpoint(ctx, mapping, {
            lastRunAt: nowIso(),
            lastError: summarizeError(error),
          });
          ctx.logger.error("Linear pull failed", {
            companyId: mapping.companyId,
            teamId: mapping.teamId,
            error: summarizeError(error),
          });
        }
      }
    });

    ctx.data.register("plugin-config", async () => {
      return await getConfig(ctx);
    });

    ctx.data.register("overview", async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : null;
      return await getOverviewData(ctx, companyId);
    });

    ctx.data.register("team-options", async (params) => {
      const companyId = String(params.companyId ?? "");
      if (!companyId) throw new Error("companyId is required");
      const company = await ctx.companies.get(companyId);
      if (!company) throw new Error("Paperclip company not found");
      const mapping = await getStoredMapping(ctx, companyId);
      if (!mapping?.apiTokenSecretRef) {
        throw new Error("Save a Linear API key before loading teams");
      }
      clearAuthHeaderCache(mapping.apiTokenSecretRef);
      const identifier = company.issuePrefix.trim().toUpperCase();
      const teams = await listLinearTeams(ctx, mapping);
      return {
        companyId,
        identifier,
        totalTeamCount: teams.length,
        teams: teams.filter((team) => team.key.trim().toUpperCase() === identifier),
      };
    });

    ctx.data.register("workflow-state-options", async (params) => {
      const companyId = String(params.companyId ?? "");
      const teamId = String(params.teamId ?? "");
      if (!companyId) throw new Error("companyId is required");
      if (!teamId) throw new Error("teamId is required");
      const stored = await getStoredMapping(ctx, companyId);
      if (!stored?.apiTokenSecretRef) {
        throw new Error("Save a Linear API key before loading workflow states");
      }
      const states = await listWorkflowStates(ctx, {
        companyId,
        teamId,
        apiTokenSecretRef: stored.apiTokenSecretRef,
        graphqlUrl: stored.graphqlUrl,
      });
      return {
        companyId,
        teamId,
        states: states.map((state) => ({
          ...state,
          recommendedPaperclipStatus: inferSuggestedPaperclipStatusForLinearState(state),
        })),
      };
    });

    ctx.data.register("issue-link", async (params) => {
      const companyId = String(params.companyId ?? "");
      const issueId = String(params.issueId ?? "");
      if (!companyId || !issueId) throw new Error("companyId and issueId are required");
      return await getIssueLinkData(ctx, companyId, issueId);
    });

    ctx.actions.register("resync-company", async (params) => {
      const companyId = String(params.companyId ?? "");
      if (!companyId) throw new Error("companyId is required");
      const mapping = await getMapping(ctx, companyId);
      if (!mapping) throw new Error("No Linear mapping configured for this company");
      return await syncCompanyFromLinear(ctx, mapping, {
        full: params.full === true,
      });
    });

    ctx.actions.register("create-linear-issue", async (params) => {
      const companyId = String(params.companyId ?? "");
      const issueId = String(params.issueId ?? "");
      if (!companyId || !issueId) throw new Error("companyId and issueId are required");
      const mapping = await getMapping(ctx, companyId);
      if (!mapping) throw new Error("No Linear mapping configured for this company");
      const remote = await pushPaperclipIssueToLinear(ctx, mapping, issueId, true);
      return {
        linearIssueId: remote.id,
        linearIdentifier: remote.identifier,
        linearUrl: remote.url,
      };
    });

    ctx.actions.register("push-issue", async (params) => {
      const companyId = String(params.companyId ?? "");
      const issueId = String(params.issueId ?? "");
      if (!companyId || !issueId) throw new Error("companyId and issueId are required");
      const mapping = await getMapping(ctx, companyId);
      if (!mapping) throw new Error("No Linear mapping configured for this company");
      const remote = await pushPaperclipIssueToLinear(ctx, mapping, issueId, mapping.autoCreateLinearIssues !== false);
      return {
        linearIssueId: remote.id,
        linearIdentifier: remote.identifier,
        linearUrl: remote.url,
      };
    });

    ctx.actions.register("pull-issue", async (params) => {
      const companyId = String(params.companyId ?? "");
      const issueId = String(params.issueId ?? "");
      if (!companyId || !issueId) throw new Error("companyId and issueId are required");
      const mapping = await getMapping(ctx, companyId);
      if (!mapping) throw new Error("No Linear mapping configured for this company");
      const link = await getIssueLinkByLocalIssueId(ctx, issueId);
      if (!link) throw new Error("Issue is not linked to Linear");
      const remote = await getLinearIssue(ctx, mapping, link.data.linearIssueId);
      const local = await syncRemoteIssueToPaperclip(ctx, mapping, remote, issueId);
      if (!local) {
        throw new Error(`Linear workflow state "${remote.state.name}" is not mapped to a Paperclip status`);
      }
      return {
        issueId: local.id,
        linearIssueId: remote.id,
        linearIdentifier: remote.identifier,
      };
    });

    ctx.actions.register("link-linear-issue", async (params) => {
      const companyId = String(params.companyId ?? "");
      const issueId = String(params.issueId ?? "");
      const linearRef = normalizeLinearIssueRef(String(params.linearIssueRef ?? ""));
      if (!companyId || !issueId || !linearRef) throw new Error("companyId, issueId, and linearIssueRef are required");
      const mapping = await getMapping(ctx, companyId);
      if (!mapping) throw new Error("No Linear mapping configured for this company");
      const remote = await getLinearIssueByRef(ctx, mapping, linearRef);
      await ensureNoConflictingRemoteLink(ctx, issueId, remote.id);
      const local = await syncRemoteIssueToPaperclip(ctx, mapping, remote, issueId);
      if (!local) {
        throw new Error(`Linear workflow state "${remote.state.name}" is not mapped to a Paperclip status`);
      }
      return {
        issueId: local.id,
        linearIssueId: remote.id,
        linearIdentifier: remote.identifier,
        linearUrl: remote.url,
      };
    });

    ctx.actions.register("unlink-linear-issue", async (params) => {
      const companyId = String(params.companyId ?? "");
      const issueId = String(params.issueId ?? "");
      if (!companyId || !issueId) throw new Error("companyId and issueId are required");
      const link = await getIssueLinkByLocalIssueId(ctx, issueId);
      if (!link) return { unlinked: false };
      await upsertIssueLink(ctx, {
        ...link.data,
        unlinkedAt: nowIso(),
        lastSyncedAt: nowIso(),
      });
      return { unlinked: true };
    });
  },

  async onValidateConfig(config) {
    const normalized = normalizeConfig(config as Record<string, unknown>);
    const seenCompanies = new Set<string>();
    const errors: string[] = [];
    for (const mapping of normalized.companyMappings ?? []) {
      if (seenCompanies.has(mapping.companyId)) {
        errors.push(`Duplicate company mapping for ${mapping.companyId}`);
      }
      seenCompanies.add(mapping.companyId);
      if (!["pull", "push", "bidirectional"].includes(mapping.syncDirection ?? "bidirectional")) {
        errors.push(`Invalid sync direction for ${mapping.companyId}`);
      }
      const seenLinearStates = new Set<string>();
      for (const statusMapping of mapping.statusMappings ?? []) {
        if (seenLinearStates.has(statusMapping.linearStateId)) {
          errors.push(`Duplicate Linear workflow state mapping for ${mapping.companyId}:${statusMapping.linearStateId}`);
        }
        seenLinearStates.add(statusMapping.linearStateId);
        if (!ISSUE_STATUSES.includes(statusMapping.paperclipStatus)) {
          errors.push(`Invalid Paperclip status mapping for ${mapping.companyId}:${statusMapping.linearStateId}`);
        }
      }
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  },

  async onWebhook(input) {
    if (!currentContext || input.endpointKey !== WEBHOOK_KEYS.linear) return;
    const ctx = currentContext;
    const body = (input.parsedBody ?? {}) as Record<string, unknown>;
    const data = (body.data ?? {}) as Record<string, unknown>;
    const teamId = typeof data.teamId === "string" ? data.teamId : "";
    const remoteIssueId = typeof data.id === "string" ? data.id : "";
    const action = typeof body.action === "string" ? body.action : "";
    const type = typeof body.type === "string" ? body.type : "";
    if (type !== "Issue" || !remoteIssueId || !teamId || !["create", "update"].includes(action)) {
      return;
    }

    const config = await getConfig(ctx);
    const mapping = config.companyMappings?.find((entry) => entry.teamId === teamId) ?? null;
    if (!mapping) return;
    await verifyWebhookSignature(ctx, mapping, input);
    const remote = await getLinearIssue(ctx, mapping, remoteIssueId);
    await syncRemoteIssueToPaperclip(ctx, mapping, remote);
    await saveCheckpoint(ctx, mapping, {
      lastWebhookAt: nowIso(),
      lastSuccessAt: nowIso(),
      lastError: null,
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: "Linear sync worker ready",
      details: {
        workflowStateCacheSize: workflowStateCache.size,
      },
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
