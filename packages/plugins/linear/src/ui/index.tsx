import { useState, type CSSProperties, type FormEvent } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginDetailTabProps,
  type PluginPageProps,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";

type CompanySummary = {
  companyId: string;
  companyName: string;
  teamId: string;
  syncDirection: string;
  linkedIssues: number;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  lastCursor: string | null;
};

type OverviewData = {
  pluginId: string;
  pageRoute: string;
  activeCompanyId: string | null;
  companyCount: number;
  linkedIssueCount: number;
  companies: CompanySummary[];
};

type PluginConfigData = {
  companyMappings?: Array<{
    companyId: string;
    teamId: string;
    apiTokenSecretRef: string;
    syncDirection?: string;
    importLinearIssues?: boolean;
    autoCreateLinearIssues?: boolean;
    syncComments?: boolean;
    blockedStateName?: string;
    statusMappings?: Array<{
      linearStateId: string;
      paperclipStatus: string;
      syncMode?: string;
    }>;
    graphqlUrl?: string;
    webhookSecretRef?: string;
  }>;
};

type IssueRelationSummary = {
  id: string;
  title: string;
  identifier: string | null;
  relationType: string;
  status: string;
};

type IssueLinkData = {
  issueId: string;
  issueTitle: string;
  companyId: string;
  mappingConfigured: boolean;
  syncDirection: string;
  autoCreateLinearIssues: boolean;
  syncComments: boolean;
  linked: boolean;
  link: {
    linearIssueId: string;
    linearIdentifier: string;
    linearUrl: string;
    lastSyncedAt?: string;
    lastPulledAt?: string;
    lastPushedAt?: string;
  } | null;
  blocks: IssueRelationSummary[];
  blockedBy: IssueRelationSummary[];
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center",
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "6px 12px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "8px 10px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
};

const mutedStyle: CSSProperties = {
  color: "var(--muted-foreground, color-mix(in srgb, currentColor 65%, transparent))",
  fontSize: "12px",
};

function formatTimestamp(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function RelationList({ title, relations }: { title: string; relations: IssueRelationSummary[] }) {
  return (
    <div style={stackStyle}>
      <strong>{title}</strong>
      {relations.length === 0 ? (
        <div style={mutedStyle}>None</div>
      ) : (
        relations.map((relation) => (
          <div key={`${relation.relationType}:${relation.id}`} style={cardStyle}>
            <div style={{ fontWeight: 600 }}>{relation.identifier ?? relation.id}</div>
            <div>{relation.title}</div>
            <div style={mutedStyle}>Status: {relation.status}</div>
          </div>
        ))
      )}
    </div>
  );
}

export function LinearPage(_props: PluginPageProps) {
  const host = useHostContext();
  const toast = usePluginToast();
  const { data, loading, error, refresh } = usePluginData<OverviewData>("overview", {
    companyId: host.companyId ?? undefined,
  });
  const resyncCompany = usePluginAction("resync-company");

  async function handleResync(companyId: string, full = false) {
    try {
      await resyncCompany({ companyId, full });
      toast({ title: full ? "Full Linear sync queued" : "Linear sync queued", tone: "success" });
      refresh();
    } catch (actionError) {
      toast({
        title: "Linear sync failed",
        body: actionError instanceof Error ? actionError.message : String(actionError),
        tone: "error",
      });
    }
  }

  if (loading) return <div>Loading Linear sync overview...</div>;
  if (error) return <div>Plugin error: {error.message}</div>;

  return (
    <div style={stackStyle}>
      <div style={cardStyle}>
        <strong>Linear Sync</strong>
        <div style={mutedStyle}>
          {data?.companyCount ?? 0} mapped companies, {data?.linkedIssueCount ?? 0} linked issues
        </div>
      </div>

      {(data?.companies ?? []).map((company) => (
        <div key={company.companyId} style={cardStyle}>
          <div style={{ ...rowStyle, justifyContent: "space-between" }}>
            <div>
              <strong>{company.companyName}</strong>
              <div style={mutedStyle}>Team: {company.teamId}</div>
            </div>
            <div style={rowStyle}>
              <button style={buttonStyle} onClick={() => void handleResync(company.companyId, false)}>Pull recent</button>
              <button style={buttonStyle} onClick={() => void handleResync(company.companyId, true)}>Full resync</button>
            </div>
          </div>
          <div style={stackStyle}>
            <div style={mutedStyle}>Direction: {company.syncDirection}</div>
            <div style={mutedStyle}>Linked issues: {company.linkedIssues}</div>
            <div style={mutedStyle}>Last success: {formatTimestamp(company.lastSuccessAt)}</div>
            <div style={mutedStyle}>Last run: {formatTimestamp(company.lastRunAt)}</div>
            <div style={mutedStyle}>Cursor: {company.lastCursor ?? "None"}</div>
            {company.lastError ? <div style={{ color: "#dc2626", fontSize: "12px" }}>{company.lastError}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LinearSettingsPage(_props: PluginSettingsPageProps) {
  const { data, loading, error } = usePluginData<PluginConfigData>("plugin-config");

  if (loading) return <div>Loading Linear config...</div>;
  if (error) return <div>Plugin error: {error.message}</div>;

  return (
    <div style={stackStyle}>
      <div style={cardStyle}>
        <strong>Configured Company Mappings</strong>
        <div style={mutedStyle}>
          This plugin uses the instance config schema. Edit mappings in the plugin manager, then use this page to verify the
          effective values loaded by the worker.
        </div>
      </div>

      {(data?.companyMappings ?? []).map((mapping) => (
        <div key={`${mapping.companyId}:${mapping.teamId}`} style={cardStyle}>
          <div style={{ fontWeight: 600 }}>{mapping.companyId}</div>
          <div style={mutedStyle}>Linear team: {mapping.teamId}</div>
          <div style={mutedStyle}>Direction: {mapping.syncDirection ?? "bidirectional"}</div>
          <div style={mutedStyle}>Import Linear issues: {mapping.importLinearIssues === false ? "No" : "Yes"}</div>
          <div style={mutedStyle}>Auto-create Linear issues: {mapping.autoCreateLinearIssues === false ? "No" : "Yes"}</div>
          <div style={mutedStyle}>Sync comments: {mapping.syncComments === false ? "No" : "Yes"}</div>
          <div style={mutedStyle}>Mapped statuses: {mapping.statusMappings?.length ?? 0}</div>
          <div style={mutedStyle}>Blocked state: {mapping.blockedStateName ?? "Not set"}</div>
          <div style={mutedStyle}>GraphQL URL: {mapping.graphqlUrl ?? "Default Linear endpoint"}</div>
          <div style={mutedStyle}>API token secret ref: {mapping.apiTokenSecretRef}</div>
          <div style={mutedStyle}>Webhook secret ref: {mapping.webhookSecretRef ?? "Not set"}</div>
        </div>
      ))}
    </div>
  );
}

export function LinearDashboardWidget(_props: PluginWidgetProps) {
  const host = useHostContext();
  const { data, loading, error } = usePluginData<OverviewData>("overview", {
    companyId: host.companyId ?? undefined,
  });

  if (loading) return <div>Loading Linear sync...</div>;
  if (error) return <div>Plugin error: {error.message}</div>;

  const activeCompany = data?.companies.find((entry) => entry.companyId === host.companyId) ?? data?.companies[0];

  return (
    <div style={stackStyle}>
      <strong>Linear Sync</strong>
      <div style={mutedStyle}>Linked issues: {data?.linkedIssueCount ?? 0}</div>
      {activeCompany ? (
        <>
          <div style={mutedStyle}>{activeCompany.companyName}</div>
          <div style={mutedStyle}>Last success: {formatTimestamp(activeCompany.lastSuccessAt)}</div>
          {activeCompany.lastError ? <div style={{ color: "#dc2626", fontSize: "12px" }}>{activeCompany.lastError}</div> : null}
        </>
      ) : (
        <div style={mutedStyle}>No company mappings configured.</div>
      )}
    </div>
  );
}

export function LinearIssueDetailTab({ context }: PluginDetailTabProps) {
  const host = useHostContext();
  const toast = usePluginToast();
  const [linearIssueRef, setLinearIssueRef] = useState("");
  const { data, loading, error, refresh } = usePluginData<IssueLinkData>("issue-link", {
    companyId: context.companyId,
    issueId: context.entityId,
  });
  const createLinearIssue = usePluginAction("create-linear-issue");
  const pushIssue = usePluginAction("push-issue");
  const pullIssue = usePluginAction("pull-issue");
  const linkIssue = usePluginAction("link-linear-issue");
  const unlinkIssue = usePluginAction("unlink-linear-issue");

  async function runAction(action: () => Promise<unknown>, successTitle: string) {
    try {
      await action();
      toast({ title: successTitle, tone: "success" });
      refresh();
    } catch (actionError) {
      toast({
        title: "Linear action failed",
        body: actionError instanceof Error ? actionError.message : String(actionError),
        tone: "error",
      });
    }
  }

  async function handleLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!host.companyId || !context.entityId || !linearIssueRef.trim()) return;
    await runAction(
      () =>
        linkIssue({
          companyId: host.companyId,
          issueId: context.entityId,
          linearIssueRef: linearIssueRef.trim(),
        }),
      "Linked existing Linear issue",
    );
    setLinearIssueRef("");
  }

  if (loading) return <div>Loading Linear issue data...</div>;
  if (error) return <div>Plugin error: {error.message}</div>;
  if (!host.companyId) return <div>Company context is required.</div>;

  return (
    <div style={stackStyle}>
      <div style={cardStyle}>
        <strong>{data?.issueTitle ?? "Issue"}</strong>
        {!data?.mappingConfigured ? (
          <div style={mutedStyle}>No Linear mapping is configured for company {host.companyId}.</div>
        ) : (
          <>
            <div style={mutedStyle}>Direction: {data.syncDirection}</div>
            <div style={mutedStyle}>Comments sync: {data.syncComments ? "On" : "Off"}</div>
            <div style={mutedStyle}>Auto-create missing Linear issue: {data.autoCreateLinearIssues ? "On" : "Off"}</div>
          </>
        )}
      </div>

      {data?.link ? (
        <div style={cardStyle}>
          <strong>Linked Linear Issue</strong>
          <div>{data.link.linearIdentifier}</div>
          <a href={data.link.linearUrl} target="_blank" rel="noreferrer">
            Open in Linear
          </a>
          <div style={mutedStyle}>Last synced: {formatTimestamp(data.link.lastSyncedAt)}</div>
          <div style={mutedStyle}>Last pull: {formatTimestamp(data.link.lastPulledAt)}</div>
          <div style={mutedStyle}>Last push: {formatTimestamp(data.link.lastPushedAt)}</div>
        </div>
      ) : (
        <div style={cardStyle}>
          <strong>No linked Linear issue</strong>
          <div style={mutedStyle}>Create one from this Paperclip issue or attach an existing Linear issue.</div>
        </div>
      )}

      <div style={cardStyle}>
        <div style={rowStyle}>
          <button
            style={buttonStyle}
            onClick={() =>
              void runAction(
                () => createLinearIssue({ companyId: host.companyId, issueId: context.entityId }),
                "Created Linear issue",
              )}
          >
            Create Linear Issue
          </button>
          <button
            style={buttonStyle}
            onClick={() =>
              void runAction(
                () => pushIssue({ companyId: host.companyId, issueId: context.entityId }),
                "Pushed issue to Linear",
              )}
          >
            Push To Linear
          </button>
          <button
            style={buttonStyle}
            onClick={() =>
              void runAction(
                () => pullIssue({ companyId: host.companyId, issueId: context.entityId }),
                "Pulled issue from Linear",
              )}
          >
            Pull From Linear
          </button>
          <button
            style={buttonStyle}
            onClick={() =>
              void runAction(
                () => unlinkIssue({ companyId: host.companyId, issueId: context.entityId }),
                "Unlinked Linear issue",
              )}
          >
            Unlink
          </button>
        </div>
      </div>

      <form style={cardStyle} onSubmit={(event) => void handleLinkSubmit(event)}>
        <strong>Link Existing Linear Issue</strong>
        <div style={mutedStyle}>Paste a Linear issue URL, GraphQL ID, or team identifier like LINEAR-123.</div>
        <input
          style={inputStyle}
          value={linearIssueRef}
          onChange={(event) => setLinearIssueRef(event.target.value)}
          placeholder="LINEAR-123 or https://linear.app/team/issue/LINEAR-123/title"
        />
        <div style={{ ...rowStyle, marginTop: "8px" }}>
          <button type="submit" style={buttonStyle}>Link issue</button>
        </div>
      </form>

      <RelationList title="Blocks" relations={data?.blocks ?? []} />
      <RelationList title="Blocked By" relations={data?.blockedBy ?? []} />
    </div>
  );
}
