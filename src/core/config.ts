import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";
import { getGitTopLevel } from "./git.js";

export const CONFIG_FILE_NAME = "wt.config.json";

export interface CopySeedEntry {
  source: string;
  target: string;
  required?: boolean;
  overwrite?: boolean;
}

export interface WtConfig {
  worktreeRoot?: string;
  branchPrefix?: string;
  seed?: {
    copy?: CopySeedEntry[];
  };
  hooks?: {
    afterInit?: string[];
    afterNew?: string[];
  };
  supabase?: {
    enabled?: boolean;
    configPath?: string;
  };
}

export async function loadConfig(cwd: string): Promise<{
  repoRoot: string;
  configPath: string;
  config: WtConfig;
}> {
  const repoRoot = await getGitTopLevel(cwd);
  const configPath = path.join(repoRoot, CONFIG_FILE_NAME);

  if (!(await pathExists(configPath))) {
    return {
      repoRoot,
      configPath,
      config: {},
    };
  }

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as WtConfig;

  return {
    repoRoot,
    configPath,
    config: parsed,
  };
}
