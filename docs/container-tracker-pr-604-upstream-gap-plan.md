# Container Tracker PR #604 — wt Upstream Gap Plan

This document records the reusable gaps found in Container Tracker PR #604.

PR #604 should not be treated as the long-term direction for Container Tracker worktree/Supabase lifecycle. It contains useful operational fixes, but it moves package scripts away from `wt` and back to `scripts/db/worktree-db.mjs`. That makes the downstream wrapper authoritative again.

The intended ownership model is:

```text
Container Tracker finds a lifecycle gap
↓
wt implements the reusable behavior
↓
Container Tracker updates @marcuscastelo/wt
↓
Container Tracker keeps scripts pointing at wt
↓
local wrappers become removable
```

## Regression Pattern

Do not let Container Tracker grow `scripts/db/worktree-db.mjs` as a second CLI.

Already-migrated scripts should not move from:

```text
wt db stage ensure
wt db worktree status
wt db emancipate
wt supabase start
```

back to:

```text
node scripts/db/worktree-db.mjs <command>
```

If behavior is missing in `wt`, implement it upstream first.

## Gaps to Upstream

### WT-604-01 — Stage ensure-current

Add an equivalent of Container Tracker's stage `ensure-current` behavior.

Candidate commands:

```bash
wt db stage ensure-current
wt db stage assert-current
wt db stage migrate
```

Expected behavior:

- inspect repo migrations;
- inspect local stage migration ledger;
- report success when current;
- migrate when not current;
- refresh stage snapshot after migration;
- optionally run configured smoke hooks.

### WT-604-02 — Migration parity during stage ensure/rebuild

`wt db stage ensure` and `wt db stage rebuild` should be able to ensure migration parity before returning a usable stage environment.

Expected flow:

```text
ensure stage running
↓
assert or migrate stage ledger current
↓
refresh snapshot when changed
↓
return running stage definition
```

### WT-604-03 — Supabase readiness validation after start

Do not trust `supabase start` exit success alone.

After start, validate required `supabase status -o env` values. Required keys should include at least:

```text
API_URL
DB_URL
ANON_KEY
SERVICE_ROLE_KEY
JWT_SECRET
```

### WT-604-04 — Stale or incomplete stack retry

Treat missing required values from `supabase status -o env` as a stale/incomplete stack.

Expected behavior:

```text
start
↓
status -o env incomplete
↓
stop
↓
start again
↓
status -o env must be complete
```

### WT-604-05 — Running check requires complete env

A Supabase project should be considered running only when status env output contains all required values.

A container existing is not enough.

### WT-604-06 — Low-RAM excludes

Review the low-memory Supabase exclude defaults. PR #604 used:

```text
logflare,vector
```

`wt` should either own this default or make it configurable.

### WT-604-07 — Develop pull hook remains downstream, but should call wt

Container Tracker's develop pull hook is repo-specific and can stay downstream.

Once upstream parity exists, the hook should call package scripts that point to `wt`, not direct local wrappers.

## Intended Follow-Up Order

### PR A — wt upstream behavior

Implement in `wt`:

- stage ensure-current;
- stage migration parity checks;
- Supabase readiness validation;
- status-env completeness check;
- stale/incomplete stack retry;
- low-RAM exclude alignment/configuration.

Release a new `@marcuscastelo/wt` version.

### PR B — Container Tracker consumes wt

Update Container Tracker:

- bump `@marcuscastelo/wt`;
- keep already migrated scripts pointing at `wt`;
- keep repo-specific hook logic downstream;
- remove direct need for `scripts/db/worktree-db.mjs` in migrated scripts.

### PR C — wrapper audit/removal

After parity and smoke tests:

```bash
grep -RIn "worktree-db.mjs" .
grep -RIn "supabase-local-db.mjs" .
grep -RIn "initialize-worktree.mjs" .
grep -RIn "destroy-worktree.mjs" .
```

Remove local wrappers only when no live behavior remains.

## Agent Rule

When a Container Tracker task touches worktree/Supabase lifecycle:

```text
Do not expand scripts/db/worktree-db.mjs unless it is explicitly marked as a temporary hotfix.
If behavior is reusable, implement it in wt first.
```

## Closeout Note

PR #604 can be closed as an implementation direction, but its discoveries remain valid backlog for `wt`.

The valuable parts are the gaps, not the downstream wrapper reintroduction.
