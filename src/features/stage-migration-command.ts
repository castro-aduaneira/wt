import { dumpDatabaseToFile } from "../adapters/supabase/supabase-db.js";
import { ensureStageEnvironment, type RunningStageEnvironment } from "../adapters/supabase/supabase-stage.js";
import { runInherit } from "../core/command.js";
import { getRepoContext, type RepoContext } from "../core/repo-context.js";

export async function ensureStageMigrationsCurrent(input: {
  cwd: string;
  withAnalytics: boolean;
}): Promise<void> {
  const context = await getRepoContext(input.cwd, { requireLinkedWorktree: false });
  const stage = await ensureStageEnvironment(context, { withAnalytics: input.withAnalytics });

  await migrateStage(context, stage);
  await dumpDatabaseToFile({
    workdir: stage.workdir,
    outputPath: stage.snapshotPath,
  });

  console.log(`shared staging migrations ensured and snapshot refreshed: ${stage.snapshotPath}`);
}

export async function migrateStage(context: RepoContext, stage: RunningStageEnvironment): Promise<void> {
  await runInherit(
    "npx",
    ["supabase", "migration", "up", "--workdir", stage.workdir, "--local", "--include-all"],
    context.repoRoot,
  );
}
