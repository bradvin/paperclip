# Paperclip

This fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip) is set up as a control plane for engineering teams.

It keeps the original company, agent, project, issue, and board model, but the workflow and defaults in this fork are aimed at software delivery rather than the upstream "run your business" framing. The important additions are a Linear-oriented issue lifecycle, dependency-aware routing, first-party Linear sync, company runtime controls, project cleanup actions, and better operational visibility for agent work.

## Fork Differences From Upstream

This fork adds or changes the following behavior compared to the upstream repository. The list below is meant to capture the operator-facing behavior introduced by fork-only commits; test-only changes, internal refactors, and doc-only commits are intentionally left out.

- Engineering workflow states: `testing`, `human_review`, `rework`, `merging`, and `blocked` are part of the normal runtime model.
- Deterministic workflow routing: normal queue handoffs are handled by the control plane instead of relying on a CEO heartbeat to notice unassigned work.
- Dependency-aware execution: issues support first-class `blocks` and `blockedBy` relations, checkout can redirect to actionable blockers, and the UI shows dependency state.
- Persistent workflow handoff state: when checked-out work is released, Paperclip restores the prior queued state instead of flattening everything back to `todo`.
- Linear sync plugin: first-party plugin for syncing Paperclip issues, comments, statuses, blocking relationships, and linked projects with Linear.
- Guided Linear setup and sync controls: the bundled Linear plugin can be enabled from the UI, mapped to a matching Linear team, configured with per-status sync rules, previewed with a dry run, pulled manually, fully resynced, and reset back to a clean cursor without editing config files by hand.
- Linear sync visibility: plugin settings and dashboard surfaces show recent pull activity, success/failure history, and the last sync cursor so operators can see what the importer is doing.
- Company-level runtime controls: board users can stop or start an entire company and resume only the agents paused by that action.
- Cost checkpoints and reporting: operators can mark checkpoints and compare spend between checkpoints on the Costs page.
- Engineering-team setup helpers: company settings can create a deterministic dummy issue suite for workflow testing, and agent configuration includes an explicit role selector.
- Project and issue cleanup actions: issue detail supports direct issue deletion, and project detail supports deleting all issues in a project or deleting the project itself.
- Optional CEO todo auto-assignment: a company setting can re-enable CEO-based todo assignment, but it is off by default because deterministic routing now covers normal queue movement.
- Adapter/runtime fixes: this fork also includes reliability fixes for `pi-local`, skill injection, tool-result parsing, and an `openclaw-gateway` challenge rejection crash.

## Core Concepts

- Company: the top-level operating boundary. In this fork, treat a company as one engineering organization, product line, or tightly related set of repos.
- Board user: the human operator. Board access is the control surface for approvals, company settings, plugin settings, and review decisions.
- Agent: an automated worker with a role such as CEO, engineer, QA, or devops.
- Project: a product area, codebase, repo, or initiative inside a company.
- Issue: a unit of work. Issues are single-assignee and company-scoped.
- Dependency relation: an explicit `blocks` or `blockedBy` relationship between issues.
- Heartbeat: a scheduled wake-up loop for an agent.
- Plugin: an integration or extension running inside the Paperclip plugin runtime. In this fork, the Linear plugin is the main first-party example.

## Default Engineering Workflow

Paperclip issue statuses in this fork are:

- `backlog`
- `todo`
- `in_progress`
- `testing`
- `human_review`
- `rework`
- `merging`
- `blocked`
- `done`
- `cancelled`

`in_progress` is the only active execution state. Every other non-terminal status is a queued, review, or blocked state that describes what should happen next.

| Status | Intended use | Typical next actor |
| --- | --- | --- |
| `backlog` | parked work, not yet active | board or lead |
| `todo` | ready implementation work | engineer or devops |
| `in_progress` | actively checked out work | current assignee |
| `testing` | implementation complete, waiting on QA | QA |
| `human_review` | QA passed, waiting on human decision | board user / reviewer |
| `rework` | QA or human review requested changes | engineer or devops |
| `merging` | approved, but integration or merge work remains | devops or engineer |
| `blocked` | waiting on an unblocker | depends on blocker |
| `done` | complete | none |
| `cancelled` | closed without completion | none |

Canonical flow:

```text
backlog -> todo -> in_progress -> testing -> human_review -> done
```

Common alternate paths:

```text
testing -> rework
human_review -> rework
human_review -> merging
blocked -> todo | testing | rework | merging
```

Deterministic routing in this fork works like this:

- unassigned `todo` work is assigned server-side to an implementation agent
- unassigned `testing` work is assigned server-side to QA
- `human_review` is routed back for human review
- unassigned `rework` is routed back to implementation
- `merging` is routed to devops or the most relevant implementation agent

Dependencies are separate from status:

- use `blocks` and `blockedBy` for actual issue ordering
- keep `blocked` for work that is not currently actionable
- if a blocked issue is checked out, Paperclip can redirect to an actionable blocker

For full runtime details, see [doc/ISSUE-STATUS-FLOW.md](doc/ISSUE-STATUS-FLOW.md).

## Defaults In This Fork

- Company status defaults to `active`.
- Company issue prefix defaults to `PAP`.
- Company monthly budget defaults to `0`, which means no monthly hard cap has been set yet.
- `requireBoardApprovalForNewAgents` defaults to `true`.
- `autoAssignTodoOnCeoHeartbeat` defaults to `false`.
- Local development uses embedded PostgreSQL when `DATABASE_URL` is unset.
- Local development storage uses local disk under the Paperclip home directory.
- The Linear plugin defaults each mapping to:
  - `syncDirection = bidirectional`
  - `importLinearIssues = true`
  - `autoCreateLinearIssues = true`
  - `syncComments = true`

The practical result is that this fork expects the control plane to handle routine engineering queue movement, while a human board user handles approval and final review.

## Quickstart

Requirements:

- Node.js 20+
- pnpm 9+

Manual local run:

```bash
git clone https://github.com/bradvin/paperclip.git
cd paperclip
pnpm install
pnpm dev
```

This starts:

- API server at `http://localhost:3100`
- UI at `http://localhost:3100`

If `DATABASE_URL` is unset, Paperclip uses embedded PostgreSQL automatically and stores local data under `~/.paperclip/instances/default/`.

One-command local run:

```bash
pnpm paperclipai run
```

That command auto-onboards a local instance if needed, runs doctor checks, and starts the server.

## Recommended Setup For An Engineering Team

1. Create one company per engineering organization or per clearly separated product team.
2. Set the company issue prefix to something your team will recognize in the UI and in linked references.
3. Create agents with explicit operational roles:
   - one CEO or lead agent for escalation and coordination
   - one or more engineer agents
   - one QA agent
   - optionally one devops / merge agent
4. Keep normal implementation work in `todo` and let the server route it.
5. Move completed implementation to `testing`, not directly to `done`.
6. Use `human_review` for human review, `rework` for requested changes, and `merging` for approved work that still needs integration.
7. Model dependency chains with `blocks` and `blockedBy` instead of burying blockers in comments.
8. Use company stop/start controls when you want to pause an entire team without manually pausing each agent.
9. Use cost checkpoints before and after experiments, large refactors, or review cycles so you can compare spend across intervals.
10. Use the dummy issue suite in Company Settings when testing routing, QA, review, and dependency behavior.

## Linear Plugin

This fork includes a first-party Linear plugin intended for engineering use.

What it syncs:

- issue title
- description
- status
- comments
- blocking dependencies
- linked projects

What it adds to the UI:

- a plugin settings page
- a dashboard widget
- an issue detail tab
- a company-context page
- recent sync activity with success/failure history
- manual dry-run, pull-recent, full-resync, and cursor-reset controls

How to enable it:

1. Open `Settings -> Plugins`.
2. Enable `Linear Sync`.
3. Open the plugin settings page.
4. Add one company mapping for each Paperclip company you want to sync.

Each mapping includes:

- Paperclip company
- Linear team ID
- Linear API key
- sync direction: `pull`, `push`, or `bidirectional`
- optional "force match identifier" behavior so Paperclip issue identifiers can follow Linear identifiers on pull
- workflow status mappings for each Linear team status, including per-status sync mode (`disabled`, `pull`, `push`, or `bidirectional`)
- optional comment sync toggle
- optional auto-import / auto-create toggles
- optional blocked state name override
- optional GraphQL URL override
- optional webhook secret

Important operational details:

- the API key and webhook secret are stored as company secrets; plugin config stores secret references, not raw secret values
- the default poll job pulls Linear updates on a schedule
- manual sync tools let you preview the next incremental pull, pull recent changes immediately, run a full resync, or reset the stored cursor for a company mapping
- recent sync activity records successful pulls and failures, including the related Linear issue or project when available
- Linear project data can link synced Linear issues back to Paperclip projects during pull sync
- webhook ingest is optional, but useful if you want faster refresh than polling alone
- if your Linear workflow has a dedicated blocked state, set `blockedStateName` so blocked work maps cleanly

## Supported Local Adapters

This repo currently includes local or gateway adapters for:

- `claude-local`
- `codex-local`
- `cursor-local`
- `gemini-local`
- `openclaw-gateway`
- `opencode-local`
- `pi-local`

## Development

Common commands:

```bash
pnpm dev
pnpm dev:once
pnpm dev:server
pnpm build
pnpm typecheck
pnpm test:run
pnpm db:generate
pnpm db:migrate
```

Useful docs:

- [doc/DEVELOPING.md](doc/DEVELOPING.md)
- [doc/DATABASE.md](doc/DATABASE.md)
- [doc/SPEC-implementation.md](doc/SPEC-implementation.md)
- [docs/start/quickstart.md](docs/start/quickstart.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
