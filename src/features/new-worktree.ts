import path from "node:path";
import { runCapture, runShell } from "../core/command.js";
import { loadConfig } from "../core/config.js";
import { branchExists } from "../core/git.js";
import { inferSlugFromSource, slugify } from "../core/identity.js";
import { log } from "../core/logger.js";
import { getRepoContext } from "../core/repo-context.js";
import { copySeedFiles } from "../core/seed.js";
import { writeState } from "../core/state.js";

export interface NewWorktreeOptions {
  cwd: string;
  source: string;
  wtRoot?: string;
  branchPrefix?: string;
  slug?: string;
  runHooks: boolean;
  printOnly: boolean;
}

export async function newWorktree(options: NewWorktreeOptions): Promise<void> {
  const { repoRoot, config } = await loadConfig(options.cwd);

  const slug = options.slug ? slugify(options.slug) : inferSlugFromSource(options.source);
  const branchPrefix = options.branchPrefix ?? config.branchPrefix ?? "feat/";
  const branchName = branchPrefix.endsWith("/") ? `${branchPrefix}${slug}` : `${branchPrefix}/${slug}`;
  const wtRoot = path.resolve(repoRoot, options.wtRoot ?? config.worktreeRoot ?? "../wt");
  const worktreePath = path.join(wtRoot, slug);

  const plan = {
    repoRoot,
    slug,
    branchName,
    worktreePath,
    source: options.source,
  };

  console.log(JSON.stringify(plan, null, 2));

  if (options.printOnly) {
    return;
  }

  if (await branchExists(repoRoot, branchName)) {
    throw new Error(`Branch already exists: ${branchName}`);
  }

  await runCapture("git", ["worktree", "add", "-b", branchName, worktreePath], repoRoot);

  await copySeedFiles({
    entries: config.seed?.copy ?? [],
    sourceRoot: repoRoot,
    targetRoot: worktreePath,
    forceOverwrite: false,
  });

  if (options.runHooks) {
    for (const command of config.hooks?.afterNew ?? []) {
      log(`running hook: ${command}`);
      await runShell(command, worktreePath);
    }
  }

  const worktreeContext = await getRepoContext(worktreePath, { requireLinkedWorktree: true });

  await writeState(worktreeContext.statePath, {
    version: 1,
    worktreeId: worktreeContext.worktreeId,
    worktreePath: worktreeContext.worktreePath,
    gitBranch: worktreeContext.gitBranch,
    mode: "plain",
    generatedFiles: [".worktree-state.json"],
  });

  log(`created worktree: ${worktreePath}`);
}
