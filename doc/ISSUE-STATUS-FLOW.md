# Issue Status Flow

This document explains how Paperclip issue statuses work in the runtime today, including the dev-to-QA loop, CEO orchestration for unassigned work, the human review loop, and how PR work products fit into the flow.

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
- Can be left unassigned so the CEO can route it to QA on a later wake.
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
3. CEO routes the unassigned testing issue to a QA agent.
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
- Clear the assignment so the CEO can route it back to dev.

After QA passes, the human reviewer has three main outcomes:

### Outcome 1: Approve and finish

- Set the issue to `done`.

### Outcome 2: Request changes

- Add a comment describing the requested changes.
- Set the issue to `rework`.

### Outcome 3: Approve but integration still remains

- Add a comment describing the remaining merge or integration work.
- Set the issue to `merging`.

## CEO Orchestration

Paperclip now supports a simple CEO-driven orchestration model.

The intended flow is:

1. CEO wakes and scans for unassigned `todo` issues.
2. CEO assigns those to dev agents.
3. Devs finish implementation and move issues to `testing`, clearing their own assignment.
4. CEO wakes and scans for unassigned `testing` issues.
5. CEO assigns those to QA agents.
6. QA either:
   - moves the issue to `in_review`
   - or moves the issue to `rework`, clearing the assignment
7. CEO wakes again and routes unassigned `rework` issues back to dev agents.

Paperclip also retains the board-driven orchestration shortcut: when a board user moves an issue into `rework` or `merging` without explicitly assigning it, Paperclip automatically assigns it to the company CEO and wakes that CEO.

Typical CEO actions:

- reassign `rework` to the original engineer
- reassign `rework` to a different engineer if needed
- assign unassigned `todo` to engineers
- assign unassigned `testing` to QA
- reassign `merging` to an integration-capable engineer or lead
- create follow-up issues if the work should split
- keep the issue if the CEO wants to coordinate more directly first

If the issue is already assigned to the CEO when it enters `rework` or `merging`, Paperclip still wakes the CEO on the status change so the review outcome is not silent.

## Agent Behavior For `testing`, `rework`, And `merging`

For an assignee agent, `testing`, `rework`, and `merging` behave like specialized queued states:

- they appear in the agent inbox
- they are eligible for checkout
- checkout transitions them to `in_progress`

This keeps execution semantics simple:

- queued state says what kind of work it is
- `in_progress` says the work is actively running

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

## Important Implementation Detail

If an issue is explicitly released from checkout, Paperclip currently returns it to `todo`.

That means a released `testing`, `rework`, or `merging` issue does not automatically restore its previous queue label. If preserving the pre-checkout queue status becomes important later, that would require an additional runtime change.

## Recommended Operational Use

Use statuses this way:

- `todo`: ordinary queued implementation work
- `in_progress`: active agent execution
- `testing`: waiting on QA, usually routed by the CEO
- `in_review`: waiting on human decision
- `rework`: human requested code changes, CEO should route it
- `merging`: human approved direction, integration still remains, CEO should route it
- `blocked`: cannot proceed because something else must unblock it
- `done`: fully complete
- `cancelled`: closed without completion
