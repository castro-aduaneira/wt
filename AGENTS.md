# AGENTS.md — wt Repository Workflow

This file is the operating guide for agents and maintainers working on `@marcuscastelo/wt`.

## Purpose

`wt` is a reusable CLI for:

- Git worktree creation and cleanup.
- Explicit local file seeding, especially `.env`.
- Shared staging Supabase stacks.
- Per-worktree Supabase dev stacks.
- Safe `.env` binding through marker-scoped managed blocks.
- Migration away from repo-local worktree/database wrappers.

`wt` was extracted from the Container Tracker workflow, but it must remain reusable. Do not hardcode Container Tracker domain rules into core behavior. Repo-specific names belong in `wt.config.json`.

## Current Validated Version

Container Tracker PR #529 validated `@marcuscastelo/wt@^0.12.0` for:

- `db:worktree:*`
- `db:stage:*`
- `db:emancipate`
- `db:rejoin`
- `supabase:active:*`
- legacy `supabase:* --isolated` compatibility

Detailed notes are in:

```text
docs/container-tracker-pr-529.md
```

## Relationship with Container Tracker

Container Tracker is the primary proving ground for `wt`.

Container Tracker config:

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

Validated script mapping from PR #529:

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

Compatibility scripts intentionally preserved:

```json
{
  "supabase:start": "wt supabase start --isolated",
  "supabase:start:analytics": "wt supabase start --isolated --with-analytics",
  "supabase:stop": "wt supabase stop --isolated",
  "supabase:status": "wt supabase status --isolated",
  "supabase:status:env": "wt supabase status --isolated --env"
}
```

Do not remove Container Tracker local wrappers until equivalent `wt` behavior is implemented and smoke-tested.

Still local after PR #529:

```text
supabase:reset
supabase:db:diff
supabase:gen-types
initialize-worktree
destroy-worktree
remote/prod-to-local scripts
```

## Compatibility Policy

`wt.config.json` is the current config format.

Legacy compatibility currently supported:

- `.worktree-initialization.toml`
- `[[copy]]` entries map to `seed.copy`
- `[[run]]` entries map to `hooks.afterInit` and `hooks.afterNew`

Use:

```bash
wt migrate --dry-run
wt migrate
wt migrate --remove-legacy
```

Migration must be non-destructive by default. Never remove a legacy config unless `--remove-legacy` is explicitly provided.

## Setup Workflow

Use setup for new repositories:

```bash
wt setup
```

Use defaults without prompting:

```bash
wt setup --yes
```

Overwrite an existing config only when requested:

```bash
wt setup --force
```

Safe defaults:

- `worktreeRoot`: `../wt`
- `branchPrefix`: `feat/`
- copy `.env`: yes
- Supabase adapter: yes
- `supabase/config.toml`: default path
- expensive repo-specific hooks: opt-in where possible

## Development Loop

Before any release:

```bash
pnpm install
pnpm check
pnpm build
pnpm pack --dry-run
```

The tarball must not contain compiled test artifacts:

- no `*.test.js`
- no `*.test.d.ts`
- no `*.test.js.map`

Expected published contents:

- `dist/`
- `README.md`
- `LICENSE`
- `AGENTS.md`
- `llms.txt`
- `skills/`
- `docs/`
- `package.json`

If new documentation or skills should be available to agents through the npm package, ensure `package.json.files` includes the path.

## Versioning and Publishing

For any runtime command change, bump the package version before publish.

For documentation-only changes, bump only when the docs need to be shipped through npm immediately.

Release sequence:

```bash
pnpm check
pnpm build
pnpm pack --dry-run
pnpm publish --access public
```

Validate publication:

```bash
npm view @marcuscastelo/wt version
npx -y @marcuscastelo/wt@<version> --help
```

If `npm` is aliased to `pnpm`, do not rely on global `npm install -g`. Prefer:

```bash
npx -y @marcuscastelo/wt@<version> --help
pnpm dlx @marcuscastelo/wt@<version> --help
```

## Smoke Tests

### Worktree and `.env` seed smoke

From the Container Tracker canonical checkout:

```bash
cd /home/marucs/Development/Castro/container-tracker

git worktree prune
git branch -D smoke/wt-global-env-smoke || true
rm -rf ../wt-smoke-global

npx -y @marcuscastelo/wt@<version> new tasks/wt-global-env-smoke.md \
  --wt-root ../wt-smoke-global \
  --branch-prefix smoke/ \
  --no-hooks

cd /home/marucs/Development/Castro/wt-smoke-global/wt-global-env-smoke

git branch --show-current
pwd
ls -la .env
test -f .env && echo ".env copied"
```

Expected:

```text
smoke/wt-global-env-smoke
.../wt-smoke-global/wt-global-env-smoke
.env copied
```

Cleanup:

```bash
npx -y @marcuscastelo/wt@<version> destroy --force
cd /home/marucs/Development/Castro/container-tracker
rm -rf ../wt-smoke-global
git worktree prune
```

### Container Tracker stage/worktree smoke

Inside a linked Container Tracker worktree:

```bash
pnpm run db:stage:status
pnpm run db:stage:ensure
pnpm run db:stage:refresh-local-snapshot
pnpm run db:stage:rebuild
pnpm run db:worktree:init
pnpm run db:worktree:status
```

Expected:

- stage project id starts with `ct_stage_`.
- worktree dev project id starts with `ct_dev_`.
- state version is `2`.
- persisted state omits `envMap`.

### Container Tracker emancipation/rejoin smoke

```bash
pnpm run db:rejoin
pnpm run db:worktree:status
pnpm run db:emancipate
pnpm run db:worktree:status
pnpm run db:rejoin
pnpm run db:worktree:status
```

Expected:

- after `db:emancipate`, mode is `emancipated`.
- after `db:emancipate`, `CT_SUPABASE_PROJECT_ID` points to `ct_dev_*`.
- after `db:rejoin`, mode is `staging`.
- after `db:rejoin`, `CT_SUPABASE_PROJECT_ID` points to `ct_stage_*`.

### Active Supabase smoke

```bash
pnpm run db:rejoin
pnpm run supabase:active:start
pnpm run supabase:active:status
pnpm run supabase:active:status:env
pnpm run supabase:active:stop || true

pnpm run db:emancipate
pnpm run supabase:active:stop
pnpm run db:worktree:status
pnpm run supabase:active:start
pnpm run db:worktree:status
pnpm run db:rejoin
```

Expected:

- active start in staging ensures shared staging is running.
- active stop in staging refuses to stop shared staging.
- active stop in emancipated mode stops the dev stack and marks it stopped/preserved.
- active start in emancipated mode reattaches/restarts the dev stack and marks it running.

## Security Rules

- Never print or paste full `.env` values in public issues or PRs.
- Supabase local keys are defaults but should still be treated as log-sensitive.
- Managed `.env` writes must be marker-scoped.
- `db rejoin` must never delete user-owned assignments outside the managed block.
- Worktree destroy must refuse dirty state unless `--force` is explicit.
- `wt supabase stop` must refuse to stop shared staging from `mode: staging`.

## Commit Policy

Use focused commits:

```text
feat: add active supabase start stop commands
fix: omit env maps from persisted worktree state
chore: release 0.12.0
docs: record Container Tracker PR 529 integration
```

Do not mix unrelated changes.

For Container Tracker wrapper migration PRs, separate:

- `wt` wrapper migration
- package manager/pnpm CI alignment
- agent skill additions
- unrelated formatter churn
- lockfile churn

## Container Tracker PR Hygiene

For wrapper migration PRs, changed files should normally be limited to:

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`, only if release-age policy requires it
- `wt.config.json`
- CI workflow files only if package manager alignment requires it

Avoid unrelated code changes.

If `pnpm-lock.yaml` changes unrelated transitive versions, restore and regenerate narrowly:

```bash
git restore --source=origin/develop -- pnpm-lock.yaml pnpm-workspace.yaml
pnpm add -D @marcuscastelo/wt@<version> --lockfile-only --ignore-scripts
```

Then re-run:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run type-check
pnpm run architecture:boundary-scan
```

## Pnpm CI Rule

If `package.json` contains `packageManager`, do not also pass a conflicting version to `pnpm/action-setup`.

Correct:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
```

Incorrect when `packageManager` says `pnpm@11.1.3`:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9
```
