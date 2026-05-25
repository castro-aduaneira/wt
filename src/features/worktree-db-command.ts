import path from "node:path";
import { requiredSupabaseEnvValue } from "../adapters/supabase/supabase-env.js";
import { ensureStageEnvironment, getStageDefinition } from "../adapters/supabase/supabase-stage.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { upsertWorktreeManagedEnvFile } from "../core/managed-env.js";
import { getRepoContext, type RepoContext } from "../core/repo-context.js";
import { readFirstState, writeState, type WorktreeStateV2 } from "../core/state.js";

const DEFAULT_WORKTREE_PROJECT_ID_PREFIX = "wt_";

export async function showWorktreeStatus(input: { cwd: string }): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });
  const state = await getWorktreeStateOrDefault(context);

  console.log(JSON.stringify(state, null, 2));
}

export async function initWorktreeDatabase(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: true });

  if (!(await pathExists(context.envPath))) {
    throw new Error(
      `Missing .env at ${context.envPath}. Run wt init first so the base file exists before environment binding.`,
    );
  }

  const previousState = await getWorktreeStateOrDefault(context);
  const stage = await ensureStageEnvironment(context, {
    withAnalytics: input.withAnalytics,
  });
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
    },
    context,
  );

  await upsertWorktreeManagedEnvFile({
    envPath: context.envPath,
    values: renderWorktreeEnvValues(nextState),
  });
  await writeWorktreeState(context, nextState);

  console.log(`worktree initialized in shared staging mode: ${nextState.worktreeId}`);
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
      ports: isRecord(rawStaging.ports) ? toNumberRecord(rawStaging.ports) : stageDefinition.ports,
      status: toRuntimeStatus(rawStaging.status, stageDefinition.running ? "running" : "stopped"),
      envMap: isRecord(rawStaging.envMap) ? toStringRecord(rawStaging.envMap) : null,
    },
    emancipated: {
      projectId: typeof rawEmancipated.projectId === "string" ? rawEmancipated.projectId : defaultEmancipated.projectId,
      workdir: typeof rawEmancipated.workdir === "string" ? rawEmancipated.workdir : defaultEmancipated.workdir,
      ports: isRecord(rawEmancipated.ports) ? toNumberRecord(rawEmancipated.ports) : null,
      status: toRuntimeStatus(rawEmancipated.status, "absent"),
      preserved: typeof rawEmancipated.preserved === "boolean" ? rawEmancipated.preserved : false,
      envMap: isRecord(rawEmancipated.envMap) ? toStringRecord(rawEmancipated.envMap) : null,
    },
    generatedFiles: Array.isArray(raw.generatedFiles)
      ? [...new Set(raw.generatedFiles.filter((value): value is string => typeof value === "string"))]
      : [".env", ".worktree-state.json"],
  };
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
  return {
    ...state,
    staging: { ...state.staging, envMap: null },
    emancipated: { ...state.emancipated, envMap: null },
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
