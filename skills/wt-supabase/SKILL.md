---
name: wt-supabase
description: Operate local Supabase through wt. Use for isolated stacks, active staging/emancipated state, worktree .env binding, status/env inspection, and safe start/stop flows.
---

# wt Supabase

Use this skill when an agent needs to operate local Supabase in a repository using `@marcuscastelo/wt`.

## When to Use

Use `wt` Supabase commands when:

- the repository has `wt.config.json` with Supabase enabled;
- the repository has `supabase/config.toml`;
- multiple worktrees may need deterministic local Supabase stacks;
- the agent needs shared staging or a per-worktree dev stack;
- status or env output is needed without manually rewriting `.env`.

## Modes

### Isolated Mode

Use `--isolated` for legacy compatibility or explicit generated workdirs.

```bash
wt supabase config --isolated
wt supabase start --isolated
wt supabase status --isolated
wt supabase status --isolated --env
wt supabase stop --isolated
```

### Active Mode

Without `--isolated`, commands resolve the active environment from state v2.

```bash
wt supabase start
wt supabase status
wt supabase status --env
wt supabase stop
```

State resolution:

- `mode: staging` means shared staging.
- `mode: emancipated` means the worktree dev stack.

Important: `wt supabase stop` must refuse to stop shared staging. It stops only the worktree dev stack when the state is `emancipated`.

## Stage Commands

```bash
wt db stage status
wt db stage ensure
wt db stage refresh-local-snapshot
wt db stage rebuild
```

Use these for shared staging lifecycle.

## Worktree Commands

```bash
wt db worktree init
wt db worktree status
wt db emancipate
wt db rejoin
```

Expected behavior:

- `worktree init` binds the current worktree to shared staging.
- `emancipate` starts or reattaches the worktree dev stack and updates the managed `.env` block.
- `rejoin` returns to shared staging and stops the dev stack if needed.
- Managed `.env` writes are marker-scoped and reversible.

## Smoke Tests

Staging:

```bash
wt db rejoin
wt supabase start
wt supabase status
wt supabase status --env
wt supabase stop || true
```

Expected: start/status target shared staging; stop refuses.

Emancipated:

```bash
wt db emancipate
wt supabase stop
wt db worktree status
wt supabase start
wt db worktree status
wt db rejoin
```

Expected: stop marks the dev stack stopped/preserved; start marks it running; rejoin returns to staging.

## Container Tracker Mapping

Validated script mappings:

```json
{
  "db:worktree:init": "wt db worktree init",
  "db:worktree:status": "wt db worktree status",
  "db:stage:ensure": "wt db stage ensure",
  "db:stage:status": "wt db stage status",
  "db:stage:refresh-local-snapshot": "wt db stage refresh-local-snapshot",
  "db:stage:rebuild": "wt db stage rebuild",
  "db:emancipate": "wt db emancipate",
  "db:rejoin": "wt db rejoin",
  "supabase:active:start": "wt supabase start",
  "supabase:active:stop": "wt supabase stop",
  "supabase:active:status": "wt supabase status",
  "supabase:active:status:env": "wt supabase status --env"
}
```

Compatibility scripts intentionally stay isolated:

```json
{
  "supabase:start": "wt supabase start --isolated",
  "supabase:stop": "wt supabase stop --isolated",
  "supabase:status": "wt supabase status --isolated",
  "supabase:status:env": "wt supabase status --isolated --env"
}
```

Still not migrated after Container Tracker PR #529:

```text
supabase:reset
supabase:db:diff
supabase:gen-types
initialize-worktree
destroy-worktree
```

Do not delete local wrappers for those commands until equivalent `wt` commands exist and are smoke-tested.

## Safety Rules

- Treat env output as log-sensitive.
- Do not paste local credentials into public PRs or issues.
- Do not manually edit `.env` to switch Supabase stacks.
- Do not stop shared staging from staging mode.
- Always run `wt db rejoin` before abandoning or deleting an emancipated worktree.
- Do not replace destructive commands such as reset/diff/gen-types until their `wt` equivalents have explicit target semantics and smoke tests.
