# wt

Reusable CLI for Git worktree orchestration and local Supabase environments.

`wt` started as an extraction of the Container Tracker worktree workflow. It provides a CLI for creating worktrees, seeding local files explicitly, managing per-worktree state, migrating legacy worktree configs, and running Supabase stacks without port conflicts.

## Install

Project-local install is recommended for team repositories:

```bash
pnpm add -D @marcuscastelo/wt
pnpm exec wt --help
```

Use without installing:

```bash
npx -y @marcuscastelo/wt --help
pnpm dlx @marcuscastelo/wt --help
```

Global install, when `npm` is a real npm binary:

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

## Add wt to a repository

Install:

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

Migrate from legacy Container Tracker-style config:

```bash
pnpm exec wt migrate --dry-run
pnpm exec wt migrate
```

The legacy file `.worktree-initialization.toml` is read automatically when `wt.config.json` is absent. Use `wt migrate --remove-legacy` only after reviewing the generated config.

## Command map

Core worktree commands:

```bash
wt setup
wt migrate
wt init
wt new <source>
wt destroy
wt env status
```

Supabase adapter commands:

```bash
wt supabase config
wt supabase config --isolated
wt supabase start
wt supabase start --isolated
wt supabase status
wt supabase status --env
wt supabase status --isolated
wt supabase status --isolated --env
wt supabase stop
wt supabase stop --isolated
```

Database environment commands:

```bash
wt db stage status
wt db stage ensure
wt db stage refresh-local-snapshot
wt db stage rebuild
wt db worktree init
wt db worktree status
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

Container Tracker uses repo-specific runtime names:

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

## Worktree usage

Create a worktree from the canonical checkout:

```bash
wt new tasks/my-feature.md
cd ../wt/my-feature
wt env status
```

For LLM-driven work where repo hooks should be skipped:

```bash
wt new tasks/<task-or-prd>.md --branch-prefix feat/ --no-hooks
```

When a GUI already created the Git worktree, do not run `wt new`. Run this inside the worktree:

```bash
wt init
```

Conservative init without hooks:

```bash
wt init --no-hooks
```

Before abandoning or deleting a worktree:

```bash
wt db rejoin || true
```

If `wt` owns deletion:

```bash
wt destroy
```

Use force only for disposable branches:

```bash
wt destroy --force
```

## Supabase modes

`wt` supports two Supabase command styles.

### Isolated mode

Use `--isolated` for legacy isolated workdirs. This materializes a generated Supabase workdir and deterministic ports under the worktree runtime root.

```bash
wt supabase config --isolated
wt supabase start --isolated
wt supabase status --isolated
wt supabase status --isolated --env
wt supabase stop --isolated
```

### Active mode

Without `--isolated`, `wt supabase` commands resolve the active environment from worktree state v2:

- `mode: staging` uses shared staging.
- `mode: emancipated` uses the worktree dev stack.

```bash
wt supabase start
wt supabase status
wt supabase status --env
wt supabase stop
```

Safety rule: `wt supabase stop` refuses to stop shared staging from `mode: staging`. It stops only the worktree dev stack in `mode: emancipated`.

## Stage and worktree database lifecycle

Shared staging commands:

```bash
wt db stage status
wt db stage ensure
wt db stage refresh-local-snapshot
wt db stage rebuild
```

Worktree environment commands:

```bash
wt db worktree init
wt db worktree status
```

Move to an isolated dev stack:

```bash
wt db emancipate
```

Return to shared staging:

```bash
wt db rejoin
```

`wt db emancipate` writes a managed environment block into `.env`. `wt db rejoin` switches back to staging and stops the dev stack when needed. Managed writes are marker-scoped and must not delete user-owned assignments outside the block.

Container Tracker uses a `WORKTREE ENV MANAGED BLOCK` with `CT_*` compatibility keys. Older `WT MANAGED ENV` blocks are treated as legacy and should not be introduced in new Container Tracker flows.

## GUI worktree hooks

Some GUIs and agent apps can run shell hooks around worktree lifecycle events. Names vary by product, but the safe mapping is:

| GUI lifecycle event | Command |
|---|---|
| After worktree creation | `wt init --no-hooks` |
| After worktree creation, full repo setup | `wt init` |
| Before/after worktree deletion | `wt db rejoin || true` |
| Worktree deletion command, only if delegated to wt | `wt destroy` |
| Force deletion for disposable branches only | `wt destroy --force` |

If the GUI already creates the Git worktree, do not use `wt new` in the post-create action. If the GUI already deletes the worktree, do not also run `wt destroy` automatically.

## Instruct an LLM to use wt

Paste this into repository instructions:

```markdown
When creating implementation branches in this repository, use `wt` instead of raw `git worktree` commands.

Default workflow:

1. From the canonical checkout, create a worktree with:
   `wt new tasks/<task-name>.md --branch-prefix feat/`
2. Enter the generated worktree.
3. Check `wt env status`.
4. If the GUI already created the worktree, do not run `wt new`; run `wt init`.
5. If isolated Supabase is needed, run `wt db emancipate`.
6. Use `wt supabase status` and `wt supabase status --env` for the active environment.
7. Run the repository validation commands.
8. Before deleting or abandoning a worktree, run `wt db rejoin || true`.
9. Use `wt destroy` for clean deletion only when `wt` owns deletion.

Never manually delete or rewrite `.env` to switch Supabase stacks. Use `wt db emancipate` and `wt db rejoin`.
```

## Skills for agents

This repository includes portable `SKILL.md` files under `skills/`:

```text
skills/wt-worktree/SKILL.md
skills/wt-supabase/SKILL.md
skills/wt-container-tracker/SKILL.md
```

Use these skills in LLM environments that support skill imports. They contain exact command sequences, safety rules, and PR planning guidance.

## Container Tracker compatibility

Container Tracker PR #529 validated `@marcuscastelo/wt@^0.12.0` for the main DB/worktree migration.

Recommended scripts from that PR:

```json
{
  "supabase:start": "wt supabase start --isolated",
  "supabase:active:start": "wt supabase start",
  "supabase:start:analytics": "wt supabase start --isolated --with-analytics",
  "supabase:stop": "wt supabase stop --isolated",
  "supabase:active:stop": "wt supabase stop",
  "supabase:status": "wt supabase status --isolated",
  "supabase:active:status": "wt supabase status",
  "supabase:status:env": "wt supabase status --isolated --env",
  "supabase:active:status:env": "wt supabase status --env",
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

Still not migrated after PR #529:

```json
{
  "supabase:reset": "node ./scripts/db/supabase-local-db.mjs reset",
  "supabase:db:diff": "node ./scripts/db/supabase-local-db.mjs diff",
  "supabase:gen-types": "... node ./scripts/db/supabase-local-db.mjs gen-types --lang typescript ...",
  "initialize-worktree": "node ./scripts/initialize-worktree.mjs",
  "destroy-worktree": "node ./scripts/destroy-worktree.mjs"
}
```

Do not remove these local scripts until equivalent `wt` commands exist and are smoke-tested.

Detailed notes are in `docs/container-tracker-pr-529.md`.

## CI and pnpm versioning

If a project pins `packageManager`, do not also pass a conflicting version to `pnpm/action-setup`.

For example, if `package.json` contains:

```json
{
  "packageManager": "pnpm@11.1.3"
}
```

then the GitHub Actions setup should not also specify `version: 9`:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
```

Do not use:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9
```

## Publishing

Dry-run package contents:

```bash
pnpm pack --dry-run
```

Publish a public scoped package:

```bash
npm login
pnpm publish --access public
```

Validate publication:

```bash
npm view @marcuscastelo/wt version
npx -y @marcuscastelo/wt@<version> --help
```

## Design rules

- Core must not contain Container Tracker domain rules.
- Supabase behavior must stay behind an adapter.
- Repo-specific hooks must be configured, not hardcoded.
- Local secrets are copied only by explicit allowlist.
- Managed `.env` writes must be marker-block scoped and reversible.
- Destroy must be safe by default.
