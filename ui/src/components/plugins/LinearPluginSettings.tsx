import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Key, Loader2, Plus, Trash2, Webhook } from "lucide-react";
import type { CompanySecret } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { pluginsApi } from "@/api/plugins";
import { secretsApi } from "@/api/secrets";
import { queryKeys } from "@/lib/queryKeys";
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

type LinearSyncDirection = "pull" | "push" | "bidirectional";

type LinearMappingFormState = {
  companyId: string;
  teamId: string;
  apiTokenSecretRef: string;
  apiKeyInput: string;
  syncDirection: LinearSyncDirection;
  importLinearIssues: boolean;
  autoCreateLinearIssues: boolean;
  syncComments: boolean;
  blockedStateName: string;
  graphqlUrl: string;
  webhookSecretRef: string;
  webhookSecretInput: string;
};

type PersistedLinearMapping = {
  companyId: string;
  teamId: string;
  apiTokenSecretRef: string;
  syncDirection: LinearSyncDirection;
  importLinearIssues: boolean;
  autoCreateLinearIssues: boolean;
  syncComments: boolean;
  blockedStateName: string;
  graphqlUrl: string;
  webhookSecretRef: string;
};

interface LinearPluginSettingsProps {
  pluginId: string;
  initialValues?: Record<string, unknown>;
  isLoading?: boolean;
}

function createEmptyMapping(defaultCompanyId: string | null): LinearMappingFormState {
  return {
    companyId: defaultCompanyId ?? "",
    teamId: "",
    apiTokenSecretRef: "",
    apiKeyInput: "",
    syncDirection: "bidirectional",
    importLinearIssues: true,
    autoCreateLinearIssues: true,
    syncComments: true,
    blockedStateName: "",
    graphqlUrl: "",
    webhookSecretRef: "",
    webhookSecretInput: "",
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
      importLinearIssues: entry.importLinearIssues !== false,
      autoCreateLinearIssues: entry.autoCreateLinearIssues !== false,
      syncComments: entry.syncComments !== false,
      blockedStateName: normalizeString(entry.blockedStateName),
      graphqlUrl: normalizeString(entry.graphqlUrl),
      webhookSecretRef: normalizeString(entry.webhookSecretRef),
      webhookSecretInput: "",
    }));

  return mappings.length > 0 ? mappings : [createEmptyMapping(defaultCompanyId)];
}

function toPersistedMappings(mappings: LinearMappingFormState[]): PersistedLinearMapping[] {
  return mappings.map((mapping) => ({
    companyId: mapping.companyId,
    teamId: mapping.teamId,
    apiTokenSecretRef: mapping.apiTokenSecretRef,
    syncDirection: mapping.syncDirection,
    importLinearIssues: mapping.importLinearIssues,
    autoCreateLinearIssues: mapping.autoCreateLinearIssues,
    syncComments: mapping.syncComments,
    blockedStateName: mapping.blockedStateName.trim(),
    graphqlUrl: mapping.graphqlUrl.trim(),
    webhookSecretRef: mapping.webhookSecretRef,
  }));
}

function serializeMappings(mappings: LinearMappingFormState[]): string {
  return JSON.stringify(toPersistedMappings(mappings));
}

function validationErrors(
  mappings: LinearMappingFormState[],
  knownCompanyIds: Set<string>,
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

    if (!mapping.teamId.trim()) {
      errors.push(`${label}: Linear team ID is required.`);
    }

    if (!mapping.apiTokenSecretRef && !mapping.apiKeyInput.trim()) {
      errors.push(`${label}: add a Linear API key.`);
    }

    if (mapping.graphqlUrl.trim()) {
      try {
        const url = new URL(mapping.graphqlUrl.trim());
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.push(`${label}: GraphQL URL must start with http:// or https://.`);
        }
      } catch {
        errors.push(`${label}: GraphQL URL is invalid.`);
      }
    }
  });

  return errors;
}

function webhookUrlForPlugin(pluginId: string): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/api/plugins/${pluginId}/webhooks/linear`;
}

export function LinearPluginSettings({
  pluginId,
  initialValues,
  isLoading,
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
  const initialSignature = useMemo(() => serializeMappings(initialMappings), [initialMappings]);

  const [mappings, setMappings] = useState<LinearMappingFormState[]>(initialMappings);
  const [lastAppliedSignature, setLastAppliedSignature] = useState(initialSignature);
  const [formMessage, setFormMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const hydratedRef = useRef(false);

  const isDirty = useMemo(
    () => serializeMappings(mappings) !== lastAppliedSignature,
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

  const errors = useMemo(
    () => validationErrors(mappings, knownCompanyIds),
    [knownCompanyIds, mappings],
  );
  const webhookUrl = useMemo(() => webhookUrlForPlugin(pluginId), [pluginId]);

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

        let webhookSecretRef = mapping.webhookSecretRef;
        const webhookSecretValue = mapping.webhookSecretInput.trim();
        if (webhookSecretValue) {
          if (webhookSecretRef) {
            await secretsApi.rotate(webhookSecretRef, { value: webhookSecretValue });
          } else {
            const created = await secretsApi.create(mapping.companyId, {
              name: `Linear webhook secret (${company?.name ?? mapping.companyId})`,
              value: webhookSecretValue,
              description: "Verifies inbound webhooks for the Linear Sync plugin.",
            });
            webhookSecretRef = created.id;
          }
        }

        const configMapping: Record<string, unknown> = {
          companyId: mapping.companyId,
          teamId: mapping.teamId.trim(),
          apiTokenSecretRef,
          syncDirection: mapping.syncDirection,
          importLinearIssues: mapping.importLinearIssues,
          autoCreateLinearIssues: mapping.autoCreateLinearIssues,
          syncComments: mapping.syncComments,
        };

        const blockedStateName = mapping.blockedStateName.trim();
        if (blockedStateName) {
          configMapping.blockedStateName = blockedStateName;
        }

        const graphqlUrl = mapping.graphqlUrl.trim();
        if (graphqlUrl) {
          configMapping.graphqlUrl = graphqlUrl;
        }

        if (webhookSecretRef) {
          configMapping.webhookSecretRef = webhookSecretRef;
        }

        configMappings.push(configMapping);
        nextMappings.push({
          ...mapping,
          apiTokenSecretRef,
          apiKeyInput: "",
          webhookSecretRef,
          webhookSecretInput: "",
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
      setLastAppliedSignature(serializeMappings(nextMappings));
      setFormMessage({ tone: "success", text: "Linear settings saved." });
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.config(pluginId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.detail(pluginId) });
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
            Map each Paperclip company to a Linear team, store the API key securely, and configure how sync should behave.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
            const companySecrets = secretsByCompanyId.get(mapping.companyId) ?? [];
            const apiSecret = mapping.apiTokenSecretRef
              ? companySecrets.find((secret) => secret.id === mapping.apiTokenSecretRef) ?? null
              : null;
            const webhookSecret = mapping.webhookSecretRef
              ? companySecrets.find((secret) => secret.id === mapping.webhookSecretRef) ?? null
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
                          apiTokenSecretRef: current.companyId === value ? current.apiTokenSecretRef : "",
                          apiKeyInput: "",
                          webhookSecretRef: current.companyId === value ? current.webhookSecretRef : "",
                          webhookSecretInput: "",
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
                  </div>

                  <div className="space-y-2">
                    <Label>Linear team ID</Label>
                    <Input
                      value={mapping.teamId}
                      onChange={(event) =>
                        updateMapping(index, (current) => ({
                          ...current,
                          teamId: event.target.value,
                        }))
                      }
                      placeholder="team_abc123"
                      disabled={saveMutation.isPending}
                    />
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
                        ? `Stored securely as “${apiSecret.name}”. Enter a new value to rotate it.`
                        : mapping.apiTokenSecretRef
                          ? "An API key is already stored for this mapping. Enter a new value to replace it."
                          : "The API key is stored as a company secret and is never written back into plugin config."}
                    </p>
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

                  <div className="space-y-2">
                    <Label>Blocked workflow state</Label>
                    <Input
                      value={mapping.blockedStateName}
                      onChange={(event) =>
                        updateMapping(index, (current) => ({
                          ...current,
                          blockedStateName: event.target.value,
                        }))
                      }
                      placeholder="Blocked"
                      disabled={saveMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>GraphQL URL override</Label>
                    <Input
                      value={mapping.graphqlUrl}
                      onChange={(event) =>
                        updateMapping(index, (current) => ({
                          ...current,
                          graphqlUrl: event.target.value,
                        }))
                      }
                      placeholder="https://api.linear.app/graphql"
                      disabled={saveMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Webhook signing secret</Label>
                      {mapping.webhookSecretRef ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            updateMapping(index, (current) => ({
                              ...current,
                              webhookSecretRef: "",
                              webhookSecretInput: "",
                            }))
                          }
                          disabled={saveMutation.isPending}
                        >
                          Clear stored secret
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      type="password"
                      value={mapping.webhookSecretInput}
                      onChange={(event) =>
                        updateMapping(index, (current) => ({
                          ...current,
                          webhookSecretInput: event.target.value,
                        }))
                      }
                      placeholder={
                        mapping.webhookSecretRef
                          ? "Leave blank to keep the stored webhook secret"
                          : "Optional"
                      }
                      disabled={saveMutation.isPending || !mapping.companyId}
                    />
                    <p className="text-xs text-muted-foreground">
                      {webhookSecret
                        ? `Stored securely as “${webhookSecret.name}”. Enter a new value to rotate it.`
                        : mapping.webhookSecretRef
                          ? "A webhook secret is already stored for this mapping. Enter a new value to replace it."
                          : "Only needed if you configure Linear webhooks."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-lg border border-border/60 bg-background/50 p-3 md:grid-cols-3">
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
              disabled={saveMutation.isPending || errors.length > 0 || !isDirty}
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

      <Card className="border-border/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Webhook setup</CardTitle>
          <CardDescription>
            Optional, but recommended if you want faster inbound updates from Linear instead of waiting for the poll schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Webhook endpoint</p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {webhookUrl ?? "Open this page in the app to see the webhook URL."}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <Key className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Secret handling</p>
              <p className="text-muted-foreground">
                API keys and webhook secrets are stored as Paperclip company secrets. The plugin config only keeps secret references.
              </p>
            </div>
          </div>

          <a
            href="https://linear.app/docs/graphql/working-with-the-graphql-api"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Linear API docs
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
