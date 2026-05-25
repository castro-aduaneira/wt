#!/usr/bin/env node

import { Command } from "commander";
import { dbCommand, ensureStage, rebuildStage, refreshStageLocalSnapshot, showStageStatus, showWorktreeStatus } from "./features/db-command.js";
import { destroyWorktree } from "./features/destroy-worktree.js";
import { showEnvStatus } from "./features/env-status.js";
import { initWorktree } from "./features/init-worktree.js";
import { migrateConfig } from "./features/migrate-command.js";
import { type NewWorktreeOptions, newWorktree } from "./features/new-worktree.js";
import { setupConfig } from "./features/setup-command.js";
import { inspectSupabaseConfig, showSupabaseStatus, startSupabase, stopSupabase } from "./features/supabase-command.js";

const program = new Command();

program
  .name("wt")
  .description("Reusable Git worktree orchestration CLI")
  .version("0.6.0");

program
  .command("setup")
  .description("Create wt.config.json interactively")
  .option("-y, --yes", "use safe defaults without prompting")
  .option("--force", "overwrite existing wt.config.json")
  .action(async (options: { yes?: boolean; force?: boolean }) => {
    await setupConfig({
      cwd: process.cwd(),
      yes: options.yes === true,
      force: options.force === true,
    });
  });

program
  .command("migrate")
  .description("Migrate legacy .worktree-initialization.toml to wt.config.json")
  .option("--dry-run", "print the generated wt.config.json without writing")
  .option("--force", "overwrite existing wt.config.json")
  .option("--remove-legacy", "remove .worktree-initialization.toml after writing wt.config.json")
  .action(async (options: { dryRun?: boolean; force?: boolean; removeLegacy?: boolean }) => {
    await migrateConfig({
      cwd: process.cwd(),
      dryRun: options.dryRun === true,
      force: options.force === true,
      removeLegacy: options.removeLegacy === true,
    });
  });

program
  .command("init")
  .description("Initialize the current linked worktree from wt.config.json")
  .option("--force-overwrite", "overwrite configured copied files")
  .option("--no-hooks", "skip configured afterInit hooks")
  .action(async (options: { forceOverwrite?: boolean; hooks?: boolean }) => {
    await initWorktree({
      cwd: process.cwd(),
      forceOverwrite: options.forceOverwrite === true,
      runHooks: options.hooks !== false,
    });
  });

program
  .command("new")
  .description("Create and initialize a new worktree")
  .argument("<source>", "task/PRD path or slug")
  .option("--wt-root <path>", "override worktree root")
  .option("--branch-prefix <prefix>", "override branch prefix")
  .option("--slug <slug>", "override inferred slug")
  .option("--no-hooks", "skip configured afterNew hooks")
  .option("--print-only", "print plan without creating the worktree")
  .action(
    async (
      source: string,
      options: {
        wtRoot?: string;
        branchPrefix?: string;
        slug?: string;
        hooks?: boolean;
        printOnly?: boolean;
      },
    ) => {
      const newOptions: NewWorktreeOptions = {
        cwd: process.cwd(),
        source,
        runHooks: options.hooks !== false,
        printOnly: options.printOnly === true,
      };

      if (options.wtRoot !== undefined) {
        newOptions.wtRoot = options.wtRoot;
      }

      if (options.branchPrefix !== undefined) {
        newOptions.branchPrefix = options.branchPrefix;
      }

      if (options.slug !== undefined) {
        newOptions.slug = options.slug;
      }

      await newWorktree(newOptions);
    },
  );

program
  .command("destroy")
  .description("Safely remove the current linked worktree")
  .option("--force", "discard local changes and unpushed commits")
  .action(async (options: { force?: boolean }) => {
    await destroyWorktree({
      cwd: process.cwd(),
      force: options.force === true,
    });
  });

const env = program.command("env").description("Environment commands");

env
  .command("status")
  .description("Print current worktree environment status")
  .action(async () => {
    await showEnvStatus({ cwd: process.cwd() });
  });

const db = program.command("db").description("Database adapter commands");

db
  .command("emancipate")
  .description("Create or attach an isolated database stack for this worktree")
  .option("--fresh", "discard previous isolated stack and create a fresh one")
  .action(async (options: { fresh?: boolean }) => {
    await dbCommand("emancipate", { cwd: process.cwd(), fresh: options.fresh === true });
  });

db
  .command("rejoin")
  .description("Return this worktree to shared staging mode")
  .action(async () => {
    await dbCommand("rejoin", { cwd: process.cwd() });
  });

const worktree = db.command("worktree").description("Worktree database environment commands");

worktree
  .command("status")
  .description("Print current worktree database environment state")
  .action(async () => {
    await showWorktreeStatus({ cwd: process.cwd() });
  });

const stage = db.command("stage").description("Shared staging database commands");

stage
  .command("status")
  .description("Print shared staging definition and status without starting it")
  .action(async () => {
    await showStageStatus({ cwd: process.cwd() });
  });

stage
  .command("ensure")
  .description("Materialize and start the shared staging database if needed")
  .option("--with-analytics", "start analytics instead of using the low-RAM exclude set")
  .action(async (options: { withAnalytics?: boolean }) => {
    await ensureStage({
      cwd: process.cwd(),
      withAnalytics: options.withAnalytics === true,
    });
  });

stage
  .command("refresh-local-snapshot")
  .description("Refresh the shared staging data-only snapshot")
  .option("--with-analytics", "start analytics instead of using the low-RAM exclude set")
  .action(async (options: { withAnalytics?: boolean }) => {
    await refreshStageLocalSnapshot({
      cwd: process.cwd(),
      withAnalytics: options.withAnalytics === true,
    });
  });

stage
  .command("rebuild")
  .description("Rebuild shared staging, restore snapshot if present, apply local seed, and refresh snapshot")
  .option("--with-analytics", "start analytics instead of using the low-RAM exclude set")
  .action(async (options: { withAnalytics?: boolean }) => {
    await rebuildStage({
      cwd: process.cwd(),
      withAnalytics: options.withAnalytics === true,
    });
  });

const supabase = program.command("supabase").description("Supabase adapter commands");

supabase
  .command("config")
  .description("Inspect or render the active Supabase config")
  .option("--project-id <id>", "override rendered project id")
  .option("--render", "print rendered config.toml instead of JSON summary")
  .option("--with-analytics", "render analytics as enabled")
  .option("--isolated", "use the isolated generated Supabase workdir")
  .action(
    async (options: { projectId?: string; render?: boolean; withAnalytics?: boolean; isolated?: boolean }) => {
      await inspectSupabaseConfig({
        cwd: process.cwd(),
        projectId: options.projectId,
        render: options.render === true,
        withAnalytics: options.withAnalytics === true,
        isolated: options.isolated === true,
      });
    },
  );

supabase
  .command("status")
  .description("Run Supabase status for the active local workdir")
  .option("--env", "print Supabase status as env output")
  .option("--isolated", "use the isolated generated Supabase workdir")
  .action(async (options: { env?: boolean; isolated?: boolean }) => {
    await showSupabaseStatus({
      cwd: process.cwd(),
      envOutput: options.env === true,
      isolated: options.isolated === true,
    });
  });

supabase
  .command("start")
  .description("Start the Supabase stack for the active local workdir")
  .option("--with-analytics", "start analytics instead of using the low-RAM exclude set")
  .option("--isolated", "use the isolated generated Supabase workdir")
  .action(async (options: { withAnalytics?: boolean; isolated?: boolean }) => {
    await startSupabase({
      cwd: process.cwd(),
      withAnalytics: options.withAnalytics === true,
      isolated: options.isolated === true,
    });
  });

supabase
  .command("stop")
  .description("Stop the Supabase stack for the active local workdir")
  .option("--isolated", "use the isolated generated Supabase workdir")
  .option("--no-backup", "stop without creating a local backup")
  .action(async (options: { isolated?: boolean; backup?: boolean }) => {
    await stopSupabase({
      cwd: process.cwd(),
      isolated: options.isolated === true,
      noBackup: options.backup === false,
    });
  });

program.parseAsync(normalizeArgv(process.argv)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[wt] ${message}`);
  process.exit(1);
});

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] !== "--") {
    return argv;
  }

  return [argv[0] ?? "node", argv[1] ?? "wt", ...argv.slice(3)];
}
