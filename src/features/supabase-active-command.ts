import { buildSupabaseStartArgs, buildSupabaseStopArgs } from "../adapters/supabase/supabase-runtime.js";
import { ensureStageEnvironment, isSupabaseProjectRunning } from "../adapters/supabase/supabase-stage.js";
import { runInherit } from "../core/command.js";
import { getRepoContext } from "../core/repo-context.js";
import { readFirstState, writeState, type WorktreeState, type WorktreeStateV2 } from "../core/state.js";
import { emancipateWorktreeDatabase, getActiveSupabaseWorkdir } from "./worktree-db-command.js";

export async function startActiveSupabase(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const state = await readActiveWorktreeState(context.statePath, context.sharedStatePath);

  if (state?.mode === "emancipated") {
    await emancipateWorktreeDatabase({
      cwd: input.cwd,
      fresh: false,
      withAnalytics: input.withAnalytics,
    });
    return;
  }

  if (state?.mode === "staging") {
    await ensureStageEnvironment(context, { withAnalytics: input.withAnalytics });
    return;
  }

  const active = await getActiveSupabaseWorkdir({ cwd: input.cwd });
  await runInherit(
    "npx",
    buildSupabaseStartArgs({ workdir: active.workdir, withAnalytics: input.withAnalytics }),
    active.workdir,
  );
}

export async function stopActiveSupabase(input: {
  cwd: string;
  noBackup: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });
  const state = await readActiveWorktreeState(context.statePath, context.sharedStatePath);

  if (!state || state.mode !== "emancipated") {
    throw new Error(
      "Refusing to stop shared staging from a non-emancipated worktree. Use `wt db rejoin` or operate on the isolated stack only.",
    );
  }

  const workdir = state.emancipated.workdir;
  const projectId = state.emancipated.projectId;

  if (await isSupabaseProjectRunning(workdir)) {
    await runInherit(
      "npx",
      buildSupabaseStopArgs({ workdir, noBackup: input.noBackup }),
      workdir,
    );
  } else {
    console.log(`isolated stack already stopped: ${projectId}`);
  }

  const nextState: WorktreeStateV2 = {
    ...state,
    emancipated: {
      ...state.emancipated,
      status: "stopped",
      preserved: true,
    },
  };

  delete nextState.staging.envMap;
  delete nextState.emancipated.envMap;

  await writeState(context.statePath, nextState);
  await writeState(context.sharedStatePath, nextState);

  console.log(`isolated stack stopped: ${projectId}`);
}

async function readActiveWorktreeState(
  localStatePath: string,
  sharedStatePath: string,
): Promise<WorktreeStateV2 | null> {
  const state = await readFirstState([localStatePath, sharedStatePath]);

  if (!isWorktreeStateV2(state)) {
    return null;
  }

  return state;
}

function isWorktreeStateV2(state: WorktreeState | null): state is WorktreeStateV2 {
  return state?.version === 2;
}
