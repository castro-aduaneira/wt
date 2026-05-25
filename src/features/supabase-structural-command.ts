import path from "node:path";
import { runInherit } from "../core/command.js";
import { pathExists } from "../core/fs.js";
import { getRepoContext } from "../core/repo-context.js";
import { readFirstState, type WorktreeState, type WorktreeStateV2 } from "../core/state.js";

export async function resetEmancipatedSupabase(input: { cwd: string }): Promise<void> {
  const { cwd, workdir } = await requireEmancipatedSupabaseWorkdir(input.cwd);

  await runInherit("npx", ["supabase", "db", "reset", "--workdir", workdir, "--yes"], cwd);
}

export async function diffEmancipatedSupabase(input: {
  cwd: string;
  extraArgs: string[];
}): Promise<void> {
  const { cwd, workdir } = await requireEmancipatedSupabaseWorkdir(input.cwd);

  await runInherit("npx", ["supabase", "db", "diff", "--workdir", workdir, ...input.extraArgs], cwd);
}

export async function genTypesFromEmancipatedSupabase(input: {
  cwd: string;
  extraArgs: string[];
}): Promise<void> {
  const { cwd, workdir } = await requireEmancipatedSupabaseWorkdir(input.cwd);

  await runInherit("npx", ["supabase", "gen", "types", "--workdir", workdir, ...input.extraArgs], cwd);
}

async function requireEmancipatedSupabaseWorkdir(cwd: string): Promise<{
  cwd: string;
  workdir: string;
}> {
  const context = await getRepoContext(cwd, { requireLinkedWorktree: true });
  const state = await readFirstState([context.statePath, context.sharedStatePath]);

  if (!state) {
    throw new Error(
      `Missing worktree state. Run \`wt db worktree init\` from this linked worktree first.`,
    );
  }

  if (!isWorktreeStateV2(state)) {
    throw new Error("Supabase structural commands require worktree state v2. Run `wt db worktree init` first.");
  }

  if (state.mode === "staging") {
    throw new Error(
      "This worktree is bound to shared staging. Structural Supabase commands are blocked here. Run `wt db emancipate` first.",
    );
  }

  if (state.mode !== "emancipated") {
    throw new Error(`Unsupported worktree mode for local Supabase command: ${state.mode}`);
  }

  const workdir = state.emancipated.workdir;

  if (typeof workdir !== "string" || workdir.trim().length === 0) {
    throw new Error("Emancipated worktree state does not contain a valid Supabase workdir.");
  }

  if (!(await pathExists(path.join(workdir, "supabase", "config.toml")))) {
    throw new Error("Emancipated Supabase project is missing on disk. Re-run `wt db emancipate --fresh`.");
  }

  return {
    cwd: context.worktreePath,
    workdir,
  };
}

function isWorktreeStateV2(state: WorktreeState): state is WorktreeStateV2 {
  return state.version === 2;
}
