---
name: wt-repo-migration
description: Plan and execute a safe repository migration from local worktree/Supabase wrapper scripts to wt. Use when migrating package.json scripts, adding wt.config.json, updating CI pnpm versioning, or planning cleanup PRs.
---

# wt Repo Migration

Use this skill when a repository is being migrated from repo-local worktree or Supabase scripts to `@marcuscastelo/wt`.

## Migration Principles

Keep migrations narrow and phased.

Do not remove old scripts in the same PR that first routes commands through `wt`, unless every behavior has already been ported and smoke-tested.

Prefer this sequence:

1. Add `wt.config.json` and route safe scripts through `wt`.
2. Add missing `wt` commands in the `wt` repo and bump `@marcuscastelo/wt`.
3. Audit and remove obsolete local scripts in the downstream repo.

## Phase 1: Safe Script Migration

Add `wt` as a dev dependency:

```bash
pnpm add -D @marcuscastelo/wt@^<version> --lockfile-only --ignore-scripts
```

Add `wt.config.json`.

Example for a generic repo:

```json
{
  "runtime": {
    "rootDirName": "wt-local-envs",
    "stageProjectIdPrefix": "wt_stage_",
    "worktreeProjectIdPrefix": "wt_dev_"
  },
  "supabase": {
    "enabled": true,
    "configPath": "supabase/config.toml"
  }
}
```

Example for Container Tracker:

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

Route only commands that are already implemented and smoke-tested in `wt`.

Typical safe mappings:

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

Add active Supabase scripts without deleting legacy isolated scripts:

```json
{
  "supabase:active:start": "wt supabase start",
  "supabase:active:stop": "wt supabase stop",
  "supabase:active:status": "wt supabase status",
  "supabase:active:status:env": "wt supabase status --env"
}
```

## Phase 1 Smoke Tests

Run targeted validation:

```bash
pnpm install --frozen-lockfile --ignore-scripts
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

Expected:

- active stop refuses in staging mode;
- active stop/start operates only on the worktree dev stack in emancipated mode;
- `db:rejoin` returns to staging;
- no `.env` or `.worktree-state.json` is committed.

## CI Pnpm Versioning

If adding `packageManager` to `package.json`, do not leave conflicting `pnpm/action-setup` versions.

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

If CI fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, verify pnpm version/config parity before changing package versions.

## Phase 2: Add Missing wt Commands

If downstream scripts still call local wrappers, add the missing command to `wt` first.

Examples still not migrated in Container Tracker after PR #529:

```text
supabase:reset
supabase:db:diff
supabase:gen-types
initialize-worktree
destroy-worktree
```

Recommended future commands:

```bash
wt supabase reset --stage
wt supabase db diff --stage
wt supabase gen-types --stage --lang typescript
```

Destructive commands such as reset should require an explicit target.

## Phase 3: Audit and Remove

Only after parity is implemented and smoke-tested, audit references:

```bash
grep -RIn "worktree-db.mjs" .
grep -RIn "supabase-local-db.mjs" .
grep -RIn "initialize-worktree.mjs" .
grep -RIn "destroy-worktree.mjs" .
```

Remove scripts only when no live references remain.

## Safety Rules

- Do not combine runtime migration with broad cleanup.
- Do not remove local scripts without explicit parity.
- Do not commit `.env`, `.worktree-state.json`, or runtime directories.
- Do not paste env output into PRs.
- Keep PR descriptions accurate; update testing notes after manual smoke tests.
