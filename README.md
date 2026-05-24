# wt

Reusable CLI for Git worktree orchestration and isolated Supabase local stacks.

`wt` started as an extraction of the Container Tracker worktree workflow. It provides a small CLI for creating worktrees, seeding local files explicitly, managing per-worktree state, and running isolated Supabase stacks without port conflicts.

## Install

Global install from npm:

```bash
npm install -g @marcuscastelo/wt
wt --help
```

Project-local install:

```bash
pnpm add -D @marcuscastelo/wt
pnpm exec wt --help
```

Local development from this repo:

```bash
pnpm install
pnpm check
pnpm build
pnpm dev -- --help
```

## Commands

```bash
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
