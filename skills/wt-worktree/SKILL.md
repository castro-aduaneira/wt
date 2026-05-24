---
name: wt-worktree
description: Create, initialize, inspect, and safely clean up Git worktrees using the wt CLI. Use when an agent needs a worktree, a GUI-created worktree needs initialization, .env seed must be copied, or worktree lifecycle hooks need safe commands.
---

# wt Worktree

Use this skill when an agent needs to create, initialize, inspect, or clean up Git worktrees in a repository that uses `@marcuscastelo/wt`.

## When to Use

Use `wt` instead of raw `git worktree` commands when:

- creating an implementation branch/worktree from a canonical checkout;
- initializing a worktree created by an external GUI;
- copying local seed files such as `.env` explicitly;
- cleaning up a worktree safely;
- checking whether the current directory is a linked Git worktree.

## Workflow

### 1. Check Context

Before running commands, determine whether the current directory is the canonical checkout or an already-created linked worktree.

```bash
wt env status
```

If the GUI already created the worktree, do not run `wt new`. Run `wt init` inside that worktree.

### 2. Create a Worktree from the Canonical Checkout

From the canonical checkout:

```bash
wt new tasks/<task-or-prd>.md --branch-prefix feat/
```

For a lighter agent-created worktree where repo hooks should be skipped:

```bash
wt new tasks/<task-or-prd>.md --branch-prefix feat/ --no-hooks
```

### 3. Initialize a GUI-Created Worktree

Inside a worktree created by a GUI or another tool:

```bash
wt init
```

Conservative init without hooks:

```bash
wt init --no-hooks
```

### 4. Inspect State

```bash
wt env status
```

Confirm that the current directory is a linked worktree and that `.worktree-state.json` exists when expected.

### 5. Clean Up

Before deletion or abandonment:

```bash
wt db rejoin || true
```

Destroy current linked worktree safely:

```bash
wt destroy
```

Force-destroy only for disposable branches:

```bash
wt destroy --force
```

## GUI Hook Mapping

If a GUI already creates the Git worktree, do not run `wt new` in the post-create hook.

Recommended project action for t3code/Codex App/Antigravity-style hooks:

```text
Name: wt-init
Command: wt init
Run automatically on worktree creation: enabled
```

Use this when dependency installation is handled elsewhere:

```text
Name: wt-init-lite
Command: wt init --no-hooks
Run automatically on worktree creation: enabled
```

Before deletion or abandonment:

```bash
wt db rejoin || true
```

Only use `wt destroy` when deletion is delegated to `wt` itself. Do not run `wt destroy` automatically if the GUI already deletes the worktree.

## Validation

After creating or initializing a worktree, run the repository's normal validation commands. For Container Tracker, lightweight validation usually starts with:

```bash
pnpm run type-check
pnpm run architecture:boundary-scan
```

## Safety Rules

- Never delete `.env` manually.
- Do not overwrite an existing worktree path.
- Do not force-destroy work unless the branch is disposable.
- Always run repo validation after implementation.
- If `wt new` fails because the branch exists, inspect and clean stale branches/worktrees before retrying.
- If a GUI already owns worktree deletion, do not also run `wt destroy` in the deletion hook.
