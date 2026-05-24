import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { CONFIG_FILE_NAME, type CopySeedEntry, type WtConfig, stringifyConfig } from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { getGitTopLevel } from "../core/git.js";

export interface SetupOptions {
  cwd: string;
  yes: boolean;
  force: boolean;
}

export async function setupConfig(options: SetupOptions): Promise<void> {
  const repoRoot = await getGitTopLevel(options.cwd);
  const configPath = path.join(repoRoot, CONFIG_FILE_NAME);

  if ((await pathExists(configPath)) && !options.force) {
    throw new Error(`Refusing to overwrite existing ${CONFIG_FILE_NAME}. Re-run with --force.`);
  }

  const answers = options.yes ? defaultAnswers() : await askSetupQuestions();
  const config = buildConfig(answers);
  const content = stringifyConfig(config);

  await fs.writeFile(configPath, content);
  console.log(`Wrote ${path.relative(repoRoot, configPath)}`);
}

interface SetupAnswers {
  worktreeRoot: string;
  branchPrefix: string;
  copyEnv: boolean;
  runInstallHook: boolean;
  runSubmoduleHook: boolean;
  runDbInitHook: boolean;
  supabaseEnabled: boolean;
  supabaseConfigPath: string;
}

function defaultAnswers(): SetupAnswers {
  return {
    worktreeRoot: "../wt",
    branchPrefix: "feat/",
    copyEnv: true,
    runInstallHook: true,
    runSubmoduleHook: false,
    runDbInitHook: false,
    supabaseEnabled: true,
    supabaseConfigPath: "supabase/config.toml",
  };
}

async function askSetupQuestions(): Promise<SetupAnswers> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("wt setup");
    console.log("This will create wt.config.json in the current Git repository.\n");

    return {
      worktreeRoot: await askText(rl, "Worktree root", "../wt"),
      branchPrefix: await askText(rl, "Branch prefix", "feat/"),
      copyEnv: await askYesNo(rl, "Copy .env into new worktrees", true),
      runInstallHook: await askYesNo(rl, "Run pnpm install after creating/initing worktrees", true),
      runSubmoduleHook: await askYesNo(rl, "Run ralph-loop submodule sync hook", false),
      runDbInitHook: await askYesNo(rl, "Run pnpm db:worktree:init hook", false),
      supabaseEnabled: await askYesNo(rl, "Enable Supabase adapter", true),
      supabaseConfigPath: await askText(rl, "Supabase config path", "supabase/config.toml"),
    };
  } finally {
    rl.close();
  }
}

function buildConfig(answers: SetupAnswers): WtConfig {
  const copy: CopySeedEntry[] = answers.copyEnv
    ? [
        {
          source: ".env",
          target: ".env",
          required: true,
          overwrite: false,
        },
      ]
    : [];

  const hooks: string[] = [];

  if (answers.runInstallHook) {
    hooks.push("pnpm install");
  }

  if (answers.runSubmoduleHook) {
    hooks.push("git submodule sync --recursive -- tools/ralph-loop && git submodule update --init --recursive tools/ralph-loop");
  }

  if (answers.runDbInitHook) {
    hooks.push("pnpm db:worktree:init");
  }

  return {
    worktreeRoot: answers.worktreeRoot,
    branchPrefix: answers.branchPrefix,
    seed: { copy },
    hooks: {
      afterInit: hooks,
      afterNew: hooks,
    },
    supabase: {
      enabled: answers.supabaseEnabled,
      configPath: answers.supabaseConfigPath,
    },
  };
}

async function askText(
  rl: readline.Interface,
  label: string,
  defaultValue: string,
): Promise<string> {
  const answer = await rl.question(`${label} (${defaultValue}): `);
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

async function askYesNo(
  rl: readline.Interface,
  label: string,
  defaultValue: boolean,
): Promise<boolean> {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${label} (${suffix}): `)).trim().toLowerCase();

  if (!answer) {
    return defaultValue;
  }

  if (answer === "y" || answer === "yes") {
    return true;
  }

  if (answer === "n" || answer === "no") {
    return false;
  }

  console.log("Please answer yes or no.");
  return askYesNo(rl, label, defaultValue);
}
