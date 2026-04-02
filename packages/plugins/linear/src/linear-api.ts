import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_GRAPHQL_URL } from "./constants.js";
import type { CompanyMappingConfig, LinearIssue, LinearWorkflowState } from "./types.js";

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type IssueConnectionResponse = {
  issues: {
    nodes: LinearIssue[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type IssueResponse = {
  issue: LinearIssue;
};

type IssueByNumberResponse = {
  issues: {
    nodes: LinearIssue[];
  };
};

type WorkflowStateResponse = {
  workflowStates: {
    nodes: LinearWorkflowState[];
  };
};

const AUTH_HEADER_CACHE_TTL_MS = 60_000;
const authHeaderCache = new Map<string, { value: string; expiresAt: number }>();

const ISSUE_SELECTION = `
  id
  identifier
  title
  description
  priority
  url
  createdAt
  updatedAt
  team {
    id
    key
    name
  }
  state {
    id
    name
    type
  }
  comments(first: 100) {
    nodes {
      id
      body
      createdAt
      updatedAt
      user {
        id
        name
      }
    }
  }
  relations(first: 100) {
    nodes {
      id
      type
      relatedIssue {
        id
        identifier
        title
        url
      }
    }
  }
  inverseRelations(first: 100) {
    nodes {
      id
      type
      issue {
        id
        identifier
        title
        url
      }
    }
  }
`;

async function getAuthHeader(ctx: PluginContext, mapping: CompanyMappingConfig): Promise<string> {
  const cacheKey = mapping.apiTokenSecretRef;
  const cached = authHeaderCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const raw = (await ctx.secrets.resolve(mapping.apiTokenSecretRef)).trim();
  if (!raw) throw new Error(`Resolved Linear credential is empty for ${mapping.apiTokenSecretRef}`);
  authHeaderCache.set(cacheKey, {
    value: raw,
    expiresAt: now + AUTH_HEADER_CACHE_TTL_MS,
  });
  return raw;
}

async function linearGraphql<T>(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const authorization = await getAuthHeader(ctx, mapping);
  const response = await ctx.http.fetch(mapping.graphqlUrl || DEFAULT_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Linear request failed with ${response.status}: ${text}`);
  }

  const payload = JSON.parse(text) as GraphqlEnvelope<T>;
  if (payload.errors?.length) {
    const message = payload.errors.map((entry) => entry.message || "Unknown Linear error").join("; ");
    throw new Error(message);
  }
  if (!payload.data) throw new Error("Linear response contained no data");
  return payload.data;
}

export async function getLinearIssue(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issueRef: string,
): Promise<LinearIssue> {
  const data = await linearGraphql<IssueResponse>(
    ctx,
    mapping,
    `query LinearIssue($id: String!) {
      issue(id: $id) {
        ${ISSUE_SELECTION}
      }
    }`,
    { id: issueRef },
  );
  return data.issue;
}

export async function getLinearIssueByRef(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issueRef: string,
): Promise<LinearIssue> {
  const trimmed = issueRef.trim();
  try {
    return await getLinearIssue(ctx, mapping, trimmed);
  } catch (error) {
    const match = trimmed.match(/^(?:[A-Z][A-Z0-9_]*-)?(\d+)$/i);
    if (!match) throw error;
    const issueNumber = Number(match[1]);
    if (!Number.isFinite(issueNumber)) throw error;

    const data = await linearGraphql<IssueByNumberResponse>(
      ctx,
      mapping,
      `query LinearIssueByNumber($teamId: ID!, $number: Float!) {
        issues(
          first: 1
          filter: {
            team: { id: { eq: $teamId } }
            number: { eq: $number }
          }
        ) {
          nodes {
            ${ISSUE_SELECTION}
          }
        }
      }`,
      {
        teamId: mapping.teamId,
        number: issueNumber,
      },
    );

    const issue = data.issues.nodes[0];
    if (!issue) {
      throw error;
    }
    return issue;
  }
}

export async function listLinearIssuesUpdatedSince(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  cursor?: string | null,
): Promise<LinearIssue[]> {
  const issues: LinearIssue[] = [];
  let after: string | null = null;
  const hasCursor = Boolean(cursor);
  const query = hasCursor
    ? `query LinearIssues($teamId: ID!, $updatedAt: DateTimeOrDuration, $after: String) {
        issues(
          first: 50
          after: $after
          orderBy: updatedAt
          filter: {
            team: { id: { eq: $teamId } }
            updatedAt: { gte: $updatedAt }
          }
        ) {
          nodes {
            ${ISSUE_SELECTION}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`
    : `query LinearIssues($teamId: ID!, $after: String) {
        issues(
          first: 50
          after: $after
          orderBy: updatedAt
          filter: {
            team: { id: { eq: $teamId } }
          }
        ) {
          nodes {
            ${ISSUE_SELECTION}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`;

  do {
    const response: IssueConnectionResponse = await linearGraphql<IssueConnectionResponse>(
      ctx,
      mapping,
      query,
      hasCursor
        ? {
            teamId: mapping.teamId,
            updatedAt: cursor,
            after,
          }
        : {
            teamId: mapping.teamId,
            after,
          },
    );

    issues.push(...response.issues.nodes);
    after = response.issues.pageInfo.hasNextPage ? response.issues.pageInfo.endCursor : null;
  } while (after);

  return issues;
}

export async function listWorkflowStates(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
): Promise<LinearWorkflowState[]> {
  const data = await linearGraphql<WorkflowStateResponse>(
    ctx,
    mapping,
    `query LinearWorkflowStates($teamId: ID!) {
      workflowStates(first: 100, filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
          type
        }
      }
    }`,
    { teamId: mapping.teamId },
  );
  return data.workflowStates.nodes;
}

export async function createLinearIssue(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  input: {
    title: string;
    description?: string | null;
    stateId?: string;
    parentId?: string;
    priority?: number;
  },
): Promise<LinearIssue> {
  const data = await linearGraphql<{ issueCreate: { issue: { id: string } } }>(
    ctx,
    mapping,
    `mutation LinearIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        issue {
          id
        }
      }
    }`,
    {
      input: {
        teamId: mapping.teamId,
        title: input.title,
        description: input.description || undefined,
        stateId: input.stateId,
        parentId: input.parentId,
        priority: input.priority,
      },
    },
  );
  return await getLinearIssue(ctx, mapping, data.issueCreate.issue.id);
}

export async function updateLinearIssue(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issueId: string,
  input: {
    title?: string;
    description?: string | null;
    stateId?: string;
    parentId?: string | null;
    priority?: number;
  },
): Promise<LinearIssue> {
  await linearGraphql<{ issueUpdate: { success: boolean } }>(
    ctx,
    mapping,
    `mutation LinearIssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
      }
    }`,
    {
      id: issueId,
      input,
    },
  );
  return await getLinearIssue(ctx, mapping, issueId);
}

export async function createLinearComment(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  linearIssueId: string,
  body: string,
): Promise<{ id: string }> {
  const data = await linearGraphql<{ commentCreate: { comment: { id: string } } }>(
    ctx,
    mapping,
    `mutation LinearCommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        comment {
          id
        }
      }
    }`,
    {
      input: {
        issueId: linearIssueId,
        body,
      },
    },
  );
  return data.commentCreate.comment;
}

export async function createLinearRelation(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  issueId: string,
  relatedIssueId: string,
): Promise<{ id: string }> {
  const data = await linearGraphql<{ issueRelationCreate: { issueRelation: { id: string } } }>(
    ctx,
    mapping,
    `mutation LinearIssueRelationCreate($input: IssueRelationCreateInput!) {
      issueRelationCreate(input: $input) {
        issueRelation {
          id
        }
      }
    }`,
    {
      input: {
        type: "blocks",
        issueId,
        relatedIssueId,
      },
    },
  );
  return data.issueRelationCreate.issueRelation;
}

export async function deleteLinearRelation(
  ctx: PluginContext,
  mapping: CompanyMappingConfig,
  relationId: string,
): Promise<void> {
  await linearGraphql<{ issueRelationDelete: { success: boolean } }>(
    ctx,
    mapping,
    `mutation LinearIssueRelationDelete($id: String!) {
      issueRelationDelete(id: $id) {
        success
      }
    }`,
    { id: relationId },
  );
}
