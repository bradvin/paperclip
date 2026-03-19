# Issue Status Flow

This document explains how Paperclip issue statuses work in the runtime today, including the dev-to-QA loop, deterministic control-plane routing, the human review loop, and how PR work products fit into the flow.

## Status Set

Paperclip issue statuses are:

- `backlog`
- `todo`
- `in_progress`
- `testing`
- `in_review`
- `rework`
- `merging`
- `blocked`
- `done`
- `cancelled`

## Core Runtime Rule

`in_progress` is the only status that means an agent currently owns active execution for the issue.

Queued or review statuses such as `todo`, `testing`, `in_review`, `rework`, and `merging` describe who should act next, but they do not hold the execution lock by themselves. Agents must still checkout the issue before they begin work.

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

### `in_review`

- Waiting on a human review decision.
- Usually assigned to a board user during handoff.
- Not an active agent execution state.

### `rework`

- Human reviewed the work and requested changes.
- The issue is no longer waiting on the human reviewer.
- The next action belongs to an agent, but work has not been checked out yet.
- Checkout moves it to `in_progress`.

### `merging`

- Human approved the code path, but merge or integration work still remains.
- Typical examples: merge conflicts, branch drift, final integration cleanup, or merge execution.
- The next action belongs to an agent, but work has not been checked out yet.
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

The normal implementation flow is:

```text
backlog -> todo -> in_progress -> testing -> in_review -> done
```

Additional transitions supported by the current model:

```text
todo -> blocked | cancelled
in_progress -> testing | blocked | done | cancelled
testing -> in_review | rework | cancelled
in_review -> rework | merging | done | cancelled
rework -> in_progress | blocked | cancelled
merging -> in_progress | blocked | done | cancelled
blocked -> todo | testing | rework | merging | in_progress | cancelled
```

`done` and `cancelled` are terminal.

## Human Review Loop

After a dev agent finishes implementation, the expected flow is:

1. Dev agent completes coding work.
2. Dev moves the issue to `testing` and clears the assignment.
3. Paperclip routes the unassigned testing issue to a QA agent.
4. QA reviews it.
5. If QA passes, the issue moves to `in_review`.
6. Human reviewer decides what happens next.

The QA reviewer has two main outcomes:

### Outcome 1: QA passes

- Set the issue to `in_review`.
- Optionally assign it back to the issue creator user for board pickup.
- Agent-to-human handoff is currently implemented as a narrow creator-user return, not arbitrary reassignment to any board user.

### Outcome 2: QA requests changes

- Add a comment describing the requested changes.
- Set the issue to `rework`.
- Clear the assignment so Paperclip can route it back to dev.

After QA passes, the human reviewer has three main outcomes:

### Outcome 1: Approve and finish

- Set the issue to `done`.

### Outcome 2: Request changes

- Add a comment describing the requested changes.
- Set the issue to `rework`.

### Outcome 3: Approve but integration still remains

- Add a comment describing the remaining merge or integration work.
- Set the issue to `merging`.

## Deterministic Routing

Paperclip now handles the routine workflow handoffs in the control plane instead of relying on CEO heartbeats.

The intended flow is:

1. Unassigned `todo` work is assigned server-side to an engineer/devops agent.
2. Dev finishes implementation and moves the issue to `testing`, clearing the assignment.
3. Paperclip assigns the unassigned `testing` issue server-side to QA.
4. QA reviews it.
5. If QA passes, the issue moves to `in_review`.
6. Paperclip assigns `in_review` server-side to the review owner or issue creator user.
7. If QA requests changes, QA moves the issue to `rework`, clearing the assignment.
8. Paperclip assigns the unassigned `rework` issue server-side back to an engineer/devops agent.

`merging` is also server-routed:

- first preference: devops or the previously working engineer
- fallback: another engineer
- final fallback: CEO if no eligible implementation agent exists

The CEO still matters for exceptions, but no longer needs to spend routine heartbeats scanning for normal unassigned queue work.

## Agent Behavior For `testing`, `rework`, And `merging`

For an assignee agent, `testing`, `rework`, and `merging` behave like specialized queued states:

- they appear in the agent inbox
- they are eligible for checkout
- checkout transitions them to `in_progress`

This keeps execution semantics simple:

- queued state says what kind of work it is
- `in_progress` says the work is actively running

If a checked-out issue is released, Paperclip restores the remembered queued status that existed before checkout instead of flattening everything back to `todo`.

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

Recommended relationship between issue status and PR state:

- issue `testing` + QA review in progress
- issue `in_review` + PR `ready_for_review`
- issue `rework` + PR `changes_requested`
- issue `merging` + PR `approved`
- issue `done` + PR `merged`

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
- `in_review`: waiting on human decision
- `rework`: human or QA requested code changes, usually routed by the control plane
- `merging`: human approved direction, integration still remains, usually routed by the control plane
- `blocked`: cannot proceed because something else must unblock it
- `done`: fully complete
- `cancelled`: closed without completion
