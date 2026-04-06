import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Issue } from "@paperclipai/shared";

const execFileAsync = promisify(execFile);

export interface GitWorkspaceTarget {
  cwd: string;
  source: "execution_workspace" | "project_workspace" | "project_codebase";
  executionWorkspaceId: string | null;
  projectWorkspaceId: string | null;
  repoUrl: string | null;
  branchName: string | null;
}

type WorkflowProjectWorkspace = {
  id: string;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  sourceType?: string | null;
};

type WorkflowProject = {
  primaryWorkspace: WorkflowProjectWorkspace | null;
  workspaces: WorkflowProjectWorkspace[];
  codebase: {
    effectiveLocalFolder: string;
    repoUrl: string | null;
    repoRef: string | null;
  };
};

type WorkflowExecutionWorkspace = {
  id: string;
  cwd: string | null;
  projectWorkspaceId: string | null;
  repoUrl: string | null;
  branchName: string | null;
};

export interface GitWorkspaceInspection extends GitWorkspaceTarget {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  headSha: string;
  aheadCount: number;
  behindCount: number;
  hasTrackedChanges: boolean;
}

function readNonEmptyString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function runGit(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout.trim();
}

function resolveProjectWorkspace(project: WorkflowProject | null, issue: Pick<Issue, "projectWorkspaceId">) {
  if (!project) return null;
  if (!issue.projectWorkspaceId) {
    return project.primaryWorkspace ?? project.workspaces[0] ?? null;
  }
  return project.workspaces.find((workspace) => workspace.id === issue.projectWorkspaceId) ?? project.primaryWorkspace ?? null;
}

function workspaceTargetFromProjectWorkspace(workspace: WorkflowProjectWorkspace | null): GitWorkspaceTarget | null {
  const cwd = readNonEmptyString(workspace?.cwd);
  if (!cwd) return null;
  return {
    cwd,
    source: "project_workspace",
    executionWorkspaceId: null,
    projectWorkspaceId: workspace?.id ?? null,
    repoUrl: workspace?.repoUrl ?? null,
    branchName: workspace?.repoRef ?? null,
  };
}

export function isGitBackedDevelopmentProject(project: WorkflowProject | null | undefined) {
  return project?.primaryWorkspace?.sourceType === "git_repo";
}

export function resolveIssueGitWorkspaceTarget(input: {
  issue: Pick<Issue, "projectWorkspaceId">;
  project: WorkflowProject | null;
  executionWorkspace: WorkflowExecutionWorkspace | null;
}): GitWorkspaceTarget | null {
  const executionWorkspaceCwd = readNonEmptyString(input.executionWorkspace?.cwd);
  if (executionWorkspaceCwd) {
    return {
      cwd: executionWorkspaceCwd,
      source: "execution_workspace",
      executionWorkspaceId: input.executionWorkspace?.id ?? null,
      projectWorkspaceId: input.executionWorkspace?.projectWorkspaceId ?? null,
      repoUrl: input.executionWorkspace?.repoUrl ?? null,
      branchName: input.executionWorkspace?.branchName ?? null,
    };
  }

  const projectWorkspace = resolveProjectWorkspace(input.project, input.issue);
  const projectWorkspaceTarget = workspaceTargetFromProjectWorkspace(projectWorkspace);
  if (projectWorkspaceTarget) return projectWorkspaceTarget;

  const fallbackCodebasePath = readNonEmptyString(input.project?.codebase.effectiveLocalFolder);
  if (!fallbackCodebasePath) return null;

  return {
    cwd: fallbackCodebasePath,
    source: "project_codebase",
    executionWorkspaceId: null,
    projectWorkspaceId: projectWorkspace?.id ?? input.project?.primaryWorkspace?.id ?? null,
    repoUrl: input.project?.codebase.repoUrl ?? null,
    branchName: input.project?.codebase.repoRef ?? null,
  };
}

export function gitWorkspaceService() {
  const inspect = async (target: GitWorkspaceTarget): Promise<GitWorkspaceInspection> => {
    const [repoRoot, branch, headSha, statusOutput] = await Promise.all([
      runGit(target.cwd, ["rev-parse", "--show-toplevel"]),
      runGit(target.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
      runGit(target.cwd, ["rev-parse", "HEAD"]),
      runGit(target.cwd, ["status", "--porcelain", "--untracked-files=no"]),
    ]);

    const upstream = await runGit(target.cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
      .catch(() => null);
    let aheadCount = 0;
    let behindCount = 0;
    if (upstream) {
      const countsOutput = await runGit(target.cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
      const [aheadRaw, behindRaw] = countsOutput.split(/\s+/);
      aheadCount = Number.parseInt(aheadRaw ?? "0", 10) || 0;
      behindCount = Number.parseInt(behindRaw ?? "0", 10) || 0;
    }

    return {
      ...target,
      repoRoot,
      branch,
      upstream,
      headSha,
      aheadCount,
      behindCount,
      hasTrackedChanges: statusOutput.length > 0,
    };
  };

  return {
    resolveIssueWorkspaceTarget: resolveIssueGitWorkspaceTarget,

    inspect,

    inspectIssueWorkspace: async (input: {
      issue: Pick<Issue, "projectWorkspaceId">;
      project: WorkflowProject | null;
      executionWorkspace: WorkflowExecutionWorkspace | null;
    }): Promise<GitWorkspaceInspection | null> => {
      const target = resolveIssueGitWorkspaceTarget(input);
      if (!target) return null;
      return await inspect(target);
    },
  };
}
