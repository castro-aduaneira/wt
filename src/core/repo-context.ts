import path from "node:path";
import {
  getCurrentGitBranch,
  getGitCommonDir,
  getGitTopLevel,
  isLinkedWorktreeGitDir,
  resolveGitDir,
  resolveMainRepoPath,
} from "./git.js";
import { buildWorktreeId } from "./identity.js";

export interface RepoContext {
  cwd: string;
  repoRoot: string;
  worktreePath: string;
  worktreeName: string;
  gitBranch: string;
  gitCommonDir: string;
  gitDir: string;
  isLinkedWorktree: boolean;
  mainRepoPath: string;
  worktreeId: string;
  runtimeRoot: string;
  statePath: string;
  envPath: string;
}

export async function getRepoContext(
  cwd: string,
  options: { requireLinkedWorktree: boolean },
): Promise<RepoContext> {
  const repoRoot = await getGitTopLevel(cwd);
  const gitDir = await resolveGitDir(repoRoot);
  const isLinkedWorktree = isLinkedWorktreeGitDir(gitDir);

  if (options.requireLinkedWorktree && !isLinkedWorktree) {
    throw new Error("This command must be executed from inside a linked Git worktree.");
  }

  const gitCommonDir = await getGitCommonDir(repoRoot);
  const mainRepoPath = isLinkedWorktree ? await resolveMainRepoPath(gitDir) : repoRoot;
  const worktreePath = repoRoot;
  const worktreeId = buildWorktreeId(worktreePath);
  const runtimeRoot = path.join(gitCommonDir, "wt-local-envs");

  return {
    cwd: path.resolve(cwd),
    repoRoot,
    worktreePath,
    worktreeName: path.basename(worktreePath),
    gitBranch: await getCurrentGitBranch(repoRoot),
    gitCommonDir,
    gitDir,
    isLinkedWorktree,
    mainRepoPath: path.resolve(mainRepoPath),
    worktreeId,
    runtimeRoot,
    statePath: path.join(worktreePath, ".worktree-state.json"),
    envPath: path.join(worktreePath, ".env"),
  };
}
