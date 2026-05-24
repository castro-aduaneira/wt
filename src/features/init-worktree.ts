import { loadConfig } from "../core/config.js";
import { getRepoContext } from "../core/repo-context.js";
import { copySeedFiles } from "../core/seed.js";
import { writeState } from "../core/state.js";
import { runShell } from "../core/command.js";
import { log } from "../core/logger.js";

export interface InitWorktreeOptions {
  cwd: string;
  forceOverwrite: boolean;
  runHooks: boolean;
}

export async function initWorktree(options: InitWorktreeOptions): Promise<void> {
  const context = await getRepoContext(options.cwd, { requireLinkedWorktree: true });
  const { config } = await loadConfig(context.worktreePath);

  await copySeedFiles({
    entries: config.seed?.copy ?? [],
    sourceRoot: context.mainRepoPath,
    targetRoot: context.worktreePath,
    forceOverwrite: options.forceOverwrite,
  });

  if (options.runHooks) {
    for (const command of config.hooks?.afterInit ?? []) {
      log(`running hook: ${command}`);
      await runShell(command, context.worktreePath);
    }
  }

  await writeState(context.statePath, {
    version: 1,
    worktreeId: context.worktreeId,
    worktreePath: context.worktreePath,
    gitBranch: context.gitBranch,
    mode: "plain",
    generatedFiles: [".worktree-state.json"],
  });

  log(`initialized worktree: ${context.worktreeId}`);
}
