import fs from "node:fs/promises";
import path from "node:path";
import { readSupabasePortsFromConfig, renderSupabaseConfig } from "../adapters/supabase/supabase-config.js";
import { runCapture } from "../core/command.js";
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
  const { configPath } = await readSupabaseConfigTemplate(context.worktreePath);
  const workdir = path.dirname(path.dirname(configPath));
  const args = ["supabase", "status", "--workdir", workdir];

  if (input.envOutput) {
    args.push("-o", "env");
  }

  const result = await runCapture("npx", args, context.worktreePath);
  process.stdout.write(result.stdout);

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
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
