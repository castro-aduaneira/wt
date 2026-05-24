# wt

Reusable CLI for Git worktree orchestration.

This repo starts as a TypeScript extraction target for the Container Tracker worktree workflow.

## Current scope

Implemented in this starter:

```bash
wt init
wt new <source>
wt destroy
wt env status
```

Prepared adapter boundary:

```bash
wt db emancipate
wt db rejoin
wt supabase start
```

Those Supabase commands are intentionally not implemented yet. The first version establishes the reusable core and keeps Supabase as an adapter instead of mixing it into the generic worktree layer.

## Install

```bash
pnpm install
pnpm build
```

Run locally:

```bash
pnpm dev -- --help
```

After linking or publishing:

```bash
wt --help
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
    "enabled": false,
    "configPath": "supabase/config.toml"
  }
}
```

## Example usage inside another repo

```bash
wt new tasks/my-feature.md
cd ../wt/my-feature
wt env status
```

## Container Tracker compatibility

In Container Tracker, the eventual target is to replace wrappers like:

```json
{
  "scripts": {
    "initialize-worktree": "wt init",
    "destroy-worktree": "wt destroy",
    "db:emancipate": "wt db emancipate",
    "db:rejoin": "wt db rejoin"
  }
}
```

## Design rules

- Core must not contain Container Tracker names.
- Supabase must live behind an adapter.
- Repo-specific hooks must be configured, not hardcoded.
- Local secrets are copied only by explicit allowlist.
- Destroy must be safe by default.
