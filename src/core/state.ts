import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";

export type WorktreeMode = "plain" | "staging" | "emancipated";

export interface WorktreeStateV1 {
  version: 1;
  worktreeId: string;
  worktreePath: string;
  gitBranch: string;
  mode: WorktreeMode;
  generatedFiles: string[];
}

export interface StageState {
  projectId: string;
  workdir: string;
  snapshotPath: string;
  ports: Record<string, number> | null;
  status: "absent" | "stopped" | "running";
  envMap?: Record<string, string> | null;
}

export interface EmancipatedState {
  projectId: string;
  workdir: string;
  ports: Record<string, number> | null;
  status: "absent" | "stopped" | "running";
  preserved: boolean;
  envMap?: Record<string, string> | null;
}

export interface WorktreeStateV2 {
  version: 2;
  worktreeId: string;
  worktreePath: string;
  gitBranch: string;
  mode: "staging" | "emancipated";
  staging: StageState;
  emancipated: EmancipatedState;
  generatedFiles: string[];
}

export type WorktreeState = WorktreeStateV1 | WorktreeStateV2;

export async function readState(statePath: string): Promise<WorktreeState | null> {
  if (!(await pathExists(statePath))) {
    return null;
  }

  const raw = await fs.readFile(statePath, "utf8");
  return JSON.parse(raw) as WorktreeState;
}

export async function readFirstState(statePaths: string[]): Promise<WorktreeState | null> {
  for (const statePath of statePaths) {
    const state = await readState(statePath);

    if (state) {
      return state;
    }
  }

  return null;
}

export async function writeState(statePath: string, state: WorktreeState): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}
