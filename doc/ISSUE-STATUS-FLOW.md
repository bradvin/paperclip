# Issue Status Flow

This document explains the hard-policy runtime for git-backed development issues, including deterministic routing, the human intervention lane, and the CEO merge gate.

## Status Set

Paperclip issue statuses are:

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

## Core Runtime Rule

`in_progress` is the only status that means an agent currently owns active execution for the issue.

Queued or review statuses such as `todo`, `testing`, `human_review`, `rework`, and `merging` describe who should act next, but they do not hold the execution lock by themselves. Agents must still checkout the issue before they begin work.

## Status Meanings

### `backlog`

- New/default parking state.
- Not yet active.
- Assigned agents are not auto-woken while the issue remains in backlog.

### `todo`

- Standard queued work for an agent.
- Actionable.
- Checkout moves it to `in_progress`.

### `in_progress`

- Active execution state.
- Requires an assignee.
- Set by checkout.
- Used for run ownership and execution locking.

### `testing`

- Waiting on QA verification.
- Used when implementation is complete but QA review has not happened yet.
- Can be left unassigned so Paperclip can route it deterministically to QA.
- Checkout moves it to `in_progress`.

### `human_review`

- Exception-only human intervention lane.
- Use this when a person must act before work can continue: missing requirements, secrets, permissions, or an operator decision.
- When unassigned on a development issue, Paperclip routes it to the canonical board user (`reviewOwnerUserId`, with creator fallback if needed).
- Not part of the normal happy path.

### `rework`

- QA found problems and sent the issue back for implementation changes.
- The next action belongs to an agent, but work has not been checked out yet.
- Checkout moves it to `in_progress`.

### `merging`

- QA passed and the next step is final merge/integration execution by the CEO.
- The CEO is responsible for merging, pushing, and only then closing the issue.
- Checkout moves it to `in_progress`.

### `blocked`

- The issue cannot move forward without an unblocker.
- For dependency-blocked work, Paperclip may redirect checkout to an actionable blocker in the dependency chain.

### `done`

- Terminal success state.
- Completion timestamp is set automatically.

### `cancelled`

- Terminal non-success state.
- Cancellation timestamp is set automatically.

## Canonical Flow

The hard-policy development flow is:

```text
backlog -> todo -> in_progress(dev) -> testing -> in_progress(qa) -> rework | merging
rework -> in_progress(dev) -> testing
merging -> in_progress(ceo) -> done
```

`human_review` is not in the happy path. It is the exception lane for human intervention.

When development implementation is complete, the default handoff is `testing`, not `human_review`.

Development-specific transition constraints:

```text
testing -> rework | merging | blocked | cancelled
human_review -> testing | rework | merging | cancelled
merging -> in_progress | rework | human_review | blocked | cancelled
```

Not allowed for git-backed development issues:

- `testing -> human_review`
- `human_review -> done`
- `merging -> done` without CEO checkout
- engineer/devops `in_progress -> done`
- engineer/devops `in_progress -> merging`
- QA `in_progress -> done`
- board `-> done`

## Human Intervention Loop

Use `human_review` only when human action is required before the workflow can continue.

Typical examples:

- missing product decision or approval
- secret, credential, or permission needed from a person
- operator action required outside the repo
- ambiguous requirements that need board clarification

Agent handoffs to `human_review` must include a structured comment:

- `Human needed: ...`
- `Why the agent cannot continue: ...`
- `Requested action: ...`
- `After resolution route to: testing | rework | merging`

For git-backed development issues, the server rejects agent `human_review` handoffs that do not include this structure. Engineer/devops agents should default to `testing` when implementation is complete.

Board resolution paths:

- send back to `rework` if implementation must resume
- send to `testing` if QA should resume
- send to `merging` if CEO merge work should resume

Board users do not directly mark git-backed development issues `done`.

## Structured Agent Handoffs

When dev or QA hands work to another agent on a git-backed development issue, the handoff comment must use one of these structured formats.

Review handoff:

- `Handoff type: review`
- `Route to: testing | merging`
- `Target role: qa | ceo`
- `Commit: <sha>`
- `Branch: <branch-name>`
- `Summary: <one-line summary>`
- `Verification: <tests/checks run and result>`
- `Review focus: <what the next agent should inspect>`
- `Known risks: <known gaps or none>`
- `Blocking issues: <none or short note>`

Rework handoff:

- `Handoff type: rework`
- `Route to: rework`
- `Target role: engineer_or_devops`
- `Tested commit: <sha>`
- `Failure summary: <one-line problem statement>`
- `Expected behavior: <what should happen>`
- `Observed behavior: <what actually happened>`
- `Repro steps: <compact repro>`
- `Evidence: <tests, logs, screenshots, or manual result>`
- `Required fix: <what must change before retest>`
- `Return criteria: <what QA will accept next time>`
- `Severity: low | medium | high | critical`

Server enforcement:

- engineer/devops `-> testing` requires the structured review handoff
- QA `-> rework` requires the structured rework handoff
- QA `-> merging` requires the structured review handoff

## Deterministic Routing

Paperclip now handles the routine workflow handoffs in the control plane instead of relying on CEO heartbeats.

The intended development flow is:

1. Unassigned `todo` routes server-side to engineer/devops.
2. Dev finishes implementation and hands off to unassigned `testing`.
3. Unassigned `testing` routes server-side to QA.
4. QA either:
   - sends failures to unassigned `rework`, which routes back to engineer/devops, or
   - sends passes to unassigned `merging`, which routes to the CEO.
5. CEO checks out `merging`, performs the merge/push work, and only then marks the issue `done`.

`human_review` is separately server-routed to the canonical board user.

For git-backed development issues there is no role-dilution fallback:

- no QA fallback to CEO
- no merge fallback to engineer/devops
- no in-review fallback to arbitrary users

If no eligible assignee exists, the issue stays unassigned and Paperclip logs an explicit routing failure for the board.

## Agent Behavior For `testing`, `rework`, And `merging`

For an assignee agent, `testing`, `rework`, and `merging` behave like specialized queued states:

- they appear in the agent inbox
- they are eligible for checkout
- checkout transitions them to `in_progress`

This keeps execution semantics simple:

- queued state says what kind of work it is
- `in_progress` says the work is actively running

If a checked-out issue is released, Paperclip restores the remembered queued status that existed before checkout instead of flattening everything back to `todo`.

## Git Policy

Git-backed development issues enforce repo-state checks at handoff:

- before an agent exits active work to `testing`, `rework`, `merging`, `human_review`, `blocked`, `done`, or on release, the workspace must have no tracked uncommitted changes
- if tracked changes remain, Paperclip rejects the handoff and tells the agent to commit first
- Paperclip records `branch` and `commit` work products from the current git state during clean handoffs

CEO `done` gate:

- only the CEO can close active merge work
- the branch must be clean
- the branch must have a tracked upstream
- the branch must have no unpushed commits remaining
- if a PR work product exists, completion may mark it `merged`

## Dependency Behavior

Dependencies are modeled separately from status.

- `blocked` may be used for dependency-blocked work
- checkout of a blocked issue may redirect to an actionable blocker
- when a blocker becomes `done` or `cancelled`, dependents that become actionable may wake their assigned agents

This means `blocked` is about readiness, while `testing`, `rework`, and `merging` are about review and orchestration intent.

## Pull Requests And Work Products

Paperclip tracks engineering outputs as issue work products.

Relevant work product types include:

- `pull_request`
- `branch`
- `commit`

Recommended relationship between issue status and work products:

- issue `testing` + latest branch/commit recorded for QA
- issue `rework` + branch stays active while implementation resumes
- issue `merging` + CEO merge lane
- issue `done` + branch/commit recorded cleanly and PR marked `merged` when present

The issue status answers:

- who should act next
- what stage the task is in

The PR work product answers:

- what is happening in GitHub
- what review or merge state the code is in

## Recommended Operational Use

Use statuses this way:

- `todo`: ordinary queued implementation work
- `in_progress`: active agent execution
- `testing`: waiting on QA, usually routed by the control plane
- `human_review`: waiting on human decision
- `rework`: human or QA requested code changes, usually routed by the control plane
- `merging`: human approved direction, integration still remains, usually routed by the control plane
- `blocked`: cannot proceed because something else must unblock it
- `done`: fully complete
- `cancelled`: closed without completion
