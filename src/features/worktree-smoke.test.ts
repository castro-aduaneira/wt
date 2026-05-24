import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCapture } from "../core/command.js";
import { destroyWorktree } from "./destroy-worktree.js";
import { newWorktree } from "./new-worktree.js";

const tempRoots: string[] = [];

async function createSmokeRepo(): Promise<{ root: string; repo: string; wtRoot: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wt-smoke-test-"));
  tempRoots.push(root);

  const repo = path.join(root, "repo");
  const wtRoot = path.join(root, "worktrees");

  await fs.mkdir(repo, { recursive: true });
  await runCapture("git", ["init"], repo);
  await runCapture("git", ["config", "user.email", "test@example.com"], repo);
  await runCapture("git", ["config", "user.name", "Test User"], repo);

  await fs.writeFile(path.join(repo, "README.md"), "# Smoke Repo\n");
  await fs.writeFile(path.join(repo, ".env"), "SECRET=dev\n");
  await fs.writeFile(
    path.join(repo, "wt.config.json"),
    `${JSON.stringify(
      {
        worktreeRoot: wtRoot,
        branchPrefix: "test/",
        seed: {
          copy: [
            {
              source: ".env",
              target: ".env",
              required: true,
              overwrite: false,
            },
          ],
        },
        hooks: {
          afterNew: [],
        },
        supabase: {
          enabled: false,
        },
      },
      null,
      2,
    )}\n`,
  );

  await runCapture("git", ["add", "README.md", "wt.config.json"], repo);
  await runCapture("git", ["commit", "-m", "init smoke repo"], repo);

  return { root, repo, wtRoot };
}

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { force: true, recursive: true });
  }
});

describe("worktree smoke", () => {
  it("creates a linked worktree with seed files and initial state", async () => {
    const { repo, wtRoot } = await createSmokeRepo();

    await newWorktree({
      cwd: repo,
      source: "tasks/minha-feature.md",
      runHooks: false,
      printOnly: false,
    });

    const worktreePath = path.join(wtRoot, "minha-feature");
    const branch = await runCapture("git", ["branch", "--show-current"], worktreePath);
    const env = await fs.readFile(path.join(worktreePath, ".env"), "utf8");
    const state = JSON.parse(
      await fs.readFile(path.join(worktreePath, ".worktree-state.json"), "utf8"),
    ) as { gitBranch: string; mode: string; worktreePath: string };

    expect(branch.stdout.trim()).toBe("test/minha-feature");
    expect(env).toBe("SECRET=dev\n");
    expect(state.gitBranch).toBe("test/minha-feature");
    expect(state.mode).toBe("plain");
    expect(state.worktreePath).toBe(worktreePath);
  });

  it("destroys only the current linked worktree", async () => {
    const { repo, wtRoot } = await createSmokeRepo();

    await newWorktree({
      cwd: repo,
      source: "tasks/minha-feature.md",
      runHooks: false,
      printOnly: false,
    });

    const worktreePath = path.join(wtRoot, "minha-feature");

    await destroyWorktree({ cwd: worktreePath, force: true });

    await expect(fs.access(worktreePath)).rejects.toThrow();

    const list = await runCapture("git", ["worktree", "list"], repo);
    expect(list.stdout).not.toContain(worktreePath);
    expect(list.stdout).toContain(repo);
  });
});
