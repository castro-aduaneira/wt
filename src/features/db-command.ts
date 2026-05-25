import fs from "node:fs/promises";
import path from "node:path";
import { dumpDatabaseToFile } from "../adapters/supabase/supabase-db.js";
import { parseSupabaseStatusEnvOutput, requiredSupabaseEnvValue } from "../adapters/supabase/supabase-env.js";
import {
  ensureStageEnvironment,
  getStageDefinition,
  rebuildStageEnvironment,
} from "../adapters/supabase/supabase-stage.js";
import { buildSupabaseStartArgs, buildSupabaseStatusArgs, buildSupabaseStopArgs } from "../adapters/supabase/supabase-runtime.js";
import { materializeSupabaseWorkdir } from "../adapters/supabase/supabase-workdir.js";
import { runCapture, runInherit } from "../core/command.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { upsertManagedEnvFile, removeManagedEnvFileBlock } from "../core/managed-env.js";
import { getRepoContext, type RepoContext } from "../core/repo-context.js";
import { readFirstState, type WorktreeStateV2 } from "../core/state.js";

const DEFAULT_WORKTREE_PROJECT_ID_PREFIX = "wt_";

export async function dbCommand(
  command: "emancipate" | "rejoin",
  options: { cwd: string; fresh?: boolean },
): Promise<void> {
  if (command === "emancipate") {
    await emancipate(options.cwd);
    return;
  }

  await rejoin(options.cwd);
}

export async function showStageStatus(input: { cwd: string }): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const stage = await getStageDefinition(context);

  console.log(
    JSON.stringify(
      {
        projectId: stage.projectId,
        workdir: stage.workdir,
        snapshotPath: stage.snapshotPath,
        ports: stage.ports,
        running: stage.running,
        snapshotExists: stage.snapshotExists,
        sourceConfigPath: stage.sourceConfigPath,
      },
      null,
      2,
    ),
  );
}

export async function showWorktreeStatus(input: { cwd: string }): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });
  const state = await getWorktreeStateOrDefault(context);

  console.log(JSON.stringify(state, null, 2));
}

export async function ensureStage(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const stage = await ensureStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });

  console.log(`shared staging ready: ${stage.projectId} (${stage.envMap.API_URL})`);
}

export async function refreshStageLocalSnapshot(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const stage = await ensureStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });

  await dumpDatabaseToFile({
    workdir: stage.workdir,
    outputPath: stage.snapshotPath,
  });

  console.log(`staging snapshot refreshed: ${stage.snapshotPath}`);
}

export async function rebuildStage(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const stage = await rebuildStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });

  console.log(`shared staging rebuilt: ${stage.projectId}`);
}

async function emancipate(cwd: string): Promise<void> {
  const context = await getRepoContext(cwd, { requireLinkedWorktree: false });
  const source = await readSupabaseConfigTemplate(context.worktreePath);
  const materialized = await materializeSupabaseWorkdir({
    sourceSupabaseDir: path.dirname(source.configPath),
    targetWorkdir: path.join(context.worktreeRuntimeRoot, "supabase-workdir"),
    worktreeId: context.worktreeId,
    rawTemplate: source.rawTemplate,
    withAnalytics: false,
  });

  await runInherit(
    "npx",
    buildSupabaseStartArgs({ workdir: materialized.workdir, withAnalytics: false }),
    context.worktreePath,
  );

  const status = await runCapture(
    "npx",
    buildSupabaseStatusArgs({ workdir: materialized.workdir, envOutput: true }),
    context.worktreePath,
  );
  const envMap = parseSupabaseStatusEnvOutput(status.stdout);
  const dbUrl = requiredSupabaseEnvValue(envMap, "DB_URL");
  const parsedDbUrl = new URL(dbUrl);

  await upsertManagedEnvFile({
    envPath: context.envPath,
    values: {
      WT_SUPABASE_ENV_MODE: "emancipated",
      WT_SUPABASE_WORKDIR: materialized.workdir,
      WT_SUPABASE_PROJECT_ID: materialized.projectId,
      SUPABASE_URL: requiredSupabaseEnvValue(envMap, "API_URL"),
      SUPABASE_ANON_KEY: requiredSupabaseEnvValue(envMap, "ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: requiredSupabaseEnvValue(envMap, "SERVICE_ROLE_KEY"),
      SUPABASE_PUBLISHABLE_KEY: requiredSupabaseEnvValue(envMap, "PUBLISHABLE_KEY"),
      SUPABASE_SECRET_KEY: requiredSupabaseEnvValue(envMap, "SECRET_KEY"),
      SUPABASE_JWT_SECRET: requiredSupabaseEnvValue(envMap, "JWT_SECRET"),
      VITE_PUBLIC_SUPABASE_URL: requiredSupabaseEnvValue(envMap, "API_URL"),
      VITE_PUBLIC_SUPABASE_ANON_KEY: requiredSupabaseEnvValue(envMap, "ANON_KEY"),
      POSTGRES_HOST: parsedDbUrl.hostname,
      POSTGRES_USER: decodeURIComponent(parsedDbUrl.username || "postgres"),
      POSTGRES_PASSWORD: decodeURIComponent(parsedDbUrl.password || "postgres"),
      POSTGRES_DATABASE: parsedDbUrl.pathname.replace(/^\//, "") || "postgres",
      POSTGRES_URL: dbUrl,
      POSTGRES_URL_NON_POOLING: dbUrl,
      POSTGRES_PRISMA_URL: dbUrl,
      LOCAL_DB_URL: dbUrl,
    },
  });

  console.log(`Bound .env to isolated Supabase stack: ${materialized.projectId}`);
}

async function rejoin(cwd: string): Promise<void> {
  const context = await getRepoContext(cwd, { requireLinkedWorktree: false });
  const source = await readSupabaseConfigTemplate(context.worktreePath);
  const materialized = await materializeSupabaseWorkdir({
    sourceSupabaseDir: path.dirname(source.configPath),
    targetWorkdir: path.join(context.worktreeRuntimeRoot, "supabase-workdir"),
    worktreeId: context.worktreeId,
    rawTemplate: source.rawTemplate,
    withAnalytics: false,
  });

  await runInherit(
    "npx",
    buildSupabaseStopArgs({ workdir: materialized.workdir, noBackup: false }),
    context.worktreePath,
  );
  await removeManagedEnvFileBlock(context.envPath);
  console.log("Stopped isolated Supabase stack and removed wt-managed environment block from .env.");
}

async function getWorktreeStateOrDefault(context: RepoContext): Promise<WorktreeStateV2> {
  const existing = await readFirstState([context.statePath, context.sharedStatePath]);
  return normalizeWorktreeState(existing, context);
}

async function normalizeWorktreeState(
  rawState: unknown,
  context: RepoContext,
): Promise<WorktreeStateV2> {
  const raw = isRecord(rawState) ? rawState : {};
  const rawStaging = isRecord(raw.staging) ? raw.staging : {};
  const rawEmancipated = isRecord(raw.emancipated) ? raw.emancipated : {};
  const stageDefinition = await getStageDefinition(context);
  const defaultEmancipated = await getDefaultEmancipated(context);
  const mode = raw.mode === "emancipated" ? "emancipated" : "staging";

  return {
    version: 2,
    worktreeId: typeof raw.worktreeId === "string" ? raw.worktreeId : context.worktreeId,
    worktreePath: typeof raw.worktreePath === "string" ? raw.worktreePath : context.worktreePath,
    gitBranch: typeof raw.gitBranch === "string" ? raw.gitBranch : context.gitBranch,
    mode,
    staging: {
      projectId:
        typeof rawStaging.projectId === "string" ? rawStaging.projectId : stageDefinition.projectId,
      workdir: typeof rawStaging.workdir === "string" ? rawStaging.workdir : stageDefinition.workdir,
      snapshotPath:
        typeof rawStaging.snapshotPath === "string"
          ? rawStaging.snapshotPath
          : stageDefinition.snapshotPath,
      ports: isRecord(rawStaging.ports)
        ? toNumberRecord(rawStaging.ports)
        : null,
      status: toRuntimeStatus(rawStaging.status, "absent"),
      envMap: isRecord(rawStaging.envMap) ? toStringRecord(rawStaging.envMap) : null,
    },
    emancipated: {
      projectId:
        typeof rawEmancipated.projectId === "string"
          ? rawEmancipated.projectId
          : defaultEmancipated.projectId,
      workdir:
        typeof rawEmancipated.workdir === "string"
          ? rawEmancipated.workdir
          : defaultEmancipated.workdir,
      ports: isRecord(rawEmancipated.ports)
        ? toNumberRecord(rawEmancipated.ports)
        : null,
      status: toRuntimeStatus(rawEmancipated.status, "absent"),
      preserved: typeof rawEmancipated.preserved === "boolean" ? rawEmancipated.preserved : false,
      envMap: isRecord(rawEmancipated.envMap) ? toStringRecord(rawEmancipated.envMap) : null,
    },
    generatedFiles: Array.isArray(raw.generatedFiles)
      ? [...new Set(raw.generatedFiles.filter((value): value is string => typeof value === "string"))]
      : [".env", ".worktree-state.json"],
  };
}

async function getDefaultEmancipated(context: RepoContext): Promise<{
  projectId: string;
  workdir: string;
}> {
  const { config } = await loadConfig(context.worktreePath);
  const prefix = config.runtime?.worktreeProjectIdPrefix ?? DEFAULT_WORKTREE_PROJECT_ID_PREFIX;

  return {
    projectId: `${prefix}${context.worktreeId}`,
    workdir: path.join(context.worktreeRuntimeRoot, "project"),
  };
}

async function readSupabaseConfigTemplate(worktreePath: string): Promise<{
  configPath: string;
  rawTemplate: string;
}> {
  const { config } = await loadConfig(worktreePath);
  const configPath = path.resolve(
    worktreePath,
    config.supabase?.configPath ?? "supabase/config.toml",
  );

  if (!(await pathExists(configPath))) {
    throw new Error(`Supabase config not found: ${configPath}`);
  }

  return {
    configPath,
    rawTemplate: await fs.readFile(configPath, "utf8"),
  };
}

function toRuntimeStatus(value: unknown, fallback: "absent" | "stopped" | "running"):
  | "absent"
  | "stopped"
  | "running" {
  return value === "running" || value === "stopped" || value === "absent" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function toNumberRecord(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}
