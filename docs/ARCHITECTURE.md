# Architecture

## Intent

`wt` is a reusable developer-tooling CLI.

It owns:

- Git worktree lifecycle orchestration
- deterministic local file seed
- managed local state
- safe cleanup
- adapter boundaries for external runtimes

It does not own:

- application domain rules
- repo-specific task semantics
- Supabase behavior in the generic core
- LLM/agent behavior in the generic core

## Layers

```text
src/core
  reusable primitives

src/features
  CLI workflows

src/adapters
  optional integrations
```

## Core rules

`src/core` may depend only on Node APIs and internal core utilities.

`src/features` may compose core primitives.

`src/adapters` may integrate external tooling such as Supabase, Docker, VS Code, DevContainer, or repo-specific task systems.

## Supabase extraction plan

The Container Tracker `worktree-db.mjs` should be split into:

```text
src/adapters/supabase/config.ts
src/adapters/supabase/project.ts
src/adapters/supabase/staging.ts
src/adapters/supabase/emancipation.ts
src/adapters/supabase/snapshot.ts
src/adapters/supabase/docker-cleanup.ts
src/adapters/supabase/env.ts
```

No hardcoded `ct_*`, `AGENT_ENROLL_*`, or `VITE_PUBLIC_*` keys should remain in adapter core. These become config/template data.
