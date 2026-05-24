import fs from "node:fs/promises";
import { runCapture } from "../core/command.js";
import { pathExists } from "../core/fs.js";
import { getRepoContext } from "../core/repo-context.js";
import { log } from "../core/logger.js";

export interface DestroyWorktreeOptions {
  cwd: string;
  force: boolean;
}

export async function destroyWorktree(options: DestroyWorktreeOptions): Promise<void> {
  const context = await getRepoContext(options.cwd, { requireLinkedWorktree: true });

  if (!options.force) {
    const status = await runCapture(
      "git",
      ["-C", context.worktreePath, "status", "--porcelain", "--untracked-files=normal"],
      context.worktreePath,
    );

    if (status.stdout.trim().length > 0) {
      throw new Error(
        "Worktree has local changes. Commit/stash/remove them first, or rerun `wt destroy --force` if you intend to discard them.",
      );
    }

    const unpushed = await runCapture(
      "git",
      ["-C", context.worktreePath, "log", "--max-count=1", "--oneline", "HEAD", "--not", "--remotes"],
      context.worktreePath,
    );

    if (unpushed.stdout.trim().length > 0) {
      throw new Error(
        "Worktree has commits not present on any remote. Push/merge them first, or rerun `wt destroy --force` to discard them.",
      );
    }
  }

  await runCapture(
    "git",
    [
      "-C",
      context.mainRepoPath,
      "worktree",
      "remove",
      ...(options.force ? ["--force"] : []),
      context.worktreePath,
    ],
    context.mainRepoPath,
  );

  if (await pathExists(context.runtimeRoot)) {
    await fs.rm(context.runtimeRoot, { force: true, recursive: true });
  }

  log(`destroyed worktree: ${context.worktreePath}`);
}
