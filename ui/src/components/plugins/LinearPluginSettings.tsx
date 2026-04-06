import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { ISSUE_STATUSES, type CompanySecret, type IssueStatus, type PluginJobRecord } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { pluginsApi } from "@/api/plugins";
import { secretsApi } from "@/api/secrets";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const LINEAR_PLUGIN_KEY = "paperclip.linear";
const LINEAR_POLL_JOB_KEY = "poll-linear";

type LinearSyncDirection = "pull" | "push" | "bidirectional";
type LinearStatusSyncMode = "disabled" | "pull" | "push" | "bidirectional";

type LinearStatusMappingFormState = {
  linearStateId: string;
  syncMode: LinearStatusSyncMode;
  paperclipStatus: IssueStatus | "";
};

type LinearMappingFormState = {
  companyId: string;
  teamId: string;
  apiTokenSecretRef: string;
  apiKeyInput: string;
  syncDirection: LinearSyncDirection;
  forceMatchIdentifier: boolean;
  importLinearIssues: boolean;
  autoCreateLinearIssues: boolean;
  syncComments: boolean;
  blockedStateName: string;
  statusMappings: LinearStatusMappingFormState[];
  statusMappingsConfigured: boolean;
};

type PersistedLinearMapping = {
  companyId: string;
  teamId: string;
  apiTokenSecretRef: string;
  syncDirection: LinearSyncDirection;
  forceMatchIdentifier: boolean;
  importLinearIssues: boolean;
  autoCreateLinearIssues: boolean;
  syncComments: boolean;
  blockedStateName: string;
  statusMappings: Array<{
    linearStateId: string;
    paperclipStatus: IssueStatus;
    syncMode?: Exclude<LinearStatusSyncMode, "disabled">;
  }>;
};

interface LinearPluginSettingsProps {
  pluginId: string;
  initialValues?: Record<string, unknown>;
  isLoading?: boolean;
  pluginStatus?: string;
}

type LinearCompanySummary = {
  companyId: string;
  companyName: string;
  teamId: string;
  syncDirection: string;
  linkedIssues: number;
  linkedProjects: number;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  lastCursor: string | null;
};

type LinearOverviewData = {
  companies: LinearCompanySummary[];
  linkedProjectCount?: number;
};

type LinearSyncActivityItem = {
  id: string;
  occurredAt: string;
  direction: "pull" | "push";
  result: "success" | "failure";
  runType: "incremental" | "full" | "manual" | "automatic";
  message: string;
  linearIssueId?: string | null;
  linearIdentifier?: string | null;
  linearTitle?: string | null;
  linearProjectName?: string | null;
  paperclipIssueId?: string | null;
  paperclipIssueIdentifier?: string | null;
};

type LinearSyncActivityData = {
  activeCompanyId: string | null;
  companyCount: number;
  activityCount: number;
  companies: Array<{
    companyId: string;
    companyName: string;
    teamId: string;
    recentActivity: LinearSyncActivityItem[];
  }>;
};

type LinearTeamSummary = {
  id: string;
  key: string;
  name: string;
};

type LinearTeamOptionsData = {
  companyId: string;
  identifier: string;
  totalTeamCount: number;
  teams: LinearTeamSummary[];
};

type LinearWorkflowStateOption = {
  id: string;
  name: string;
  type: string;
  recommendedPaperclipStatus: IssueStatus;
};

type LinearWorkflowStateOptionsData = {
  companyId: string;
  teamId: string;
  states: LinearWorkflowStateOption[];
};

type LinearDryRunResult = {
  companyId: string;
  full: boolean;
  issueCount: number;
  projectCount: number;
  skippedUnmappedIssueCount: number;
  blockedImportIssueCount: number;
  lastCursor: string | null;
  generatedAt: string;
};

const PAPERCLIP_STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  testing: "Testing",
  human_review: "Human Review",
  rework: "Rework",
  merging: "Merging",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const STATUS_SYNC_MODE_LABELS: Record<LinearStatusSyncMode, string> = {
  bidirectional: "Two-way",
  pull: "Pull only",
  push: "Push only",
  disabled: "Do not sync",
};

function normalizeStatusSyncMode(value: unknown, fallback: LinearStatusSyncMode = "bidirectional"): LinearStatusSyncMode {
  return value === "disabled" || value === "pull" || value === "push" || value === "bidirectional"
    ? value
    : fallback;
}

function isStatusMappingPullEnabled(mapping: Pick<LinearStatusMappingFormState, "syncMode">): boolean {
  return mapping.syncMode === "pull" || mapping.syncMode === "bidirectional";
}

function isStatusMappingPushEnabled(mapping: Pick<LinearStatusMappingFormState, "syncMode">): boolean {
  return mapping.syncMode === "push" || mapping.syncMode === "bidirectional";
}

function createEmptyMapping(defaultCompanyId: string | null): LinearMappingFormState {
  return {
    companyId: defaultCompanyId ?? "",
    teamId: "",
    apiTokenSecretRef: "",
    apiKeyInput: "",
    syncDirection: "bidirectional",
    forceMatchIdentifier: false,
    importLinearIssues: true,
    autoCreateLinearIssues: true,
    syncComments: true,
    blockedStateName: "",
    statusMappings: [],
    statusMappingsConfigured: false,
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseMappings(
  initialValues: Record<string, unknown> | undefined,
  defaultCompanyId: string | null,
): LinearMappingFormState[] {
  const rawMappings = Array.isArray(initialValues?.companyMappings)
    ? initialValues.companyMappings
    : [];

  const mappings = rawMappings
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry): LinearMappingFormState => ({
      companyId: normalizeString(entry.companyId),
      teamId: normalizeString(entry.teamId),
      apiTokenSecretRef: normalizeString(entry.apiTokenSecretRef),
      apiKeyInput: "",
      syncDirection:
        entry.syncDirection === "pull" || entry.syncDirection === "push" || entry.syncDirection === "bidirectional"
          ? entry.syncDirection
          : "bidirectional",
      forceMatchIdentifier: entry.forceMatchIdentifier === true,
      importLinearIssues: entry.importLinearIssues !== false,
      autoCreateLinearIssues: entry.autoCreateLinearIssues !== false,
      syncComments: entry.syncComments !== false,
      blockedStateName: normalizeString(entry.blockedStateName),
      statusMappings: Array.isArray(entry.statusMappings)
        ? entry.statusMappings
            .filter((mapping): mapping is Record<string, unknown> => Boolean(mapping) && typeof mapping === "object")
            .map((mapping) => ({
              linearStateId: normalizeString(mapping.linearStateId),
              syncMode: normalizeStatusSyncMode(
                mapping.syncMode,
                normalizeString(mapping.paperclipStatus) ? "bidirectional" : "disabled",
              ),
              paperclipStatus: normalizeString(mapping.paperclipStatus) as IssueStatus | "",
            }))
            .filter((mapping) => mapping.linearStateId)
        : [],
      statusMappingsConfigured: Array.isArray(entry.statusMappings),
    }));

  return mappings.length > 0 ? mappings : [createEmptyMapping(defaultCompanyId)];
}

function toPersistedMappings(mappings: LinearMappingFormState[]): PersistedLinearMapping[] {
  return mappings.map((mapping) => ({
    companyId: mapping.companyId,
    teamId: mapping.teamId,
    apiTokenSecretRef: mapping.apiTokenSecretRef,
    syncDirection: mapping.syncDirection,
    forceMatchIdentifier: mapping.forceMatchIdentifier,
    importLinearIssues: mapping.importLinearIssues,
    autoCreateLinearIssues: mapping.autoCreateLinearIssues,
    syncComments: mapping.syncComments,
    blockedStateName: mapping.blockedStateName.trim(),
    statusMappings: mapping.statusMappings
      .filter(
        (
          statusMapping,
        ): statusMapping is { linearStateId: string; paperclipStatus: IssueStatus; syncMode: Exclude<LinearStatusSyncMode, "disabled"> } =>
          Boolean(statusMapping.linearStateId && statusMapping.paperclipStatus && statusMapping.syncMode !== "disabled"),
      )
      .sort((left, right) => left.linearStateId.localeCompare(right.linearStateId)),
  }));
}

function serializeMappings(mappings: LinearMappingFormState[]): string {
  return JSON.stringify(toPersistedMappings(mappings));
}

function serializeDraftMappings(mappings: LinearMappingFormState[]): string {
  return JSON.stringify(
    mappings.map((mapping) => ({
      ...toPersistedMappings([mapping])[0],
      apiKeyInput: mapping.apiKeyInput.trim(),
    })),
  );
}

function validationErrors(
  mappings: LinearMappingFormState[],
  knownCompanyIds: Set<string>,
  allowedTeamIdsByMapping: Array<Set<string> | null>,
): string[] {
  const errors: string[] = [];
  const seenCompanies = new Set<string>();

  mappings.forEach((mapping, index) => {
    const label = `Mapping ${index + 1}`;
    if (!mapping.companyId) {
      errors.push(`${label}: select a Paperclip company.`);
    } else if (!knownCompanyIds.has(mapping.companyId)) {
      errors.push(`${label}: selected company no longer exists.`);
    } else if (seenCompanies.has(mapping.companyId)) {
      errors.push(`${label}: each Paperclip company can only be mapped once.`);
    } else {
      seenCompanies.add(mapping.companyId);
    }

    if (!mapping.apiTokenSecretRef && !mapping.apiKeyInput.trim()) {
      errors.push(`${label}: add a Linear API key.`);
    }

    const allowedTeamIds = allowedTeamIdsByMapping[index];
    if (mapping.teamId.trim() && allowedTeamIds && !allowedTeamIds.has(mapping.teamId.trim())) {
      errors.push(`${label}: choose a Linear team whose identifier matches the Paperclip company.`);
    }

    const seenPushStatuses = new Set<IssueStatus>();
    for (const statusMapping of mapping.statusMappings) {
      if (statusMapping.syncMode === "disabled") continue;
      if (!statusMapping.paperclipStatus) {
        errors.push(`${label}: choose a Paperclip status for every Linear status that is enabled for sync.`);
        continue;
      }
      if (isStatusMappingPushEnabled(statusMapping)) {
        if (seenPushStatuses.has(statusMapping.paperclipStatus)) {
          errors.push(`${label}: each Paperclip status can only have one push-enabled Linear status target.`);
          break;
        }
        seenPushStatuses.add(statusMapping.paperclipStatus);
      }
    }

  });

  return errors;
}

function formatTimestamp(value?: string | Date | null): string {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (typeof value === "string") return value;
    return value.toISOString();
  }
  return date.toLocaleString();
}

function normalizeStatusMappingsForStates(
  currentMappings: LinearStatusMappingFormState[],
  states: LinearWorkflowStateOption[],
  useRecommendations: boolean,
): LinearStatusMappingFormState[] {
  const currentByStateId = new Map(currentMappings.map((mapping) => [mapping.linearStateId, mapping]));
  const seenPushStatuses = new Set<IssueStatus>();

  return states.map((state) => {
    const current = currentByStateId.get(state.id);
    if (current) {
      if (current.paperclipStatus && isStatusMappingPushEnabled(current)) {
        seenPushStatuses.add(current.paperclipStatus);
      }
      return current;
    }
    const recommendedStatus = state.recommendedPaperclipStatus;
    const defaultSyncMode = useRecommendations
      ? seenPushStatuses.has(recommendedStatus)
        ? "pull"
        : "bidirectional"
      : "disabled";
    if (defaultSyncMode !== "pull" && defaultSyncMode !== "disabled") {
      seenPushStatuses.add(recommendedStatus);
    }
    return {
      linearStateId: state.id,
      syncMode: defaultSyncMode,
      paperclipStatus: useRecommendations ? recommendedStatus : "",
    };
  });
}

export function LinearPluginSettings({
  pluginId,
  initialValues,
  isLoading,
  pluginStatus,
}: LinearPluginSettingsProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { companies, selectedCompanyId } = useCompany();
  const selectableCompanies = useMemo(
    () => companies.filter((company) => company.status !== "archived"),
    [companies],
  );
  const companyById = useMemo(
    () => new Map(selectableCompanies.map((company) => [company.id, company])),
    [selectableCompanies],
  );
  const knownCompanyIds = useMemo(
    () => new Set(selectableCompanies.map((company) => company.id)),
    [selectableCompanies],
  );
  const defaultCompanyId = selectedCompanyId ?? selectableCompanies[0]?.id ?? null;

  const initialMappings = useMemo(
    () => parseMappings(initialValues, defaultCompanyId),
    [defaultCompanyId, initialValues],
  );
  const initialSignature = useMemo(() => serializeDraftMappings(initialMappings), [initialMappings]);

  const [mappings, setMappings] = useState<LinearMappingFormState[]>(initialMappings);
  const [lastAppliedSignature, setLastAppliedSignature] = useState(initialSignature);
  const [formMessage, setFormMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [dryRunResults, setDryRunResults] = useState<Record<string, LinearDryRunResult>>({});
  const hydratedRef = useRef(false);

  const isDirty = useMemo(
    () => serializeDraftMappings(mappings) !== lastAppliedSignature,
    [lastAppliedSignature, mappings],
  );

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      setMappings(initialMappings);
      setLastAppliedSignature(initialSignature);
      return;
    }

    if (!isDirty && initialSignature !== lastAppliedSignature) {
      setMappings(initialMappings);
      setLastAppliedSignature(initialSignature);
    }
  }, [initialMappings, initialSignature, isDirty, lastAppliedSignature]);

  useEffect(() => {
    setDryRunResults({});
  }, [mappings]);

  const mappedCompanyIds = useMemo(
    () => Array.from(new Set(mappings.map((mapping) => mapping.companyId).filter(Boolean))),
    [mappings],
  );
  const secretQueries = useQueries({
    queries: mappedCompanyIds.map((companyId) => ({
      queryKey: queryKeys.secrets.list(companyId),
      queryFn: () => secretsApi.list(companyId),
      enabled: Boolean(companyId),
    })),
  });

  const secretsByCompanyId = useMemo(() => {
    const map = new Map<string, CompanySecret[]>();
    mappedCompanyIds.forEach((companyId, index) => {
      map.set(companyId, secretQueries[index]?.data ?? []);
    });
    return map;
  }, [mappedCompanyIds, secretQueries]);
  const pluginReady = pluginStatus === "ready";

  const teamOptionQueries = useQueries({
    queries: mappings.map((mapping) => ({
      queryKey: [
        "plugins",
        pluginId,
        "linear-team-options",
        mapping.companyId || "__none__",
        mapping.apiTokenSecretRef || "__no-secret__",
      ] as const,
      queryFn: async () => {
        const response = await pluginsApi.bridgeGetData(
          pluginId,
          "team-options",
          { companyId: mapping.companyId },
          mapping.companyId,
        );
        return response.data as LinearTeamOptionsData;
      },
      enabled: pluginReady && Boolean(mapping.companyId && mapping.apiTokenSecretRef),
      staleTime: 60_000,
    })),
  });

  const allowedTeamIdsByMapping = useMemo(
    () =>
      teamOptionQueries.map((query) =>
        query.data ? new Set(query.data.teams.map((team) => team.id)) : null,
      ),
    [teamOptionQueries],
  );

  const workflowStateQueries = useQueries({
    queries: mappings.map((mapping, index) => {
      const allowedTeamIds = allowedTeamIdsByMapping[index];
      const teamIsAllowed = Boolean(mapping.teamId && allowedTeamIds?.has(mapping.teamId));
      return {
        queryKey: [
          "plugins",
          pluginId,
          "linear-workflow-state-options",
          mapping.companyId || "__none__",
          mapping.teamId || "__none__",
          mapping.apiTokenSecretRef || "__no-secret__",
        ] as const,
        queryFn: async () => {
          const response = await pluginsApi.bridgeGetData(
            pluginId,
            "workflow-state-options",
            { companyId: mapping.companyId, teamId: mapping.teamId },
            mapping.companyId,
          );
          return response.data as LinearWorkflowStateOptionsData;
        },
        enabled: pluginReady && Boolean(mapping.companyId && mapping.apiTokenSecretRef && teamIsAllowed),
        staleTime: 60_000,
      };
    }),
  });

  useEffect(() => {
    setMappings((current) => {
      let changed = false;
      const next = current.map((mapping, index) => {
        const states = workflowStateQueries[index]?.data?.states;
        if (!states?.length) return mapping;
        const normalizedStatusMappings = normalizeStatusMappingsForStates(
          mapping.statusMappings,
          states,
          !mapping.statusMappingsConfigured,
        );
        if (JSON.stringify(normalizedStatusMappings) === JSON.stringify(mapping.statusMappings)) {
          return mapping;
        }
        changed = true;
        return {
          ...mapping,
          statusMappings: normalizedStatusMappings,
        };
      });
      return changed ? next : current;
    });
  }, [workflowStateQueries]);

  const hasBlockingWorkflowStateSetup = useMemo(
    () =>
      mappings.some((mapping, index) => {
        const allowedTeamIds = allowedTeamIdsByMapping[index];
        if (!mapping.teamId.trim() || !allowedTeamIds?.has(mapping.teamId.trim())) return false;
        const query = workflowStateQueries[index];
        return !query?.data || Boolean(query.error) || query.isPending;
      }),
    [allowedTeamIdsByMapping, mappings, workflowStateQueries],
  );

  const errors = useMemo(
    () => validationErrors(mappings, knownCompanyIds, allowedTeamIdsByMapping),
    [allowedTeamIdsByMapping, knownCompanyIds, mappings],
  );

  const { data: jobsData } = useQuery({
    queryKey: queryKeys.plugins.jobs(pluginId),
    queryFn: async () => await pluginsApi.jobs(pluginId),
    refetchInterval: pluginReady ? 30000 : false,
  });

  const pollJob = useMemo(
    () => jobsData?.find((job) => job.jobKey === LINEAR_POLL_JOB_KEY) ?? null,
    [jobsData],
  );
  const syncJobActive = pollJob?.status === "active";

  const { data: overviewData } = useQuery({
    queryKey: ["plugins", pluginId, "linear-overview", selectedCompanyId ?? "__instance__"],
    queryFn: async () => {
      const response = await pluginsApi.bridgeGetData(pluginId, "overview", undefined, selectedCompanyId ?? null);
      return response.data as LinearOverviewData;
    },
    enabled: pluginReady,
    refetchInterval: pluginReady ? 30000 : false,
  });

  const overviewByCompanyId = useMemo(
    () => new Map((overviewData?.companies ?? []).map((company) => [company.companyId, company])),
    [overviewData],
  );

  const updateMapping = useCallback(
    (index: number, updater: (mapping: LinearMappingFormState) => LinearMappingFormState) => {
      setMappings((current) =>
        current.map((mapping, mappingIndex) =>
          mappingIndex === index ? updater(mapping) : mapping,
        ),
      );
      setFormMessage(null);
    },
    [],
  );

  const nextDefaultCompanyId = useMemo(() => {
    const used = new Set(mappings.map((mapping) => mapping.companyId).filter(Boolean));
    if (selectedCompanyId && !used.has(selectedCompanyId)) return selectedCompanyId;
    return selectableCompanies.find((company) => !used.has(company.id))?.id ?? defaultCompanyId;
  }, [defaultCompanyId, mappings, selectableCompanies, selectedCompanyId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextMappings: LinearMappingFormState[] = [];
      const configMappings: Array<Record<string, unknown>> = [];
      const touchedCompanyIds = new Set<string>();

      for (const mapping of mappings) {
        touchedCompanyIds.add(mapping.companyId);
        const company = companyById.get(mapping.companyId);

        let apiTokenSecretRef = mapping.apiTokenSecretRef;
        const apiKeyValue = mapping.apiKeyInput.trim();
        if (apiKeyValue) {
          if (apiTokenSecretRef) {
            await secretsApi.rotate(apiTokenSecretRef, { value: apiKeyValue });
          } else {
            const created = await secretsApi.create(mapping.companyId, {
              name: `Linear API key (${company?.name ?? mapping.companyId})`,
              value: apiKeyValue,
              description: "Used by the Linear Sync plugin for the Linear GraphQL API.",
            });
            apiTokenSecretRef = created.id;
          }
        }

        const configMapping: Record<string, unknown> = {
          companyId: mapping.companyId,
          apiTokenSecretRef,
          syncDirection: mapping.syncDirection,
          forceMatchIdentifier: mapping.forceMatchIdentifier,
          importLinearIssues: mapping.importLinearIssues,
          autoCreateLinearIssues: mapping.autoCreateLinearIssues,
          syncComments: mapping.syncComments,
        };

        const teamId = mapping.teamId.trim();
        if (teamId) {
          configMapping.teamId = teamId;
          configMapping.statusMappings = mapping.statusMappings
            .filter(
              (statusMapping) =>
                statusMapping.linearStateId &&
                statusMapping.paperclipStatus &&
                statusMapping.syncMode !== "disabled",
            )
            .map((statusMapping) => ({
              linearStateId: statusMapping.linearStateId,
              paperclipStatus: statusMapping.paperclipStatus,
              syncMode: statusMapping.syncMode,
            }));
        }

        const blockedStateName = mapping.blockedStateName.trim();
        if (blockedStateName) {
          configMapping.blockedStateName = blockedStateName;
        }

        configMappings.push(configMapping);
        nextMappings.push({
          ...mapping,
          apiTokenSecretRef,
          apiKeyInput: "",
          statusMappingsConfigured: Boolean(mapping.teamId.trim()),
        });
      }

      await pluginsApi.saveConfig(pluginId, { companyMappings: configMappings });
      return {
        nextMappings,
        touchedCompanyIds: Array.from(touchedCompanyIds),
      };
    },
    onSuccess: ({ nextMappings, touchedCompanyIds }) => {
      setMappings(nextMappings);
      setLastAppliedSignature(serializeDraftMappings(nextMappings));
      setFormMessage({ tone: "success", text: "Linear settings saved." });
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.config(pluginId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.detail(pluginId) });
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-overview"] });
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-team-options"] });
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-workflow-state-options"] });
      touchedCompanyIds.forEach((companyId) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(companyId) });
      });
      pushToast({ title: "Linear settings saved", tone: "success" });
    },
    onError: (error: Error) => {
      setFormMessage({ tone: "error", text: error.message || "Failed to save Linear settings." });
      pushToast({
        title: "Failed to save Linear settings",
        body: error.message,
        tone: "error",
      });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async ({ companyId, full }: { companyId: string; full: boolean }) => {
      const response = await pluginsApi.bridgePerformAction(
        pluginId,
        "resync-company",
        { companyId, full },
        companyId,
      );
      return response.data as { syncedIssues?: number; failedIssues?: number; lastCursor?: string | null; lastError?: string | null };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-overview"] });
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-sync-activity"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.dashboard(pluginId) });
      const companyName = companyById.get(variables.companyId)?.name ?? "Company";
      pushToast({
        title: variables.full ? "Full Linear resync finished" : "Linear pull finished",
        body:
          result.failedIssues && result.failedIssues > 0
            ? `${companyName}: ${result.syncedIssues ?? 0} issue${result.syncedIssues === 1 ? "" : "s"} synced, ${result.failedIssues} failed. Review Status for details.`
            : `${companyName}: ${result.syncedIssues ?? 0} issue${result.syncedIssues === 1 ? "" : "s"} synced.`,
        tone: result.failedIssues && result.failedIssues > 0 ? "warn" : "success",
      });
    },
    onError: (error: Error) => {
      pushToast({
        title: "Linear sync failed",
        body: error.message,
        tone: "error",
      });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: async ({ companyId, full }: { companyId: string; full: boolean }) => {
      const response = await pluginsApi.bridgePerformAction(
        pluginId,
        "dry-run-sync",
        { companyId, full },
        companyId,
      );
      return response.data as LinearDryRunResult;
    },
    onSuccess: (result, variables) => {
      setDryRunResults((current) => ({
        ...current,
        [variables.companyId]: result,
      }));
      const companyName = companyById.get(variables.companyId)?.name ?? "Company";
      pushToast({
        title: "Linear dry run complete",
        body: `${companyName}: would pull ${result.issueCount} issue${result.issueCount === 1 ? "" : "s"} across ${result.projectCount} project${result.projectCount === 1 ? "" : "s"}.`,
        tone: "success",
      });
    },
    onError: (error: Error) => {
      pushToast({
        title: "Linear dry run failed",
        body: error.message,
        tone: "error",
      });
    },
  });

  const resetCursorMutation = useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      const response = await pluginsApi.bridgePerformAction(
        pluginId,
        "reset-sync-cursor",
        { companyId },
        companyId,
      );
      return response.data as { companyId: string; lastCursor: string | null };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-overview"] });
      queryClient.invalidateQueries({ queryKey: ["plugins", pluginId, "linear-sync-activity"] });
      const companyName = companyById.get(variables.companyId)?.name ?? "Company";
      setDryRunResults((current) => {
        const next = { ...current };
        delete next[variables.companyId];
        return next;
      });
      pushToast({
        title: "Linear cursor reset",
        body: `${companyName}: the next incremental pull will start from the beginning.`,
        tone: "success",
      });
    },
    onError: (error: Error) => {
      pushToast({
        title: "Failed to reset Linear cursor",
        body: error.message,
        tone: "error",
      });
    },
  });

  const toggleSyncJobMutation = useMutation({
    mutationFn: async (job: Pick<PluginJobRecord, "id" | "status">) =>
      job.status === "active"
        ? await pluginsApi.pauseJob(pluginId, job.id)
        : await pluginsApi.resumeJob(pluginId, job.id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.jobs(pluginId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.dashboard(pluginId) });
      pushToast({
        title: job.status === "active" ? "Automatic Linear sync started" : "Automatic Linear sync paused",
        body:
          job.status === "active"
            ? "The scheduled poll job will resume running for all Linear mappings."
            : "The scheduled poll job is paused until you start it again.",
        tone: "success",
      });
    },
    onError: (error: Error) => {
      pushToast({
        title: "Failed to update Linear sync schedule",
        body: error.message,
        tone: "error",
      });
    },
  });

  const removeMapping = useCallback((index: number) => {
    setMappings((current) => {
      const next = current.filter((_, mappingIndex) => mappingIndex !== index);
      return next.length > 0 ? next : [createEmptyMapping(defaultCompanyId)];
    });
    setFormMessage(null);
  }, [defaultCompanyId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Linear settings...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Linear connection</CardTitle>
          <CardDescription>
            Save the API key first, then pick a Linear team whose identifier matches the Paperclip company before enabling sync options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Automatic sync schedule</p>
                <p className="text-xs text-muted-foreground">
                  Controls the background Linear poll job for every mapped company.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pollJob && toggleSyncJobMutation.mutate({ id: pollJob.id, status: pollJob.status })}
                disabled={!pollJob || toggleSyncJobMutation.isPending}
              >
                {toggleSyncJobMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : syncJobActive ? (
                  "Pause sync"
                ) : (
                  "Start sync"
                )}
              </Button>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
              <div>Status: {pollJob ? (syncJobActive ? "Running" : pollJob.status === "paused" ? "Paused" : pollJob.status) : "Unavailable"}</div>
              <div>Last run: {formatTimestamp(pollJob?.lastRunAt ?? null)}</div>
              <div>Next run: {formatTimestamp(pollJob?.nextRunAt ?? null)}</div>
            </div>

            {!pollJob ? (
              <p className="mt-3 text-xs text-muted-foreground">
                The Linear poll job is not available yet. Save and enable the plugin if this is a new install.
              </p>
            ) : !syncJobActive ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Background polling is paused. Manual sync actions below still work.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Background polling runs every 10 minutes while active.
              </p>
            )}
          </div>

          {errors.length > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Finish the required fields before saving.</p>
                  {errors.map((error) => (
                    <p key={error} className="text-muted-foreground">
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {formMessage ? (
            <div
              className={
                formMessage.tone === "success"
                  ? "rounded-lg border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300"
                  : "rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              }
            >
              {formMessage.text}
            </div>
          ) : null}

          {mappings.map((mapping, index) => {
            const company = companyById.get(mapping.companyId);
            const summary = mapping.companyId ? overviewByCompanyId.get(mapping.companyId) ?? null : null;
            const companySecrets = secretsByCompanyId.get(mapping.companyId) ?? [];
            const teamQuery = teamOptionQueries[index];
            const workflowStateQuery = workflowStateQueries[index];
            const teamOptions = teamQuery?.data?.teams ?? [];
            const workflowStateOptions = workflowStateQuery?.data?.states ?? [];
            const dryRunResult = mapping.companyId ? dryRunResults[mapping.companyId] ?? null : null;
            const paperclipIdentifier = company?.issuePrefix?.trim().toUpperCase() ?? "";
            const hasSavedApiKey = Boolean(mapping.apiTokenSecretRef);
            const hasFullMapping = Boolean(mapping.teamId.trim());
            const selectedTeamMatches = !mapping.teamId.trim() || teamOptions.some((team) => team.id === mapping.teamId.trim());
            const selectedTeamAllowed = Boolean(mapping.teamId.trim() && allowedTeamIdsByMapping[index]?.has(mapping.teamId.trim()));
            const currentTeamLabel = teamOptions.find((team) => team.id === mapping.teamId.trim()) ?? null;
            const pullEnabledWorkflowStatusCount = mapping.statusMappings.filter(
              (statusMapping) => statusMapping.paperclipStatus && isStatusMappingPullEnabled(statusMapping),
            ).length;
            const pushEnabledWorkflowStatusCount = mapping.statusMappings.filter(
              (statusMapping) => statusMapping.paperclipStatus && isStatusMappingPushEnabled(statusMapping),
            ).length;
            const apiSecret = mapping.apiTokenSecretRef
              ? companySecrets.find((secret) => secret.id === mapping.apiTokenSecretRef) ?? null
              : null;
            return (
              <div key={`${mapping.companyId || "new"}-${index}`} className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {company?.name ?? `Mapping ${index + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mapping.companyId ? mapping.companyId : "Choose a Paperclip company first."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMapping(index)}
                    disabled={saveMutation.isPending || mappings.length === 1}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Paperclip company</Label>
                    <Select
                      value={mapping.companyId}
                      onValueChange={(value) =>
                        updateMapping(index, (current) => ({
                          ...current,
                          companyId: value,
                          teamId: current.companyId === value ? current.teamId : "",
                          statusMappings: current.companyId === value ? current.statusMappings : [],
                          statusMappingsConfigured: current.companyId === value ? current.statusMappingsConfigured : false,
                          apiTokenSecretRef: current.companyId === value ? current.apiTokenSecretRef : "",
                          apiKeyInput: "",
                        }))
                      }
                      disabled={saveMutation.isPending || selectableCompanies.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a company" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableCompanies.map((companyOption) => (
                          <SelectItem key={companyOption.id} value={companyOption.id}>
                            {companyOption.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {company ? `Identifier: ${company.issuePrefix}` : "Choose the Paperclip company you want to connect."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Linear API key</Label>
                    <Input
                      type="password"
                      value={mapping.apiKeyInput}
                      onChange={(event) =>
                        updateMapping(index, (current) => ({
                          ...current,
                          apiKeyInput: event.target.value,
                        }))
                      }
                      placeholder={mapping.apiTokenSecretRef ? "Leave blank to keep the stored API key" : "lin_api_xxx"}
                      disabled={saveMutation.isPending || !mapping.companyId}
                    />
                    <p className="text-xs text-muted-foreground">
                      {apiSecret
                        ? `Stored securely as "${apiSecret.name}". Save to refresh the matching Linear teams.`
                        : mapping.apiTokenSecretRef
                          ? "An API key is already stored for this company. Save again after updating it to refresh the team list."
                          : "Save the API key first. Paperclip stores it as a company secret, then loads Linear teams that match the company identifier."}
                    </p>
                  </div>
                </div>

                {hasSavedApiKey ? (
                  <div className="mt-4 rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Linear team</p>
                      <p className="text-xs text-muted-foreground">
                        Only teams with identifier {paperclipIdentifier || "matching the selected company"} are eligible.
                      </p>
                    </div>

                    {!pluginReady ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Enable the plugin to load Linear teams.
                      </p>
                    ) : teamQuery?.isPending ? (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading matching Linear teams...
                      </div>
                    ) : teamQuery?.error ? (
                      <p className="mt-3 text-xs text-destructive">
                        {(teamQuery.error as Error).message}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Linear team</Label>
                            <Select
                              value={mapping.teamId}
                              onValueChange={(value) =>
                                updateMapping(index, (current) => ({
                                  ...current,
                                  teamId: value,
                                  statusMappings: current.teamId === value ? current.statusMappings : [],
                                  statusMappingsConfigured: current.teamId === value ? current.statusMappingsConfigured : false,
                                }))
                              }
                              disabled={saveMutation.isPending || teamOptions.length === 0}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue
                                  placeholder={
                                    teamOptions.length > 0
                                      ? "Select a matching Linear team"
                                      : `No Linear teams found for ${paperclipIdentifier || "this company"}`
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {!selectedTeamMatches && mapping.teamId.trim() ? (
                                  <SelectItem value={mapping.teamId.trim()}>
                                    {`Current config (${mapping.teamId.trim()})`}
                                  </SelectItem>
                                ) : null}
                                {teamOptions.map((team) => (
                                  <SelectItem key={team.id} value={team.id}>
                                    {`${team.name} (${team.key})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Sync direction</Label>
                            <Select
                              value={mapping.syncDirection}
                              onValueChange={(value) =>
                                updateMapping(index, (current) => ({
                                  ...current,
                                  syncDirection: value as LinearSyncDirection,
                                }))
                              }
                              disabled={saveMutation.isPending}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bidirectional">Bidirectional</SelectItem>
                                <SelectItem value="pull">Pull from Linear</SelectItem>
                                <SelectItem value="push">Push to Linear</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {currentTeamLabel ? (
                          <p className="text-xs text-muted-foreground">
                            Selected team: {currentTeamLabel.name} ({currentTeamLabel.key})
                          </p>
                        ) : null}

                        {!selectedTeamMatches && mapping.teamId.trim() ? (
                          <p className="text-xs text-destructive">
                            The saved Linear team no longer matches Paperclip identifier {paperclipIdentifier}. Choose a matching team before saving again.
                          </p>
                        ) : null}

                        {teamOptions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {teamQuery?.data?.totalTeamCount
                              ? `This API key can see ${teamQuery.data.totalTeamCount} team${teamQuery.data.totalTeamCount === 1 ? "" : "s"}, but none use identifier ${paperclipIdentifier}.`
                              : `No Linear teams were returned for this API key and identifier ${paperclipIdentifier}.`}
                          </p>
                        ) : !hasFullMapping ? (
                          <p className="text-xs text-muted-foreground">
                            Choose the matching team to load its workflow statuses.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {hasFullMapping ? (
                  <>
                    <div className="mt-4 rounded-lg border border-border/60 bg-background/50 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Workflow status mapping</p>
                        <p className="text-xs text-muted-foreground">
                          Review every Linear team status, choose the Paperclip status it corresponds to, and decide whether that row syncs in both directions, pull only, push only, or not at all.
                        </p>
                      </div>

                      {!pluginReady ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Enable the plugin to load Linear workflow statuses.
                        </p>
                      ) : !selectedTeamAllowed ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Choose a valid Linear team before loading workflow statuses.
                        </p>
                      ) : workflowStateQuery?.isPending ? (
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading Linear workflow statuses...
                        </div>
                      ) : workflowStateQuery?.error ? (
                        <p className="mt-3 text-xs text-destructive">
                          {(workflowStateQuery.error as Error).message}
                        </p>
                      ) : workflowStateOptions.length === 0 ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          No workflow statuses were returned for this Linear team.
                        </p>
                      ) : (
                        <>
                          <div className="mt-3 space-y-2">
                            {workflowStateOptions.map((state) => {
                              const currentStatusMapping =
                                mapping.statusMappings.find((statusMapping) => statusMapping.linearStateId === state.id) ?? null;
                              const mappedStatus = currentStatusMapping?.paperclipStatus ?? "";
                              const syncMode = currentStatusMapping?.syncMode ?? "disabled";
                              return (
                                <div
                                  key={state.id}
                                  className="grid gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(220px,0.8fr)] md:items-center"
                                >
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">{state.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Type: {state.type} · Suggested: {PAPERCLIP_STATUS_LABELS[state.recommendedPaperclipStatus]}
                                    </p>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`linear-sync-mode-${index}-${state.id}`}>Sync mode</Label>
                                    <Select
                                      value={syncMode}
                                      onValueChange={(value) =>
                                        updateMapping(index, (current) => ({
                                          ...current,
                                          statusMappings: current.statusMappings.map((statusMapping) =>
                                            statusMapping.linearStateId === state.id
                                              ? {
                                                  ...statusMapping,
                                                  syncMode: value as LinearStatusSyncMode,
                                                  paperclipStatus:
                                                    value === "disabled"
                                                      ? ""
                                                      : statusMapping.paperclipStatus || state.recommendedPaperclipStatus,
                                                }
                                              : statusMapping,
                                          ),
                                          statusMappingsConfigured: true,
                                        }))
                                      }
                                      disabled={saveMutation.isPending}
                                    >
                                      <SelectTrigger id={`linear-sync-mode-${index}-${state.id}`} className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="bidirectional">{STATUS_SYNC_MODE_LABELS.bidirectional}</SelectItem>
                                        <SelectItem value="pull">{STATUS_SYNC_MODE_LABELS.pull}</SelectItem>
                                        <SelectItem value="push">{STATUS_SYNC_MODE_LABELS.push}</SelectItem>
                                        <SelectItem value="disabled">{STATUS_SYNC_MODE_LABELS.disabled}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`linear-status-${index}-${state.id}`}>Paperclip status</Label>
                                    <Select
                                      value={mappedStatus || "__unset__"}
                                      onValueChange={(value) =>
                                        updateMapping(index, (current) => ({
                                          ...current,
                                          statusMappings: current.statusMappings.map((statusMapping) =>
                                            statusMapping.linearStateId === state.id
                                              ? {
                                                  ...statusMapping,
                                                  paperclipStatus: value === "__unset__" ? "" : (value as IssueStatus),
                                                }
                                              : statusMapping,
                                          ),
                                          statusMappingsConfigured: true,
                                        }))
                                      }
                                      disabled={saveMutation.isPending || syncMode === "disabled"}
                                    >
                                      <SelectTrigger id={`linear-status-${index}-${state.id}`} className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__unset__">Select a status</SelectItem>
                                        {ISSUE_STATUSES.map((status) => (
                                          <SelectItem key={status} value={status}>
                                            {PAPERCLIP_STATUS_LABELS[status]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <p className="mt-3 text-xs text-muted-foreground">
                            Pull enabled: {pullEnabledWorkflowStatusCount} · Push enabled: {pushEnabledWorkflowStatusCount} · Total Linear statuses: {workflowStateOptions.length}
                          </p>
                          {pullEnabledWorkflowStatusCount === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              No Linear statuses are mapped yet, so pull sync will skip every Linear issue for this team.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 rounded-lg border border-border/60 bg-background/50 p-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={mapping.forceMatchIdentifier}
                          onCheckedChange={(checked) =>
                            updateMapping(index, (current) => ({
                              ...current,
                              forceMatchIdentifier: checked === true,
                            }))
                          }
                          disabled={saveMutation.isPending}
                        />
                        <span>
                          <span className="font-medium text-foreground">Force match identifier</span>
                          <span className="block text-xs text-muted-foreground">
                            On pull, override the Paperclip issue identifier to match Linear. This makes Linear the source of truth for issue IDs.
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={mapping.importLinearIssues}
                          onCheckedChange={(checked) =>
                            updateMapping(index, (current) => ({
                              ...current,
                              importLinearIssues: checked !== false,
                            }))
                          }
                          disabled={saveMutation.isPending}
                        />
                        <span>
                          <span className="font-medium text-foreground">Import Linear issues</span>
                          <span className="block text-xs text-muted-foreground">
                            Create Paperclip issues when a linked or referenced Linear issue appears.
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={mapping.autoCreateLinearIssues}
                          onCheckedChange={(checked) =>
                            updateMapping(index, (current) => ({
                              ...current,
                              autoCreateLinearIssues: checked !== false,
                            }))
                          }
                          disabled={saveMutation.isPending}
                        />
                        <span>
                          <span className="font-medium text-foreground">Auto-create Linear issues</span>
                          <span className="block text-xs text-muted-foreground">
                            Create a Linear issue automatically when a Paperclip issue needs to sync out.
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={mapping.syncComments}
                          onCheckedChange={(checked) =>
                            updateMapping(index, (current) => ({
                              ...current,
                              syncComments: checked !== false,
                            }))
                          }
                          disabled={saveMutation.isPending}
                        />
                        <span>
                          <span className="font-medium text-foreground">Sync comments</span>
                          <span className="block text-xs text-muted-foreground">
                            Mirror Paperclip comments to Linear and import Linear comments back.
                          </span>
                        </span>
                      </label>
                    </div>

                    <div className="mt-4 rounded-lg border border-border/60 bg-background/50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">Manual sync</p>
                          <p className="text-xs text-muted-foreground">
                            Use the same pull actions from the Linear page directly here.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => dryRunMutation.mutate({ companyId: mapping.companyId, full: false })}
                            disabled={
                              saveMutation.isPending ||
                              dryRunMutation.isPending ||
                              resyncMutation.isPending ||
                              !mapping.companyId ||
                              !pluginReady ||
                              isDirty
                            }
                          >
                            {dryRunMutation.isPending && dryRunMutation.variables?.companyId === mapping.companyId ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Previewing...
                              </>
                            ) : (
                              "Dry run"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => resyncMutation.mutate({ companyId: mapping.companyId, full: false })}
                            disabled={
                              saveMutation.isPending ||
                              resyncMutation.isPending ||
                              !mapping.companyId ||
                              !pluginReady ||
                              isDirty
                            }
                          >
                            {resyncMutation.isPending && resyncMutation.variables?.companyId === mapping.companyId && !resyncMutation.variables?.full ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Pulling...
                              </>
                            ) : (
                              "Pull recent"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => resyncMutation.mutate({ companyId: mapping.companyId, full: true })}
                            disabled={
                              saveMutation.isPending ||
                              resyncMutation.isPending ||
                              !mapping.companyId ||
                              !pluginReady ||
                              isDirty
                            }
                          >
                            {resyncMutation.isPending && resyncMutation.variables?.companyId === mapping.companyId && resyncMutation.variables?.full ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Resyncing...
                              </>
                            ) : (
                              "Full resync"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => resetCursorMutation.mutate({ companyId: mapping.companyId })}
                            disabled={
                              saveMutation.isPending ||
                              resyncMutation.isPending ||
                              dryRunMutation.isPending ||
                              resetCursorMutation.isPending ||
                              !mapping.companyId ||
                              !pluginReady ||
                              isDirty
                            }
                          >
                            {resetCursorMutation.isPending && resetCursorMutation.variables?.companyId === mapping.companyId ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Resetting...
                              </>
                            ) : (
                              "Reset cursor"
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-5">
                        <div>Linked issues: {summary?.linkedIssues ?? 0}</div>
                        <div>Linked projects: {summary?.linkedProjects ?? 0}</div>
                        <div>Last success: {formatTimestamp(summary?.lastSuccessAt)}</div>
                        <div>Last run: {formatTimestamp(summary?.lastRunAt)}</div>
                        <div>Cursor: {summary?.lastCursor ?? "None"}</div>
                      </div>

                      {dryRunResult ? (
                        <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                          <p className="font-medium text-foreground">
                            Dry run preview: {dryRunResult.issueCount} issue{dryRunResult.issueCount === 1 ? "" : "s"} across {dryRunResult.projectCount} project{dryRunResult.projectCount === 1 ? "" : "s"}.
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Based on the next incremental pull using cursor {dryRunResult.lastCursor ?? "None"} · checked {formatTimestamp(dryRunResult.generatedAt)}.
                          </p>
                          {dryRunResult.skippedUnmappedIssueCount > 0 ? (
                            <p className="mt-1 text-muted-foreground">
                              {dryRunResult.skippedUnmappedIssueCount} issue{dryRunResult.skippedUnmappedIssueCount === 1 ? "" : "s"} would be skipped because their Linear status is not mapped for pull.
                            </p>
                          ) : null}
                          {dryRunResult.blockedImportIssueCount > 0 ? (
                            <p className="mt-1 text-amber-700 dark:text-amber-400">
                              {dryRunResult.blockedImportIssueCount} issue{dryRunResult.blockedImportIssueCount === 1 ? "" : "s"} are not linked yet and would not import while "Import Linear issues" is disabled.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {!pluginReady ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Enable the plugin to run manual sync actions.
                        </p>
                      ) : isDirty ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Save your settings before running a dry run or manual sync so the worker uses the latest mapping.
                        </p>
                      ) : null}

                      {summary?.lastError ? (
                        <p className="mt-3 text-xs text-destructive">{summary.lastError}</p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setMappings((current) => [
                  ...current,
                  createEmptyMapping(nextDefaultCompanyId ?? null),
                ])
              }
              disabled={saveMutation.isPending || selectableCompanies.length === 0}
            >
              <Plus className="h-4 w-4" />
              Add company mapping
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || errors.length > 0 || hasBlockingWorkflowStateSetup || !isDirty}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Linear settings"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

function activityToneClasses(result: LinearSyncActivityItem["result"]) {
  return result === "failure"
    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function LinearPluginActivityPanel({ pluginId }: { pluginId: string }) {
  const { selectedCompanyId } = useCompany();

  const { data, isLoading, error } = useQuery({
    queryKey: ["plugins", pluginId, "linear-sync-activity", selectedCompanyId ?? null],
    queryFn: async () => {
      const response = await pluginsApi.bridgeGetData(pluginId, "sync-activity", undefined, selectedCompanyId ?? null);
      return response.data as LinearSyncActivityData;
    },
    enabled: Boolean(pluginId),
    refetchInterval: 30000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linear Sync Activity</CardTitle>
        <CardDescription>
          Recent pull activity for mapped Linear companies, including successful syncs and failures.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Linear sync activity...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : data && data.companyCount > 0 ? (
          data.companies.map((company) => (
            <div key={company.companyId} className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-foreground">{company.companyName}</div>
                  <div className="text-xs text-muted-foreground">Team: {company.teamId}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {company.recentActivity.length} recent event{company.recentActivity.length === 1 ? "" : "s"}
                </div>
              </div>

              {company.recentActivity.length > 0 ? (
                <div className="space-y-2">
                  {company.recentActivity.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border/60 bg-muted/30 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${activityToneClasses(entry.result)}`}>
                          {entry.result === "failure" ? "Failed" : "Succeeded"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.direction} · {entry.runType} · {formatTimestamp(entry.occurredAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-foreground">
                        {entry.linearIdentifier ? <span className="font-medium">{entry.linearIdentifier}</span> : "Linear sync"}
                        {entry.linearTitle ? <span>{` · ${entry.linearTitle}`}</span> : null}
                      </div>
                      {entry.linearProjectName ? (
                        <div className="mt-1 text-xs text-muted-foreground">Project: {entry.linearProjectName}</div>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.message}
                        {entry.result === "failure" && entry.paperclipIssueIdentifier ? (
                          <>
                            {" "}
                            <Link
                              to={`/issues/${entry.paperclipIssueIdentifier}`}
                              className="font-medium text-foreground underline underline-offset-4"
                            >
                              Open existing issue
                            </Link>
                          </>
                        ) : null}
                      </p>
                      {entry.result === "success" && (entry.paperclipIssueId || entry.paperclipIssueIdentifier) ? (
                        <div className="mt-1">
                          <Link
                            to={`/issues/${entry.paperclipIssueId ?? entry.paperclipIssueIdentifier!}`}
                            className="text-xs font-medium text-foreground underline underline-offset-4"
                          >
                            Open created issue
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No sync activity recorded yet.</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground italic">No Linear company mappings configured.</p>
        )}
      </CardContent>
    </Card>
  );
}
