# Linear Plugin

First-party Paperclip plugin for syncing Paperclip issues with Linear issues.

## What It Does

- syncs Paperclip issue title, description, status, comments, and `blocks` dependencies to Linear
- pulls Linear issue updates back into Paperclip on a schedule
- supports optional webhook ingest for faster issue refreshes
- adds a settings page, dashboard widget, issue detail tab, and company page

## Development

```bash
pnpm --filter @paperclipai/plugin-linear typecheck
pnpm --filter @paperclipai/plugin-linear test
pnpm --filter @paperclipai/plugin-linear build
```

## Configuration

Create one company mapping per synced company:

- `companyId`: Paperclip company UUID
- `teamId`: Linear team UUID
- `apiTokenSecretRef`: secret ref whose resolved value is either a Linear API key or a full `Bearer ...` token
- `syncDirection`: `pull`, `push`, or `bidirectional`

Optional flags:

- `importLinearIssues`
- `autoCreateLinearIssues`
- `syncComments`
- `blockedStateName`
- `graphqlUrl`
- `webhookSecretRef`
