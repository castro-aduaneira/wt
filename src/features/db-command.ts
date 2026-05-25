import fs from "node:fs/promises";
import path from "node:path";
import { parseSupabaseStatusEnvOutput, requiredSupabaseEnvValue } from "../adapters/supabase/supabase-env.js";
import { ensureStageEnvironment, getStageDefinition } from "../adapters/supabase/supabase-stage.js";
import { buildSupabaseStartArgs, buildSupabaseStatusArgs, buildSupabaseStopArgs } from "../adapters/supabase/supabase-runtime.js";
import { materializeSupabaseWorkdir } from "../adapters/supabase/supabase-workdir.js";
import { runCapture, runInherit } from "../core/command.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { upsertManagedEnvFile, removeManagedEnvFileBlock } from "../core/managed-env.js";
import { getRepoContext } from "../core/repo-context.js";

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
