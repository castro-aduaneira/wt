import fs from "node:fs/promises";
import path from "node:path";
import { readSupabasePortsFromConfig, renderSupabaseConfig } from "../adapters/supabase/supabase-config.js";
import { loadConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { getRepoContext } from "../core/repo-context.js";

export async function inspectSupabaseConfig(input: {
  cwd: string;
  projectId?: string;
  render: boolean;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const { config } = await loadConfig(context.worktreePath);
  const configPath = path.resolve(
    context.worktreePath,
    config.supabase?.configPath ?? "supabase/config.toml",
  );

  if (!(await pathExists(configPath))) {
    throw new Error(`Supabase config not found: ${configPath}`);
  }

  const rawTemplate = await fs.readFile(configPath, "utf8");
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
