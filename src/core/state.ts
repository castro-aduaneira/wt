import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";

export interface WorktreeState {
  version: 1;
  worktreeId: string;
  worktreePath: string;
  gitBranch: string;
  mode: "plain" | "staging" | "emancipated";
  generatedFiles: string[];
}

export async function readState(statePath: string): Promise<WorktreeState | null> {
  if (!(await pathExists(statePath))) {
    return null;
  }

  const raw = await fs.readFile(statePath, "utf8");
  return JSON.parse(raw) as WorktreeState;
}

export async function writeState(statePath: string, state: WorktreeState): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}
