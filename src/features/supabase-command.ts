import fs from "node:fs/promises";
import path from "node:path";
import { readSupabasePortsFromConfig, renderSupabaseConfig } from "../adapters/supabase/supabase-config.js";
import { buildSupabaseStartArgs, buildSupabaseStatusArgs, buildSupabaseStopArgs } from "../adapters/supabase/supabase-runtime.js";
import { materializeSupabaseWorkdir } from "../adapters/supabase/supabase-workdir.js";
import { runCapture, runInherit } from "../core/command.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { getRepoContext } from "../core/repo-context.js";
import { getActiveSupabaseWorkdir } from "./worktree-db-command.js";

export async function inspectSupabaseConfig(input: {
  cwd: string;
  projectId: string | undefined;
  render: boolean;
  withAnalytics: boolean;
  isolated: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const resolved = await resolveSupabaseWorkdir(context.worktreePath, {
    isolated: input.isolated,
    withAnalytics: input.withAnalytics,
  });
  const rawTemplate = await fs.readFile(resolved.configPath, "utf8");
  const ports = readSupabasePortsFromConfig(rawTemplate);
  const projectId = input.projectId ?? resolved.projectId ?? `wt_${context.worktreeId}`;

  if (input.render) {
    process.stdout.write(
      renderSupabaseConfig(rawTemplate, {
        projectId,
        ports,
        analyticsEnabled: input.withAnalytics,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        configPath: resolved.configPath,
        workdir: resolved.workdir,
        isolated: input.isolated,
        projectId,
        ports,
        analyticsEnabled: input.withAnalytics,
      },
      null,
      2,
    ),
  );
}

export async function showSupabaseStatus(input: {
  cwd: string;
  envOutput: boolean;
  isolated: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const resolved = input.isolated
    ? await resolveSupabaseWorkdir(context.worktreePath, {
        isolated: true,
        withAnalytics: false,
      })
    : await getActiveSupabaseWorkdir({ cwd: input.cwd });
  const args = buildSupabaseStatusArgs({ workdir: resolved.workdir, envOutput: input.envOutput });

  try {
    const result = await runCapture("npx", args, context.worktreePath);
    process.stdout.write(result.stdout);

    if (result.stderr.length > 0) {
      process.stderr.write(result.stderr);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!isSupabaseStoppedStatusError(message)) {
      throw error;
    }

    if (input.envOutput) {
      throw new Error(
        [
          "Supabase local stack is not running; cannot print env output.",
          `workdir: ${resolved.workdir}`,
          "Start the stack first, then rerun `wt supabase status --env`.",
        ].join("\n"),
      );
    }

    console.log(
      JSON.stringify(
        {
          workdir: resolved.workdir,
          isolated: input.isolated,
          running: false,
          reason: "supabase local stack is not running or has stale local metadata",
          detail: extractSupabaseFailureDetail(message),
        },
        null,
        2,
      ),
    );
  }
}

export async function startSupabase(input: {
  cwd: string;
  withAnalytics: boolean;
  isolated: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const resolved = await resolveSupabaseWorkdir(context.worktreePath, {
    isolated: input.isolated,
    withAnalytics: input.withAnalytics,
  });
  const args = buildSupabaseStartArgs({
    workdir: resolved.workdir,
    withAnalytics: input.withAnalytics,
  });

  await runInherit("npx", args, context.worktreePath);
}

export async function stopSupabase(input: {
  cwd: string;
  isolated: boolean;
  noBackup: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const resolved = await resolveSupabaseWorkdir(context.worktreePath, {
    isolated: input.isolated,
    withAnalytics: false,
  });
  const args = buildSupabaseStopArgs({
    workdir: resolved.workdir,
    noBackup: input.noBackup,
  });

  await runInherit("npx", args, context.worktreePath);
}

export function isSupabaseStoppedStatusError(message: string): boolean {
  return (
    message.includes("No such container: supabase_db_") ||
    message.includes("Cannot connect to the Docker daemon") ||
    message.includes("supabase start") ||
    message.includes("is not running")
  );
}

export function extractSupabaseFailureDetail(message: string): string {
  const stderrIndex = message.indexOf("stderr:\n");

  if (stderrIndex >= 0) {
    return message.slice(stderrIndex + "stderr:\n".length).trim();
  }

  return message.trim();
}

async function resolveSupabaseWorkdir(
  worktreePath: string,
  options: { isolated: boolean; withAnalytics: boolean },
): Promise<{ workdir: string; configPath: string; projectId: string | null }> {
  const context = await getRepoContext(worktreePath, { requireLinkedWorktree: false });
  const { configPath, rawTemplate } = await readSupabaseConfigTemplate(worktreePath);

  if (!options.isolated) {
    return {
      workdir: path.dirname(path.dirname(configPath)),
      configPath,
      projectId: null,
    };
  }

  const materialized = await materializeSupabaseWorkdir({
    sourceSupabaseDir: path.dirname(configPath),
    targetWorkdir: path.join(context.worktreeRuntimeRoot, "supabase-workdir"),
    worktreeId: context.worktreeId,
    rawTemplate,
    withAnalytics: options.withAnalytics,
  });

  return {
    workdir: materialized.workdir,
    configPath: materialized.configPath,
    projectId: materialized.projectId,
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
