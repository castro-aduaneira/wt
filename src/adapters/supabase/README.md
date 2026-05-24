# Supabase adapter

This folder is the intended destination for the Container Tracker Supabase worktree extraction.

Do not place Supabase logic in `src/core`.

Target commands:

```bash
wt db emancipate
wt db emancipate --fresh
wt db rejoin
wt supabase start
wt supabase stop
wt supabase status
```

Key behavior to port:

- shared staging project
- stage snapshot dump
- isolated worktree project
- restore from snapshot
- deterministic port block allocation
- Docker resource cleanup by Supabase project label
- managed env rendering from template/config
