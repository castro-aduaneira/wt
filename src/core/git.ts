import fs from "node:fs/promises";
import path from "node:path";
import { runCapture } from "./command.js";

export async function getGitTopLevel(cwd: string): Promise<string> {
  const result = await runCapture("git", ["rev-parse", "--show-toplevel"], cwd);
  return result.stdout.trim();
}

export async function getGitCommonDir(cwd: string): Promise<string> {
  const result = await runCapture("git", ["rev-parse", "--git-common-dir"], cwd);
  const raw = result.stdout.trim();

  if (!raw) {
    throw new Error("Unable to resolve git common dir.");
  }

  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(cwd, raw);
}

export async function getCurrentGitBranch(cwd: string): Promise<string> {
  const result = await runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return result.stdout.trim();
}

export async function resolveGitDir(cwd: string): Promise<string> {
  const dotGitPath = path.join(cwd, ".git");
  const stat = await fs.stat(dotGitPath);

  if (stat.isDirectory()) {
    return dotGitPath;
  }

  if (stat.isFile()) {
    const content = await fs.readFile(dotGitPath, "utf8");
    const match = content.match(/^gitdir:\s*(.+)\s*$/m);

    if (!match?.[1]) {
      throw new Error(`Unable to parse .git file at ${dotGitPath}`);
    }

    return path.resolve(cwd, match[1]);
  }

  throw new Error(`Unsupported .git entry at ${dotGitPath}`);
}

export function isLinkedWorktreeGitDir(gitDir: string): boolean {
  const normalized = path.normalize(gitDir);
  return normalized.split(path.sep).includes("worktrees");
}

export async function resolveMainRepoPath(gitDir: string): Promise<string> {
  const commondirPath = path.join(gitDir, "commondir");
  const raw = await fs.readFile(commondirPath, "utf8");
  const commonDir = path.resolve(gitDir, raw.trim());
  return path.dirname(path.normalize(commonDir));
}

export async function branchExists(cwd: string, branchName: string): Promise<boolean> {
  try {
    await runCapture("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], cwd);
    return true;
  } catch {
    return false;
  }
}
