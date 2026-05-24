# wt Worktree Skill

Use this skill when an agent needs to create, initialize, inspect, or clean up Git worktrees in a repository that uses `@marcuscastelo/wt`.

## When to use

Use `wt` instead of raw `git worktree` commands when:

- creating an implementation branch/worktree from a canonical checkout;
- initializing a worktree created by an external GUI;
- copying local seed files such as `.env` explicitly;
- cleaning up a worktree safely;
- checking whether the current directory is a linked Git worktree.

## Core commands

From the canonical checkout:

```bash
wt new tasks/<task-or-prd>.md --branch-prefix feat/
```

Inside a worktree created by a GUI or another tool:

```bash
wt init
```

Conservative init without hooks:

```bash
wt init --no-hooks
```

Inspect current state:

```bash
wt env status
```

Destroy current linked worktree safely:

```bash
wt destroy
```

Force-destroy only for disposable branches:

```bash
wt destroy --force
```

## GUI hook mapping

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

## Safety rules

- Never delete `.env` manually.
- Do not overwrite an existing worktree path.
- Do not force-destroy work unless the branch is disposable.
- Always run repo validation after implementation.
- If `wt new` fails because the branch exists, inspect and clean stale branches/worktrees before retrying.
