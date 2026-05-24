import { getRepoContext } from "../core/repo-context.js";
import { readState } from "../core/state.js";

export interface EnvStatusOptions {
  cwd: string;
}

export async function showEnvStatus(options: EnvStatusOptions): Promise<void> {
  const context = await getRepoContext(options.cwd, { requireLinkedWorktree: false });
  const state = await readState(context.statePath);

  console.log(
    JSON.stringify(
      {
        repoRoot: context.repoRoot,
        mainRepoPath: context.mainRepoPath,
        worktreePath: context.worktreePath,
        isLinkedWorktree: context.isLinkedWorktree,
        worktreeId: context.worktreeId,
        gitBranch: context.gitBranch,
        state,
      },
      null,
      2,
    ),
  );
}
