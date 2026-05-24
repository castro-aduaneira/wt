# wt Supabase Skill

Use this skill when an agent needs to run local Supabase safely in a repository that uses `@marcuscastelo/wt`.

## When to use

Use `wt` Supabase commands when:

- the repository has `supabase/config.toml`;
- multiple worktrees may need their own local Supabase stack;
- canonical/staging ports may already be occupied;
- the agent needs to bind `.env` to an isolated stack temporarily;
- local Supabase status/env output is needed without exposing or rewriting user-owned `.env` values.

## Inspect config

Canonical config:

```bash
wt supabase config
```

Generated isolated config:

```bash
wt supabase config --isolated
```

## Start, status, and stop isolated Supabase

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

## Bind .env to isolated Supabase

```bash
wt db emancipate
```

This starts the isolated stack and writes a `WT MANAGED ENV` block to `.env`.

Return to the original `.env`:

```bash
wt db rejoin
```

This stops the isolated stack and removes only the managed block.

## Smoke test

Before testing `.env` mutation, always back it up:

```bash
cp .env /tmp/wt-env-before
wt db emancipate
grep -n "WT MANAGED ENV" -A30 .env
wt db rejoin
diff -u /tmp/wt-env-before .env || true
```

Expected result: no diff, or newline-only diff.

## Safety rules

- Treat `wt supabase status --env` output as log-sensitive.
- Never paste full Supabase keys into public PRs or issues.
- Never manually remove user-owned `SUPABASE_*`, `POSTGRES_*`, or `VITE_PUBLIC_SUPABASE_*` values outside the managed block.
- Prefer `--isolated` in worktrees to avoid port conflicts.
- Do not replace repository-specific staging scripts unless equivalent behavior has been implemented and smoke-tested in `wt`.
