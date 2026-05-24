#!/usr/bin/env node

import { Command } from "commander";
import { dbCommand } from "./features/db-command.js";
import { destroyWorktree } from "./features/destroy-worktree.js";
import { showEnvStatus } from "./features/env-status.js";
import { initWorktree } from "./features/init-worktree.js";
import { newWorktree } from "./features/new-worktree.js";

const program = new Command();

program
  .name("wt")
  .description("Reusable Git worktree orchestration CLI")
  .version("0.1.0");

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
      await newWorktree({
        cwd: process.cwd(),
        source,
        wtRoot: options.wtRoot,
        branchPrefix: options.branchPrefix,
        slug: options.slug,
        runHooks: options.hooks !== false,
        printOnly: options.printOnly === true,
      });
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

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[wt] ${message}`);
  process.exit(1);
});
