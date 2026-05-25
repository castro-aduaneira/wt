---
name: wt-container-tracker
description: Use wt in the Container Tracker repository. Covers PR 529 script mappings, active Supabase workflows, staging/emancipated state, CI pnpm version pitfalls, and which local wrappers must not be deleted yet.
---

# wt for Container Tracker

Use this skill when working in `castro-aduaneira/container-tracker` after the migration to `@marcuscastelo/wt`.

## Required Config

Container Tracker must have `wt.config.json`:

```json
{
  "runtime": {
    "rootDirName": "ct-local-envs",
    "stageProjectIdPrefix": "ct_stage_",
    "worktreeProjectIdPrefix": "ct_dev_"
  },
  "supabase": {
    "enabled": true,
    "configPath": "supabase/config.toml"
  }
}
```

## Scripts Routed Through wt

The main worktree/stage lifecycle should use:

```json
{
  "db:worktree:init": "wt db worktree init",
  "db:worktree:status": "wt db worktree status",
  "db:stage:ensure": "wt db stage ensure",
  "db:stage:status": "wt db stage status",
  "db:stage:refresh-local-snapshot": "wt db stage refresh-local-snapshot",
  "db:stage:rebuild": "wt db stage rebuild",
  "db:emancipate": "wt db emancipate",
  "db:rejoin": "wt db rejoin"
}
```

Active Supabase scripts:

```json
{
  "supabase:active:start": "wt supabase start",
  "supabase:active:stop": "wt supabase stop",
  "supabase:active:status": "wt supabase status",
  "supabase:active:status:env": "wt supabase status --env"
}
```

Compatibility scripts should stay isolated until a later cleanup decision:

```json
{
  "supabase:start": "wt supabase start --isolated",
  "supabase:start:analytics": "wt supabase start --isolated --with-analytics",
  "supabase:stop": "wt supabase stop --isolated",
  "supabase:status": "wt supabase status --isolated",
  "supabase:status:env": "wt supabase status --isolated --env"
}
```

## State Rules

`wt db worktree status` must print state v2.

Expected modes:

- `staging`: active Supabase commands use shared staging.
- `emancipated`: active Supabase commands use the worktree dev stack.

Expected project prefixes:

- shared staging: `ct_stage_`
- worktree dev: `ct_dev_`

## Safe Workflow

Before work in a linked worktree:

```bash
pnpm run db:worktree:init
pnpm run db:worktree:status
```

Use shared staging:

```bash
pnpm run db:rejoin
pnpm run supabase:active:start
pnpm run supabase:active:status
```

Use a worktree dev stack:

```bash
pnpm run db:emancipate
pnpm run db:worktree:status
pnpm run supabase:active:status
```

Return before abandoning or deleting a worktree:

```bash
pnpm run db:rejoin
```

## Active Supabase Safety

In `mode: staging`:

```bash
pnpm run supabase:active:stop
```

must fail/refuse. It must not stop shared staging.

In `mode: emancipated`:

```bash
pnpm run supabase:active:stop
pnpm run supabase:active:start
```

must stop and restart only the worktree dev stack.

## Required Smoke Tests

For PRs touching Container Tracker wt scripts:

```bash
pnpm run db:stage:status
pnpm run db:stage:ensure
pnpm run db:worktree:init
pnpm run db:worktree:status
pnpm run db:rejoin
pnpm run supabase:active:start
pnpm run supabase:active:status
pnpm run supabase:active:stop || true
pnpm run db:emancipate
pnpm run supabase:active:stop
pnpm run supabase:active:start
pnpm run db:rejoin
pnpm run type-check
pnpm run architecture:boundary-scan
```

## Not Migrated Yet

Do not remove these local wrappers yet:

```text
supabase:reset
supabase:db:diff
supabase:gen-types
initialize-worktree
destroy-worktree
```

They need a follow-up PR adding equivalent `wt` commands and smoke tests.

## Follow-Up Plan

PR 1: main migration to `wt@^0.12.0`.

PR 2: add remaining Supabase wrapper commands to `wt`, likely:

```bash
wt supabase reset --stage
wt supabase db diff --stage
wt supabase gen-types --stage --lang typescript
```

PR 3: audit and remove old scripts after parity exists.

## Pnpm CI Pitfall

If `package.json` has `packageManager`, do not set a conflicting version in `pnpm/action-setup`.

Correct:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
```

Incorrect when `packageManager` pins another version:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9
```

## Safety Rules

- Do not paste full output from `supabase:active:status:env` in public PRs.
- Do not manually edit `.env` to switch environments.
- Do not stop shared staging from staging mode.
- Do not include `.env`, `.worktree-state.json`, or `.git/ct-local-envs` in commits.
- Keep wrapper migration PRs narrow.
