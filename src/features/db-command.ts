import { loadConfig } from "../core/config.js";

export async function dbCommand(
  command: "emancipate" | "rejoin",
  options: { cwd: string; fresh?: boolean },
): Promise<void> {
  const { config } = await loadConfig(options.cwd);

  if (config.supabase?.enabled !== true) {
    throw new Error(
      `Database adapter is disabled. Set "supabase.enabled": true in wt.config.json before running wt db ${command}.`,
    );
  }

  throw new Error(
    [
      `wt db ${command} is reserved for the Supabase adapter implementation.`,
      "Port the Container Tracker worktree-db.mjs behavior into src/adapters/supabase before enabling this command.",
      options.fresh ? "Requested mode: fresh." : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
