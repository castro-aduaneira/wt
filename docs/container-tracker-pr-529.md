# Container Tracker PR 529 Integration Notes

This document records the `wt` behavior validated while migrating Container Tracker PR #529 (`chore: migrate worktree database scripts to wt`).

The goal of this document is operational: LLMs and maintainers should know which commands are ready, which commands remain intentionally local, and which follow-up PRs are required before deleting old repository scripts.

## Final Scope of PR #529

Container Tracker PR #529 migrated the main worktree database lifecycle to `@marcuscastelo/wt@^0.12.0`.

Changed files in Container Tracker were intentionally limited to:

- `package.json`
- `pnpm-lock.yaml`
- `wt.config.json`

The PR added this repo-level config:

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

## Scripts Migrated to wt

The PR routes these scripts through `wt`:

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

The PR also adds active Supabase scripts while keeping the legacy isolated scripts:

```json
{
  "supabase:active:start": "wt supabase start",
  "supabase:active:stop": "wt supabase stop",
  "supabase:active:status": "wt supabase status",
  "supabase:active:status:env": "wt supabase status --env"
}
```

Existing `supabase:* --isolated` scripts were intentionally preserved for compatibility.

## Runtime Model Validated

Container Tracker uses a shared staging Supabase stack and optional per-worktree dev stacks.

Shared staging:

- project id prefix: `ct_stage_`
- runtime root: `.git/ct-local-envs/staging/project`
- canonical smoke project: `ct_stage_5af4027b`
- canonical smoke ports: `54321` API, `54322` DB

Per-worktree dev:

- project id prefix: `ct_dev_`
- runtime root: `.git/ct-local-envs/worktrees/<worktreeId>/project`
- canonical smoke project: `ct_dev_t3code_1b6d9701_398b81b7`
- canonical smoke ports: `56841` API, `56842` DB

## State Model Validated

`wt` writes state v2 in both places:

- `.worktree-state.json` inside the linked worktree
- `.git/ct-local-envs/worktrees/<worktreeId>/state.json` in the canonical repo runtime root

Runtime status can show `envMap: null` after normalization. Persisted state should omit `envMap`.

The active mode is one of:

- `staging`
- `emancipated`

In `staging` mode, active Supabase commands resolve to shared staging.

In `emancipated` mode, active Supabase commands resolve to the per-worktree dev stack.

## Environment Block Validated

Container Tracker uses this managed block:

```text
# >>> WORKTREE ENV MANAGED BLOCK >>>
...
# <<< WORKTREE ENV MANAGED BLOCK <<<
```

The block contains Container Tracker-compatible keys:

- `CT_WORKTREE_ENV_MODE`
- `CT_WORKTREE_ID`
- `CT_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWT_SECRET`
- `AGENT_ENROLL_SUPABASE_URL`
- `AGENT_ENROLL_SUPABASE_ANON_KEY`
- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_ANON_KEY`
- `POSTGRES_HOST`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_PRISMA_URL`
- `LOCAL_DB_URL`

`wt` must not delete user-owned `.env` assignments outside this block.

## Smoke Tests Completed

These commands were smoke-tested during PR #529:

```bash
pnpm run db:stage:status
pnpm run db:stage:ensure
pnpm run db:stage:refresh-local-snapshot
pnpm run db:stage:rebuild
pnpm run db:worktree:init
pnpm run db:worktree:status
pnpm run db:emancipate
pnpm run db:rejoin
pnpm run supabase:active:start
pnpm run supabase:active:status
pnpm run supabase:active:status:env
pnpm run supabase:active:stop
pnpm run type-check
pnpm run architecture:boundary-scan
```

Important validated behavior:

- `wt db rejoin` returns the worktree to shared staging.
- `wt db emancipate` starts or reattaches the dev stack and writes active dev env values.
- `wt supabase status` without `--isolated` follows active state.
- `wt supabase status --env` without `--isolated` follows active state.
- `wt supabase start` in staging ensures shared staging is running.
- `wt supabase stop` in staging refuses to stop shared staging.
- `wt supabase stop` in emancipated mode stops only the dev stack and marks it `stopped`/`preserved`.
- `wt supabase start` in emancipated mode reattaches/restarts the dev stack and marks it `running`.

## Safety Rules for LLMs

When working in Container Tracker:

1. Do not stop shared staging with `wt supabase stop` from `mode: staging`; the command should refuse.
2. Use `wt db rejoin` before abandoning or deleting a worktree.
3. Do not manually edit `.env` to switch Supabase stacks.
4. Do not paste full output from `wt supabase status --env` into public issues or PRs.
5. Do not remove repository-local scripts until explicit parity exists in `wt`.
6. Keep wrapper migration PRs narrow. Avoid unrelated formatter, domain, UI, or lockfile churn.

## Commands Still Not Migrated

The following Container Tracker scripts still depend on local wrappers after PR #529:

```json
{
  "supabase:reset": "node ./scripts/db/supabase-local-db.mjs reset",
  "supabase:db:diff": "node ./scripts/db/supabase-local-db.mjs diff",
  "supabase:gen-types": "... node ./scripts/db/supabase-local-db.mjs gen-types --lang typescript ...",
  "initialize-worktree": "node ./scripts/initialize-worktree.mjs",
  "destroy-worktree": "node ./scripts/destroy-worktree.mjs"
}
```

Do not delete these scripts until follow-up PRs implement and smoke-test equivalent `wt` commands.

## Follow-up Plan

### PR 1: Current PR #529

Status: main worktree/stage/dev stack migration.

Includes:

- `wt@^0.12.0`
- `wt.config.json`
- main `db:*` script migration
- new `supabase:active:*` scripts
- existing `supabase:* --isolated` scripts kept

### PR 2: Add remaining Supabase wrapper commands to wt

Add commands for:

```bash
wt supabase reset --stage
wt supabase db diff --stage
wt supabase gen-types --stage --lang typescript
```

Recommended policy:

- `reset` should require an explicit target such as `--stage`, `--emancipated`, or `--isolated`.
- `diff` should require an explicit target or default only after a conscious decision.
- `gen-types` should usually run against stage because generated DB types should reflect the canonical local schema.

This PR should bump `@marcuscastelo/wt`.

### PR 3: Audit and remove old scripts in Container Tracker

Only after PR 2 lands, audit references:

```bash
grep -RIn "worktree-db.mjs" .
grep -RIn "supabase-local-db.mjs" .
grep -RIn "initialize-worktree.mjs" .
grep -RIn "destroy-worktree.mjs" .
```

Remove obsolete scripts only when no live references remain and behavior has parity in `wt`.

This PR should not bump `wt` unless the audit discovers a real missing capability.

## CI/Pnpm Note from PR #529

Container Tracker CI was using `pnpm/action-setup@v4` with `version: 9`. Pinning `packageManager: pnpm@11.1.3` in `package.json` requires removing the conflicting workflow `version: 9`, or the setup step fails with `ERR_PNPM_BAD_PM_VERSION`.

If frozen install fails with lockfile config mismatch, verify pnpm version/config parity before changing dependencies.
