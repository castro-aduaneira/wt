import fs from "node:fs/promises";
import path from "node:path";
import { readSupabasePortsFromConfig, renderSupabaseConfig } from "../adapters/supabase/supabase-config.js";
import { buildSupabaseStartArgs, buildSupabaseStatusArgs } from "../adapters/supabase/supabase-runtime.js";
import { runCapture, runInherit } from "../core/command.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { getRepoContext } from "../core/repo-context.js";

export async function inspectSupabaseConfig(input: {
  cwd: string;
  projectId: string | undefined;
  render: boolean;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const { configPath, rawTemplate } = await readSupabaseConfigTemplate(context.worktreePath);
  const ports = readSupabasePortsFromConfig(rawTemplate);
  const projectId = input.projectId ?? `wt_${context.worktreeId}`;

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
        configPath,
        projectId,
        ports,
        analyticsEnabled: input.withAnalytics,
      },
      null,
      2,
    ),
  );
}

export async function showSupabaseStatus(input: { cwd: string; envOutput: boolean }): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const workdir = await resolveSupabaseWorkdir(context.worktreePath);
  const args = buildSupabaseStatusArgs({ workdir, envOutput: input.envOutput });

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
          `workdir: ${workdir}`,
          "Start the stack first, then rerun `wt supabase status --env`.",
        ].join("\n"),
      );
    }

    console.log(
      JSON.stringify(
        {
          workdir,
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
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const workdir = await resolveSupabaseWorkdir(context.worktreePath);
  const args = buildSupabaseStartArgs({
    workdir,
    withAnalytics: input.withAnalytics,
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

async function resolveSupabaseWorkdir(worktreePath: string): Promise<string> {
  const { configPath } = await readSupabaseConfigTemplate(worktreePath);
  return path.dirname(path.dirname(configPath));
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
