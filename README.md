# wt

Reusable CLI for Git worktree orchestration and isolated Supabase local stacks.

`wt` started as an extraction of the Container Tracker worktree workflow. It provides a small CLI for creating worktrees, seeding local files explicitly, managing per-worktree state, migrating legacy worktree configs, and running isolated Supabase stacks without port conflicts.

## Install

Project-local install is recommended for team repos:

```bash
pnpm add -D @marcuscastelo/wt
pnpm exec wt --help
```

Use without installing:

```bash
npx -y @marcuscastelo/wt --help
pnpm dlx @marcuscastelo/wt --help
```

Global install, if your `npm` is a real npm binary:

```bash
npm install -g @marcuscastelo/wt
wt --help
```

If `npm` is aliased to `pnpm`, prefer `npx`, `pnpm dlx`, or project-local install.

Local development from this repo:

```bash
pnpm install
pnpm check
pnpm build
pnpm dev -- --help
```

## Add wt to your repository

Install the package:

```bash
pnpm add -D @marcuscastelo/wt
```

Create a config interactively:

```bash
pnpm exec wt setup
```

Create a config with safe defaults:

```bash
pnpm exec wt setup --yes
```

Migrate from the legacy Container Tracker-style config:

```bash
pnpm exec wt migrate --dry-run
pnpm exec wt migrate
```

The legacy file `.worktree-initialization.toml` is read automatically when `wt.config.json` is absent. Use `wt migrate --remove-legacy` only when the generated config has been reviewed.

## Commands

```bash
wt setup
wt migrate
wt init
wt new <source>
wt destroy
wt env status
wt supabase config
wt supabase status
wt supabase start
wt supabase stop
wt db emancipate
wt db rejoin
```

## Config

Create `wt.config.json` in a repository that wants to use the CLI:

```json
{
  "worktreeRoot": "../wt",
  "branchPrefix": "feat/",
  "seed": {
    "copy": [
      {
        "source": ".env",
        "target": ".env",
        "required": true,
        "overwrite": false
      }
    ]
  },
  "hooks": {
    "afterInit": [
      "pnpm install"
    ],
    "afterNew": [
      "pnpm install"
    ]
  },
  "supabase": {
    "enabled": true,
    "configPath": "supabase/config.toml"
  }
}
```

## Worktree usage

```bash
wt new tasks/my-feature.md
cd ../wt/my-feature
wt env status
```

For LLM-driven work, prefer:

```bash
wt new tasks/<task-or-prd>.md --branch-prefix feat/ --no-hooks
```

Then run repo-specific validation inside the generated worktree.

## Supabase usage

Inspect the canonical Supabase config:

```bash
wt supabase config
```

Use an isolated generated Supabase workdir with deterministic ports:

```bash
wt supabase config --isolated
wt supabase start --isolated
wt supabase status --isolated
wt supabase status --isolated --env
wt supabase stop --isolated
```

Bind the current worktree `.env` to an isolated Supabase stack:

```bash
wt db emancipate
wt db rejoin
```

`wt db emancipate` writes a marked block to `.env`. `wt db rejoin` removes only that marked block and preserves user-owned assignments outside it.

## GUI worktree hooks

Some GUIs and agent apps can run shell hooks around worktree lifecycle events. Names vary by product, but the safe mapping is:

| GUI lifecycle event | Command |
|---|---|
| After worktree creation | `wt init --no-hooks` |
| After worktree creation, full repo setup | `wt init` |
| Before/after worktree deletion | `wt db rejoin || true` |
| Worktree deletion command | `wt destroy` |
| Force deletion for disposable branches only | `wt destroy --force` |

### t3code project actions

If the GUI already creates the Git worktree, as in t3code project actions, do **not** use `wt new` in the action. Configure a project-scoped action like this:

```text
Name: wt-init
Command: wt init
Run automatically on worktree creation: enabled
```

For conservative setups where dependency install is handled elsewhere:

```text
Name: wt-init-lite
Command: wt init --no-hooks
Run automatically on worktree creation: enabled
```

For cleanup, add a separate manual or delete-lifecycle action when the GUI supports it:

```text
Name: wt-rejoin
Command: wt db rejoin || true
Run before/after worktree deletion: enabled, if available
```

Do not set `pnpm initialize-worktree` as the long-term hook once the repo has `wt.config.json`; use `wt init` instead. Do not set `wt destroy` as an automatic deletion hook if the GUI itself is already deleting the worktree.

Recommended defaults for tools such as t3code, Codex App, Antigravity, or any GUI that supports worktree hooks:

```bash
# On worktree creation, conservative
wt init --no-hooks

# On worktree creation, full project bootstrap
wt init

# Before deleting a worktree
wt db rejoin || true

# Delete worktree safely, only if the GUI delegates deletion to wt
wt destroy
```

Use `wt destroy --force` only for disposable branches. It discards local changes and unpushed commits.

If your GUI already creates the Git worktree itself, use `wt init` as the post-create hook. If you want `wt` to create the worktree, configure the GUI/LLM to run `wt new <task-file-or-slug>` from the canonical checkout.

## Instruct an LLM to use wt

Paste this into your agent or repository instructions:

```markdown
When creating implementation branches in this repository, use `wt` instead of raw `git worktree` commands.

Default workflow:

1. From the canonical checkout, create a worktree with:
   `wt new tasks/<task-name>.md --branch-prefix feat/`
2. Enter the generated worktree.
3. Check `wt env status`.
4. If isolated Supabase is needed, run `wt db emancipate`.
5. Run the repository's validation commands.
6. Before deleting or abandoning a worktree, run `wt db rejoin`.
7. Use `wt destroy` for clean deletion, or `wt destroy --force` only for disposable work.

When a GUI already created the Git worktree, do not run `wt new`; run `wt init` inside the worktree instead.

Never delete or rewrite `.env` manually. `wt db emancipate` may add a `WT MANAGED ENV` block; `wt db rejoin` removes only that block.
```

## Skills for agents

This repository includes skills under `skills/`:

```text
skills/wt-worktree/SKILL.md
skills/wt-supabase/SKILL.md
```

These are portable Markdown skills for agents that support `SKILL.md`-style imports. If your skill manager supports installing from a local path or GitHub repo, point it at the desired skill directory. Keep the skill text short and operational: when to use `wt`, exact commands, validation steps, and cleanup rules.

## Container Tracker compatibility

Container Tracker can gradually replace wrappers like:

```json
{
  "scripts": {
    "supabase:start": "wt supabase start --isolated",
    "supabase:stop": "wt supabase stop --isolated",
    "supabase:status": "wt supabase status --isolated",
    "supabase:status:env": "wt supabase status --isolated --env",
    "db:emancipate": "wt db emancipate",
    "db:rejoin": "wt db rejoin"
  }
}
```

Do not replace `db:stage:*`, `db:worktree:*`, `initialize-worktree`, or `destroy-worktree` wrappers until equivalent behavior is explicitly implemented and smoke-tested in `wt`.

## Publishing

Dry-run the package contents:

```bash
pnpm pack --dry-run
```

Publish a public scoped package:

```bash
npm login
pnpm publish --access public
```

## Design rules

- Core must not contain Container Tracker names.
- Supabase behavior must stay behind an adapter.
- Repo-specific hooks must be configured, not hardcoded.
- Local secrets are copied only by explicit allowlist.
- Managed `.env` writes must be marker-block scoped and reversible.
- Destroy must be safe by default.
