import fs from "node:fs/promises";
import path from "node:path";
import { runCapture, runInherit } from "../../core/command.js";
import { loadConfig } from "../../core/config.js";
import { pathExists } from "../../core/fs.js";
import { hashString } from "../../core/identity.js";
import type { RepoContext } from "../../core/repo-context.js";
import { withRuntimeLock } from "../../core/runtime-lock.js";
import { readSupabasePortsFromConfig, renderSupabaseConfig, type SupabasePorts } from "./supabase-config.js";
import {
  applyLocalSeedIntoRunningProject,
  dumpDatabaseToFile,
  getSupabaseStatusEnvMap,
  restoreBackupIntoRunningProject,
} from "./supabase-db.js";
import {
  buildSupabaseStartArgs,
  buildSupabaseStopArgs,
  purgeSupabaseProjectResources,
} from "./supabase-runtime.js";

export const DEFAULT_STAGE_PROJECT_ID_PREFIX = "wt_stage_";
export const STAGING_PROJECT_DIR_NAME = "staging";
export const STAGING_SNAPSHOT_FILE_NAME = "staging.dump";
export const STAGE_REBUILD_LOCK_NAME = "stage-rebuild.lock";

const EXCLUDED_SUPABASE_ENTRIES = new Set(["config.toml", ".temp", ".branches"]);

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

export interface RunningStageEnvironment extends StageDefinition {
  running: true;
  envMap: Record<string, string>;
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

export async function ensureStageEnvironment(
  context: RepoContext,
  options: { withAnalytics: boolean } = { withAnalytics: false },
): Promise<RunningStageEnvironment> {
  const stageDefinition = await getStageDefinition(context);

  await materializeStageProject(context, options);

  if (!(await isSupabaseProjectRunning(stageDefinition.workdir))) {
    await runInherit(
      "npx",
      buildSupabaseStartArgs({
        workdir: stageDefinition.workdir,
        withAnalytics: options.withAnalytics,
      }),
      stageDefinition.workdir,
    );
  }

  return getRunningStageEnvironment(context);
}

export async function rebuildStageEnvironment(
  context: RepoContext,
  options: { withAnalytics: boolean } = { withAnalytics: false },
): Promise<RunningStageEnvironment> {
  return withRuntimeLock({
    locksRoot: path.join(context.runtimeRoot, "locks"),
    fileName: STAGE_REBUILD_LOCK_NAME,
    operation: async () => {
      const stageDefinition = await getStageDefinition(context);
      const snapshotExists = await pathExists(stageDefinition.snapshotPath);

      if (await pathExists(stageDefinition.workdir)) {
        if (await isSupabaseProjectRunning(stageDefinition.workdir)) {
          await runInherit(
            "npx",
            buildSupabaseStopArgs({
              workdir: stageDefinition.workdir,
              noBackup: true,
            }),
            stageDefinition.workdir,
          );
        }

        await purgeSupabaseProjectResources({
          projectId: stageDefinition.projectId,
          cwd: context.repoRoot,
        });
        await fs.rm(stageDefinition.workdir, { force: true, recursive: true });
      }

      await materializeStageProject(context, options);
      await runInherit(
        "npx",
        buildSupabaseStartArgs({
          workdir: stageDefinition.workdir,
          withAnalytics: options.withAnalytics,
        }),
        stageDefinition.workdir,
      );

      if (snapshotExists) {
        await restoreBackupIntoRunningProject({
          workdir: stageDefinition.workdir,
          backupPath: stageDefinition.snapshotPath,
        });
      }

      await applyLocalSeedIntoRunningProject(stageDefinition.workdir);

      const stage = await getRunningStageEnvironment(context);
      await dumpDatabaseToFile({
        workdir: stage.workdir,
        outputPath: stage.snapshotPath,
      });

      return stage;
    },
  });
}

export async function getRunningStageEnvironment(context: RepoContext): Promise<RunningStageEnvironment> {
  const stageDefinition = await getStageDefinition(context);
  const envMap = await getSupabaseStatusEnvMap(stageDefinition.workdir);

  return {
    ...stageDefinition,
    running: true,
    envMap,
  };
}

export async function materializeStageProject(
  context: RepoContext,
  options: { withAnalytics: boolean } = { withAnalytics: false },
): Promise<StageDefinition> {
  const scaffold = await resolveStageScaffold(context);
  const paths = getStageRuntimePaths(context.runtimeRoot);
  const stageProjectIdPrefix = await resolveStageProjectIdPrefix(context);
  const projectId = buildStageProjectId(context.mainRepoPath, stageProjectIdPrefix);
  const ports = readSupabasePortsFromConfig(scaffold.rawTemplate);
  const targetSupabaseDir = path.join(paths.stageProjectWorkdir, "supabase");

  await fs.mkdir(paths.stageProjectWorkdir, { recursive: true });

  if (!(await pathExists(targetSupabaseDir))) {
    await copySupabaseDirectory(scaffold.sourceSupabaseDir, targetSupabaseDir);
  }

  await fs.mkdir(path.join(targetSupabaseDir, ".temp"), { recursive: true });
  await fs.writeFile(
    path.join(targetSupabaseDir, "config.toml"),
    renderSupabaseConfig(scaffold.rawTemplate, {
      projectId,
      ports,
      analyticsEnabled: options.withAnalytics,
    }),
  );

  return getStageDefinition(context);
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

async function copySupabaseDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_SUPABASE_ENTRIES.has(entry.name)) {
      continue;
    }

    await fs.cp(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), {
      force: true,
      recursive: true,
    });
  }
}
