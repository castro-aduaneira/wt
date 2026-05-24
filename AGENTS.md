# AGENTS.md — wt Repository Workflow

This file documents the operating workflow for agents and maintainers working on `@marcuscastelo/wt`.

## Purpose

`wt` is a reusable CLI for:

- Git worktree creation and cleanup.
- Explicit local file seeding, especially `.env`.
- Per-worktree Supabase isolated stacks.
- Safe `.env` binding through marker-scoped managed blocks.
- Migration away from repo-local worktree scripts.

The CLI was extracted from the Container Tracker workflow and must remain generic. Do not hardcode Container Tracker domain rules or paths into the package.

## Relationship with Container Tracker

Container Tracker is the primary proving ground for `wt`, but `wt` must stay reusable.

Validated Container Tracker wrappers:

```json
{
  "supabase:start": "wt supabase start --isolated",
  "supabase:start:analytics": "wt supabase start --isolated --with-analytics",
  "supabase:stop": "wt supabase stop --isolated",
  "supabase:status": "wt supabase status --isolated",
  "supabase:status:env": "wt supabase status --isolated --env",
  "db:emancipate": "wt db emancipate",
  "db:rejoin": "wt db rejoin"
}
```

Do not migrate Container Tracker `db:stage:*`, `db:worktree:*`, `initialize-worktree`, or `destroy-worktree` wrappers until equivalent behavior is explicitly implemented and smoke-tested in `wt`.

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

The setup command must prefer safe defaults:

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
- `package.json`

## Versioning and Publishing

For patch fixes:

```bash
# edit package.json version, e.g. 0.1.1 -> 0.1.2
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

### Worktree and `.env` seed smoke test

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

Compare without exposing secrets:

```bash
cmp -s \
  /home/marucs/Development/Castro/container-tracker/.env \
  /home/marucs/Development/Castro/wt-smoke-global/wt-global-env-smoke/.env \
  && echo ".env is identical" \
  || echo ".env differs"
```

Cleanup:

```bash
npx -y @marcuscastelo/wt@<version> destroy --force
cd /home/marucs/Development/Castro/container-tracker
rm -rf ../wt-smoke-global
git worktree prune
```

### Supabase isolated stack smoke test

```bash
cd /home/marucs/Development/Castro/container-tracker

npx -y @marcuscastelo/wt@<version> supabase config --isolated
npx -y @marcuscastelo/wt@<version> supabase status --isolated
npx -y @marcuscastelo/wt@<version> supabase start --isolated
npx -y @marcuscastelo/wt@<version> supabase status --isolated
npx -y @marcuscastelo/wt@<version> supabase status --isolated --env
npx -y @marcuscastelo/wt@<version> supabase stop --isolated
npx -y @marcuscastelo/wt@<version> supabase status --isolated
```

Expected:

- generated workdir under `.git/wt-local-envs/worktrees/<worktreeId>/supabase-workdir`
- deterministic non-conflicting ports, usually `4xxxx`
- no conflict with Container Tracker staging/canonical stack

### DB emancipation smoke test

Use a backup before writing `.env`:

```bash
cd /home/marucs/Development/Castro/container-tracker
cp .env /tmp/container-tracker.env.before-wt

npx -y @marcuscastelo/wt@<version> db emancipate
grep -n "WT MANAGED ENV" -A30 .env

npx -y @marcuscastelo/wt@<version> db rejoin

diff -u /tmp/container-tracker.env.before-wt .env || true
npx -y @marcuscastelo/wt@<version> supabase status --isolated
```

Expected:

- `db emancipate` adds one marker-scoped block.
- `db rejoin` removes only that block.
- No user-owned `.env` assignments outside the marker block are removed.
- Final diff is empty or newline-only.

## Security Rules

- Never print or paste full `.env` values in public issues or PRs.
- Supabase local keys are defaults but should still be treated as log-sensitive.
- Managed `.env` writes must be marker-scoped.
- `db rejoin` must never delete user-owned assignments outside the managed block.
- Worktree destroy must refuse dirty state unless `--force` is explicit.

## Commit Policy

Use focused commits:

```text
feat: add setup command
feat: add legacy config migration
fix: preserve user env assignments outside managed block
chore: release 0.1.1
```

Do not mix unrelated changes. For Container Tracker PRs, separate:

- `wt` wrapper migration
- agent skill additions
- unrelated formatter churn
- lockfile churn

## Container Tracker PR Hygiene

For a wrapper migration PR, changed files should normally be limited to:

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`, only if release-age policy requires it

Avoid unrelated files such as:

- `tools/codex-skills-global/**`
- unrelated OpenAI/model resolver formatting

If `pnpm-lock.yaml` changes unrelated transitive versions, restore and regenerate narrowly:

```bash
git restore --source=origin/develop -- pnpm-lock.yaml pnpm-workspace.yaml
pnpm add -D @marcuscastelo/wt@<version> --lockfile-only --ignore-scripts
```

Then re-run:

```bash
pnpm run type-check
pnpm run architecture:boundary-scan
pnpm run supabase:status
pnpm run db:emancipate
pnpm run db:rejoin
pnpm run supabase:status
```
