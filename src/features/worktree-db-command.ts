import fs from "node:fs/promises";
import path from "node:path";
import { renderSupabaseConfig, type SupabasePorts } from "../adapters/supabase/supabase-config.js";
import {
  dumpDatabaseToFile,
  getSupabaseStatusEnvMap,
  restoreBackupIntoRunningProject,
} from "../adapters/supabase/supabase-db.js";
import { requiredSupabaseEnvValue } from "../adapters/supabase/supabase-env.js";
import {
  ensureStageEnvironment,
  getStageDefinition,
  isSupabaseProjectRunning,
} from "../adapters/supabase/supabase-stage.js";
import {
  buildSupabaseStartArgs,
  buildSupabaseStopArgs,
  purgeSupabaseProjectResources,
} from "../adapters/supabase/supabase-runtime.js";
import { runInherit } from "../core/command.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { hashString } from "../core/identity.js";
import { upsertWorktreeManagedEnvFile } from "../core/managed-env.js";
import { getRepoContext, type RepoContext } from "../core/repo-context.js";
import { readFirstState, writeState, type WorktreeStateV2 } from "../core/state.js";

const DEFAULT_WORKTREE_PROJECT_ID_PREFIX = "wt_";
const DEV_PORT_BASE_MIN = 40000;
const DEV_PORT_BASE_MAX = 64980;
const DEV_PORT_BLOCK_SIZE = 20;
const EXCLUDED_SUPABASE_ENTRIES = new Set(["config.toml", ".temp", ".branches"]);

const DEV_PORT_OFFSETS = Object.freeze({
  shadow: 0,
  api: 1,
  db: 2,
  studio: 3,
  inbucket: 4,
  analytics: 7,
  pooler: 9,
});

export async function showWorktreeStatus(input: { cwd: string }): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });
  const state = await getWorktreeStateOrDefault(context);

  console.log(JSON.stringify(state, null, 2));
}

export async function getActiveSupabaseWorkdir(input: { cwd: string }): Promise<{
  workdir: string;
  mode: "staging" | "emancipated";
}> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const state = await getWorktreeStateOrDefault(context);

  if (state.mode === "emancipated") {
    return { workdir: state.emancipated.workdir, mode: "emancipated" };
  }

  return { workdir: state.staging.workdir, mode: "staging" };
}

export async function initWorktreeDatabase(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });

  await assertEnvFileExists(context);

  const previousState = await getWorktreeStateOrDefault(context);
  const stage = await ensureStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });
  const nextState = await buildStagingState(context, previousState, stage);

  await persistWorktreeEnvironment(context, nextState);
  console.log(`worktree initialized in shared staging mode: ${nextState.worktreeId}`);
}

export async function emancipateWorktreeDatabase(input: {
  cwd: string;
  fresh: boolean;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });

  await assertEnvFileExists(context);

  const previousState = await getWorktreeStateOrDefault(context);
  const stage = await ensureStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });

  if (!(await pathExists(stage.snapshotPath))) {
    await dumpDatabaseToFile({
      workdir: stage.workdir,
      outputPath: stage.snapshotPath,
    });
  }

  if (!input.fresh && previousState.emancipated.status !== "absent") {
    const running = await startExistingEmancipatedProject(context, previousState, input.withAnalytics);
    const nextState = await normalizeWorktreeState(
      {
        ...previousState,
        mode: "emancipated",
        staging: {
          projectId: stage.projectId,
          workdir: stage.workdir,
          snapshotPath: stage.snapshotPath,
          ports: stage.ports,
          status: "running",
          envMap: stage.envMap,
        },
        emancipated: running,
      },
      context,
    );

    await persistWorktreeEnvironment(context, nextState);
    console.log(`worktree reattached to preserved dev stack: ${running.projectId}`);
    return;
  }

  const emancipated = await createFreshEmancipatedEnvironment(context, stage, previousState, input.withAnalytics);
  const nextState = await normalizeWorktreeState(
    {
      ...previousState,
      mode: "emancipated",
      staging: {
        projectId: stage.projectId,
        workdir: stage.workdir,
        snapshotPath: stage.snapshotPath,
        ports: stage.ports,
        status: "running",
        envMap: stage.envMap,
      },
      emancipated,
    },
    context,
  );

  await persistWorktreeEnvironment(context, nextState);
  console.log(`worktree emancipated with isolated stack: ${emancipated.projectId}`);
}

export async function rejoinWorktreeDatabase(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });

  await assertEnvFileExists(context);

  const previousState = await getWorktreeStateOrDefault(context);
  const stage = await ensureStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });
  const emancipated = await resolveEmancipatedEnvironment(context, previousState);

  if (emancipated.status === "running") {
    await runInherit(
      "npx",
      buildSupabaseStopArgs({ workdir: emancipated.workdir, noBackup: false }),
      context.worktreePath,
    );
  }

  const nextState = await normalizeWorktreeState(
    {
      ...previousState,
      mode: "staging",
      staging: {
        projectId: stage.projectId,
        workdir: stage.workdir,
        snapshotPath: stage.snapshotPath,
        ports: stage.ports,
        status: "running",
        envMap: stage.envMap,
      },
      emancipated: {
        ...emancipated,
        status: emancipated.status === "absent" ? "absent" : "stopped",
        preserved: emancipated.status !== "absent",
      },
    },
    context,
  );

  await persistWorktreeEnvironment(context, nextState);

  if (previousState.mode === "staging") {
    console.log("worktree already using shared staging");
    return;
  }

  console.log(`worktree rejoined shared staging: ${stage.projectId}`);
}

async function assertEnvFileExists(context: RepoContext): Promise<void> {
  if (!(await pathExists(context.envPath))) {
    throw new Error(
      `Missing .env at ${context.envPath}. Run wt init first so the base file exists before environment binding.`,
    );
  }
}

async function buildStagingState(
  context: RepoContext,
  previousState: WorktreeStateV2,
  stage: Awaited<ReturnType<typeof ensureStageEnvironment>>,
): Promise<WorktreeStateV2> {
  return normalizeWorktreeState(
    {
      ...previousState,
      mode: "staging",
      staging: {
        projectId: stage.projectId,
        workdir: stage.workdir,
        snapshotPath: stage.snapshotPath,
        ports: stage.ports,
        status: "running",
        envMap: stage.envMap,
      },
    },
    context,
  );
}

async function persistWorktreeEnvironment(context: RepoContext, state: WorktreeStateV2): Promise<void> {
  await upsertWorktreeManagedEnvFile({
    envPath: context.envPath,
    values: renderWorktreeEnvValues(state),
  });
  await writeWorktreeState(context, state);
}

async function getWorktreeStateOrDefault(context: RepoContext): Promise<WorktreeStateV2> {
  const existing = await readFirstState([context.statePath, context.sharedStatePath]);
  return normalizeWorktreeState(existing, context);
}

async function writeWorktreeState(context: RepoContext, state: WorktreeStateV2): Promise<void> {
  const sanitized = sanitizeStateForPersistence(state);

  await writeState(context.statePath, sanitized);
  await writeState(context.sharedStatePath, sanitized);
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

  return {
    version: 2,
    worktreeId: typeof raw.worktreeId === "string" ? raw.worktreeId : context.worktreeId,
    worktreePath: typeof raw.worktreePath === "string" ? raw.worktreePath : context.worktreePath,
    gitBranch: typeof raw.gitBranch === "string" ? raw.gitBranch : context.gitBranch,
    mode: raw.mode === "emancipated" ? "emancipated" : "staging",
    staging: {
      projectId: typeof rawStaging.projectId === "string" ? rawStaging.projectId : stageDefinition.projectId,
      workdir: typeof rawStaging.workdir === "string" ? rawStaging.workdir : stageDefinition.workdir,
      snapshotPath: typeof rawStaging.snapshotPath === "string" ? rawStaging.snapshotPath : stageDefinition.snapshotPath,
      ports: isRecord(rawStaging.ports) ? toNumberRecord(rawStaging.ports) : supabasePortsToRecord(stageDefinition.ports),
      status: toRuntimeStatus(rawStaging.status, stageDefinition.running ? "running" : "stopped"),
      envMap: isRecord(rawStaging.envMap) ? toStringRecord(rawStaging.envMap) : null,
    },
    emancipated: {
      projectId: typeof rawEmancipated.projectId === "string" ? rawEmancipated.projectId : defaultEmancipated.projectId,
      workdir: typeof rawEmancipated.workdir === "string" ? rawEmancipated.workdir : defaultEmancipated.workdir,
      ports: isRecord(rawEmancipated.ports) ? toNumberRecord(rawEmancipated.ports) : defaultEmancipated.ports,
      status: toRuntimeStatus(rawEmancipated.status, "absent"),
      preserved: typeof rawEmancipated.preserved === "boolean" ? rawEmancipated.preserved : false,
      envMap: isRecord(rawEmancipated.envMap) ? toStringRecord(rawEmancipated.envMap) : null,
    },
    generatedFiles: Array.isArray(raw.generatedFiles)
      ? [...new Set(raw.generatedFiles.filter((value): value is string => typeof value === "string"))]
      : [".env", ".worktree-state.json"],
  };
}

async function createFreshEmancipatedEnvironment(
  context: RepoContext,
  stage: Awaited<ReturnType<typeof ensureStageEnvironment>>,
  previousState: WorktreeStateV2,
  withAnalytics: boolean,
): Promise<WorktreeStateV2["emancipated"]> {
  const definition = await prepareEmancipatedDefinition(context, previousState.emancipated);

  await purgeSupabaseProjectResources({
    projectId: definition.projectId,
    cwd: context.worktreePath,
  });

  if (await pathExists(definition.workdir)) {
    await fs.rm(definition.workdir, { force: true, recursive: true });
  }

  await materializeEmancipatedProject(context, definition, withAnalytics);
  await runInherit(
    "npx",
    buildSupabaseStartArgs({ workdir: definition.workdir, withAnalytics }),
    definition.workdir,
  );
  await restoreBackupIntoRunningProject({
    workdir: definition.workdir,
    backupPath: stage.snapshotPath,
  });

  return {
    ...definition,
    status: "running",
    preserved: true,
    envMap: await getSupabaseStatusEnvMap(definition.workdir),
  };
}

async function startExistingEmancipatedProject(
  context: RepoContext,
  previousState: WorktreeStateV2,
  withAnalytics: boolean,
): Promise<WorktreeStateV2["emancipated"]> {
  const definition = await resolveEmancipatedEnvironment(context, previousState);

  if (!(await pathExists(definition.workdir))) {
    const stage = await ensureStageEnvironment(context, { withAnalytics });
    await dumpDatabaseToFile({ workdir: stage.workdir, outputPath: stage.snapshotPath });
    return createFreshEmancipatedEnvironment(context, stage, previousState, withAnalytics);
  }

  await materializeEmancipatedProject(context, definition, withAnalytics);

  if (!(await isSupabaseProjectRunning(definition.workdir))) {
    await runInherit(
      "npx",
      buildSupabaseStartArgs({ workdir: definition.workdir, withAnalytics }),
      definition.workdir,
    );
  }

  return {
    ...definition,
    status: "running",
    preserved: true,
    envMap: await getSupabaseStatusEnvMap(definition.workdir),
  };
}

async function resolveEmancipatedEnvironment(
  context: RepoContext,
  previousState: WorktreeStateV2,
): Promise<WorktreeStateV2["emancipated"]> {
  const definition = await prepareEmancipatedDefinition(context, previousState.emancipated);

  if (!(await pathExists(path.join(definition.workdir, "supabase", "config.toml")))) {
    return { ...definition, status: "absent", preserved: false, envMap: null };
  }

  if (!(await isSupabaseProjectRunning(definition.workdir))) {
    return { ...definition, status: "stopped", preserved: true, envMap: null };
  }

  return {
    ...definition,
    status: "running",
    preserved: true,
    envMap: await getSupabaseStatusEnvMap(definition.workdir),
  };
}

async function prepareEmancipatedDefinition(
  context: RepoContext,
  existingDefinition: WorktreeStateV2["emancipated"] | null,
): Promise<WorktreeStateV2["emancipated"]> {
  const defaultEmancipated = await getDefaultEmancipated(context);
  const ports = existingDefinition?.ports ?? defaultEmancipated.ports;

  return {
    projectId: defaultEmancipated.projectId,
    workdir: defaultEmancipated.workdir,
    ports,
    status: existingDefinition?.status ?? "absent",
    preserved: existingDefinition?.preserved ?? false,
    envMap: null,
  };
}

async function materializeEmancipatedProject(
  context: RepoContext,
  definition: WorktreeStateV2["emancipated"],
  withAnalytics: boolean,
): Promise<void> {
  const sourceSupabaseDir = path.join(context.worktreePath, "supabase");
  const targetSupabaseDir = path.join(definition.workdir, "supabase");
  const rawTemplate = await fs.readFile(path.join(sourceSupabaseDir, "config.toml"), "utf8");

  await fs.mkdir(targetSupabaseDir, { recursive: true });
  await fs.mkdir(path.join(targetSupabaseDir, ".temp"), { recursive: true });
  await ensureSupabaseSymlinkSet(sourceSupabaseDir, targetSupabaseDir);
  await fs.writeFile(
    path.join(targetSupabaseDir, "config.toml"),
    renderSupabaseConfig(rawTemplate, {
      projectId: definition.projectId,
      ports: recordToSupabasePorts(definition.ports),
      analyticsEnabled: withAnalytics,
    }),
  );
}

async function ensureSupabaseSymlinkSet(sourceSupabaseDir: string, targetSupabaseDir: string): Promise<void> {
  const entries = await fs.readdir(sourceSupabaseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_SUPABASE_ENTRIES.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceSupabaseDir, entry.name);
    const targetPath = path.join(targetSupabaseDir, entry.name);
    const relativeSource = path.relative(path.dirname(targetPath), sourcePath);

    if (await pathExists(targetPath)) {
      const stat = await fs.lstat(targetPath);

      if (stat.isSymbolicLink()) {
        const currentTarget = await fs.readlink(targetPath);

        if (currentTarget === relativeSource) {
          continue;
        }
      }

      await fs.rm(targetPath, { force: true, recursive: true });
    }

    await fs.symlink(relativeSource, targetPath, entry.isDirectory() ? "dir" : "file");
  }
}

function renderWorktreeEnvValues(state: WorktreeStateV2): Record<string, string> {
  const active = state.mode === "emancipated" ? state.emancipated : state.staging;
  const envMap = active.envMap;

  if (!envMap) {
    throw new Error("Cannot render managed env block without active Supabase status env values.");
  }

  const databaseUrl = requiredSupabaseEnvValue(envMap, "DB_URL");
  const apiUrl = requiredSupabaseEnvValue(envMap, "API_URL");
  const parsedDbUrl = new URL(databaseUrl);

  return {
    CT_WORKTREE_ENV_MODE: state.mode,
    CT_WORKTREE_ID: state.worktreeId,
    CT_SUPABASE_PROJECT_ID: active.projectId,
    SUPABASE_URL: apiUrl,
    SUPABASE_ANON_KEY: requiredSupabaseEnvValue(envMap, "ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: requiredSupabaseEnvValue(envMap, "SERVICE_ROLE_KEY"),
    SUPABASE_PUBLISHABLE_KEY: requiredSupabaseEnvValue(envMap, "PUBLISHABLE_KEY"),
    SUPABASE_SECRET_KEY: requiredSupabaseEnvValue(envMap, "SECRET_KEY"),
    SUPABASE_JWT_SECRET: requiredSupabaseEnvValue(envMap, "JWT_SECRET"),
    AGENT_ENROLL_SUPABASE_URL: apiUrl,
    AGENT_ENROLL_SUPABASE_ANON_KEY: requiredSupabaseEnvValue(envMap, "ANON_KEY"),
    VITE_PUBLIC_SUPABASE_URL: apiUrl,
    VITE_PUBLIC_SUPABASE_ANON_KEY: requiredSupabaseEnvValue(envMap, "ANON_KEY"),
    POSTGRES_HOST: parsedDbUrl.hostname,
    POSTGRES_USER: decodeURIComponent(parsedDbUrl.username || "postgres"),
    POSTGRES_PASSWORD: decodeURIComponent(parsedDbUrl.password || "postgres"),
    POSTGRES_DATABASE: parsedDbUrl.pathname.replace(/^\//, "") || "postgres",
    POSTGRES_URL: databaseUrl,
    POSTGRES_URL_NON_POOLING: databaseUrl,
    POSTGRES_PRISMA_URL: databaseUrl,
    LOCAL_DB_URL: databaseUrl,
  };
}

function sanitizeStateForPersistence(state: WorktreeStateV2): WorktreeStateV2 {
  const sanitized: WorktreeStateV2 = JSON.parse(JSON.stringify(state)) as WorktreeStateV2;

  delete sanitized.staging.envMap;
  delete sanitized.emancipated.envMap;

  return sanitized;
}

async function getDefaultEmancipated(context: RepoContext): Promise<{
  projectId: string;
  workdir: string;
  ports: Record<string, number>;
}> {
  const { config } = await loadConfig(context.worktreePath);
  const prefix = config.runtime?.worktreeProjectIdPrefix ?? DEFAULT_WORKTREE_PROJECT_ID_PREFIX;
  const projectId = `${prefix}${context.worktreeId}`;

  return {
    projectId,
    workdir: path.join(context.worktreeRuntimeRoot, "project"),
    ports: buildPortMap(allocatePortBase(projectId)),
  };
}

function allocatePortBase(projectId: string): number {
  const slotCount = Math.floor((DEV_PORT_BASE_MAX - DEV_PORT_BASE_MIN) / DEV_PORT_BLOCK_SIZE) + 1;
  const slotIndex = Number.parseInt(hashString(projectId, 6), 16) % slotCount;
  return DEV_PORT_BASE_MIN + slotIndex * DEV_PORT_BLOCK_SIZE;
}

function buildPortMap(basePort: number): Record<string, number> {
  return {
    shadow: basePort + DEV_PORT_OFFSETS.shadow,
    api: basePort + DEV_PORT_OFFSETS.api,
    db: basePort + DEV_PORT_OFFSETS.db,
    studio: basePort + DEV_PORT_OFFSETS.studio,
    inbucket: basePort + DEV_PORT_OFFSETS.inbucket,
    analytics: basePort + DEV_PORT_OFFSETS.analytics,
    pooler: basePort + DEV_PORT_OFFSETS.pooler,
  };
}

function recordToSupabasePorts(ports: Record<string, number> | null): SupabasePorts {
  if (!ports) {
    throw new Error("Cannot render Supabase config without allocated ports.");
  }

  return {
    shadow: requiredNumber(ports.shadow, "shadow"),
    api: requiredNumber(ports.api, "api"),
    db: requiredNumber(ports.db, "db"),
    studio: requiredNumber(ports.studio, "studio"),
    inbucket: requiredNumber(ports.inbucket, "inbucket"),
    analytics: requiredNumber(ports.analytics, "analytics"),
    pooler: requiredNumber(ports.pooler, "pooler"),
  };
}

function supabasePortsToRecord(ports: SupabasePorts): Record<string, number> {
  return {
    api: ports.api,
    db: ports.db,
    shadow: ports.shadow,
    studio: ports.studio,
    inbucket: ports.inbucket,
    analytics: ports.analytics,
    pooler: ports.pooler,
  };
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`Missing allocated Supabase port: ${label}`);
  }

  return value;
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
