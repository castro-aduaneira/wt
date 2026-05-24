---
name: wt-supabase
description: Run isolated local Supabase stacks and bind .env safely using the wt CLI. Use when a worktree needs Supabase without port conflicts, when db:emancipate/rejoin is needed, or when local Supabase env vars must be inspected without rewriting user-owned .env values.
---

# wt Supabase

Use this skill when an agent needs to run local Supabase safely in a repository that uses `@marcuscastelo/wt`.

## When to Use

Use `wt` Supabase commands when:

- the repository has `supabase/config.toml`;
- multiple worktrees may need their own local Supabase stack;
- canonical/staging ports may already be occupied;
- the agent needs to bind `.env` to an isolated stack temporarily;
- local Supabase status/env output is needed without exposing or rewriting user-owned `.env` values.

## Workflow

### 1. Inspect Config

Canonical config:

```bash
wt supabase config
```

Generated isolated config:

```bash
wt supabase config --isolated
```

Check that isolated ports are not the canonical `5432x` ports. They should normally be deterministic `4xxxx` ports.

### 2. Start, Status, and Stop Isolated Supabase

Prefer isolated mode for worktrees:

```bash
wt supabase status --isolated
wt supabase start --isolated
wt supabase status --isolated
wt supabase status --isolated --env
wt supabase stop --isolated
```

Use analytics only when needed:

```bash
wt supabase start --isolated --with-analytics
```

### 3. Bind .env to Isolated Supabase

```bash
wt db emancipate
```

This starts the isolated stack and writes a `WT MANAGED ENV` block to `.env`.

Return to the original `.env`:

```bash
wt db rejoin
```

This stops the isolated stack and removes only the managed block.

### 4. Smoke Test .env Safety

Before testing `.env` mutation, always back it up:

```bash
cp .env /tmp/wt-env-before
wt db emancipate
grep -n "WT MANAGED ENV" -A30 .env
wt db rejoin
diff -u /tmp/wt-env-before .env || true
```

Expected result: no diff, or newline-only diff.

## GUI Hook Mapping

If a GUI supports worktree lifecycle hooks:

```bash
# After worktree creation
wt init

# Before or after worktree deletion
wt db rejoin || true
```

Do not run `wt db emancipate` automatically on every worktree unless the project explicitly needs a database for every task. Prefer manual emancipation when the task needs Supabase.

## Safety Rules

- Treat `wt supabase status --env` output as log-sensitive.
- Never paste full Supabase keys into public PRs or issues.
- Never manually remove user-owned `SUPABASE_*`, `POSTGRES_*`, or `VITE_PUBLIC_SUPABASE_*` values outside the managed block.
- Prefer `--isolated` in worktrees to avoid port conflicts.
- Do not replace repository-specific staging scripts unless equivalent behavior has been implemented and smoke-tested in `wt`.
- Always run `wt db rejoin` before abandoning or deleting a worktree that was emancipated.
