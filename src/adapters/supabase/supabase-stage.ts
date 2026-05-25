import fs from "node:fs/promises";
import path from "node:path";
import { runCapture } from "../../core/command.js";
import { loadConfig } from "../../core/config.js";
import { pathExists } from "../../core/fs.js";
import { hashString } from "../../core/identity.js";
import type { RepoContext } from "../../core/repo-context.js";
import { readSupabasePortsFromConfig, type SupabasePorts } from "./supabase-config.js";

export const DEFAULT_STAGE_PROJECT_ID_PREFIX = "wt_stage_";
export const STAGING_PROJECT_DIR_NAME = "staging";
export const STAGING_SNAPSHOT_FILE_NAME = "staging.dump";

export interface StageRuntimePaths {
  stageRoot: string;
  stageProjectWorkdir: string;
  stageSnapshotPath: string;
}

export interface StageDefinition {
  projectId: string;
  workdir: string;
  snapshotPath: string;
  ports: SupabasePorts;
  running: boolean;
  snapshotExists: boolean;
  sourceSupabaseDir: string;
  sourceConfigPath: string;
}

export async function getStageDefinition(context: RepoContext): Promise<StageDefinition> {
  const scaffold = await resolveStageScaffold(context);
  const paths = getStageRuntimePaths(context.runtimeRoot);
  const stageProjectIdPrefix = await resolveStageProjectIdPrefix(context);

  return {
    projectId: buildStageProjectId(context.mainRepoPath, stageProjectIdPrefix),
    workdir: paths.stageProjectWorkdir,
    snapshotPath: paths.stageSnapshotPath,
    ports: readSupabasePortsFromConfig(scaffold.rawTemplate),
    running: await isSupabaseProjectRunning(paths.stageProjectWorkdir),
    snapshotExists: await pathExists(paths.stageSnapshotPath),
    sourceSupabaseDir: scaffold.sourceSupabaseDir,
    sourceConfigPath: scaffold.sourceConfigPath,
  };
}

export async function resolveStageScaffold(context: RepoContext): Promise<{
  sourceSupabaseDir: string;
  sourceConfigPath: string;
  rawTemplate: string;
}> {
  const { config } = await loadConfig(context.mainRepoPath);
  const configPath = path.resolve(
    context.mainRepoPath,
    config.supabase?.configPath ?? "supabase/config.toml",
  );

  if (!(await pathExists(configPath))) {
    throw new Error(
      [
        "Unable to resolve a canonical Supabase scaffold for shared staging.",
        `Canonical checkout: ${context.mainRepoPath}`,
        `Expected file: ${configPath}`,
        `Current worktree: ${context.worktreePath}`,
        "Fallback to current worktree is intentionally disabled to avoid staging drift.",
        "Fix: ensure the canonical checkout contains supabase/config.toml and rerun the command.",
      ].join("\n"),
    );
  }

  return {
    sourceSupabaseDir: path.dirname(configPath),
    sourceConfigPath: configPath,
    rawTemplate: await fs.readFile(configPath, "utf8"),
  };
}

export function getStageRuntimePaths(runtimeRoot: string): StageRuntimePaths {
  const stageRoot = path.join(runtimeRoot, STAGING_PROJECT_DIR_NAME);

  return {
    stageRoot,
    stageProjectWorkdir: path.join(stageRoot, "project"),
    stageSnapshotPath: path.join(stageRoot, "snapshots", STAGING_SNAPSHOT_FILE_NAME),
  };
}

export function buildStageProjectId(
  mainRepoPath: string,
  prefix = DEFAULT_STAGE_PROJECT_ID_PREFIX,
): string {
  return `${prefix}${hashString(path.resolve(mainRepoPath), 8)}`;
}

export async function resolveStageProjectIdPrefix(context: RepoContext): Promise<string> {
  const { config } = await loadConfig(context.worktreePath);
  return config.runtime?.stageProjectIdPrefix ?? DEFAULT_STAGE_PROJECT_ID_PREFIX;
}

export async function isSupabaseProjectRunning(workdir: string): Promise<boolean> {
  if (!(await pathExists(path.join(workdir, "supabase", "config.toml")))) {
    return false;
  }

  try {
    await runCapture("npx", ["supabase", "status", "-o", "env", "--workdir", workdir], workdir);
    return true;
  } catch {
    return false;
  }
}
