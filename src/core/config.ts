import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";
import { getGitTopLevel } from "./git.js";

export const CONFIG_FILE_NAME = "wt.config.json";
export const LEGACY_CONFIG_FILE_NAME = ".worktree-initialization.toml";

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

export interface LegacyConfig {
  copy: CopySeedEntry[];
  run: Array<{ command: string; required?: boolean }>;
}

export async function loadConfig(cwd: string): Promise<{
  repoRoot: string;
  configPath: string;
  config: WtConfig;
}> {
  const repoRoot = await getGitTopLevel(cwd);
  const configPath = path.join(repoRoot, CONFIG_FILE_NAME);

  if (await pathExists(configPath)) {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as WtConfig;

    return {
      repoRoot,
      configPath,
      config: parsed,
    };
  }

  const legacyConfigPath = path.join(repoRoot, LEGACY_CONFIG_FILE_NAME);

  if (await pathExists(legacyConfigPath)) {
    const raw = await fs.readFile(legacyConfigPath, "utf8");

    return {
      repoRoot,
      configPath: legacyConfigPath,
      config: mapLegacyConfig(parseLegacyWorktreeInitializationToml(raw)),
    };
  }

  return {
    repoRoot,
    configPath,
    config: {},
  };
}

export function mapLegacyConfig(legacy: LegacyConfig): WtConfig {
  return {
    seed: {
      copy: legacy.copy,
    },
    hooks: {
      afterInit: legacy.run.map((entry) => entry.command),
      afterNew: legacy.run.map((entry) => entry.command),
    },
  };
}

export function stringifyConfig(config: WtConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function parseLegacyWorktreeInitializationToml(input: string): LegacyConfig {
  const result: LegacyConfig = { copy: [], run: [] };
  let currentItem: Record<string, unknown> | null = null;
  let currentArray: "copy" | "run" | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const arrayMatch = line.match(/^\[\[(.+)\]\]$/);

    if (arrayMatch?.[1]) {
      const arrayName = arrayMatch[1].trim();

      if (arrayName !== "copy" && arrayName !== "run") {
        throw new Error(`Unsupported legacy config array: ${arrayName}`);
      }

      currentArray = arrayName;
      currentItem = {};
      result[currentArray].push(currentItem as never);
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);

    if (!kvMatch?.[1] || kvMatch[2] === undefined) {
      throw new Error(`Unsupported legacy config line: ${line}`);
    }

    if (!currentItem || !currentArray) {
      throw new Error(`Legacy config key/value found outside array table: ${line}`);
    }

    currentItem[kvMatch[1]] = parseLegacyTomlValue(kvMatch[2].trim());
  }

  validateLegacyConfig(result);
  return result;
}

function parseLegacyTomlValue(raw: string): string | boolean | number {
  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(["\\nrt])/g, (_match, token: string) => {
      if (token === "n") return "\n";
      if (token === "r") return "\r";
      if (token === "t") return "\t";
      return token;
    });
  }

  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1);
  }

  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }

  throw new Error(`Unsupported legacy config value: ${raw}`);
}

function validateLegacyConfig(config: LegacyConfig): void {
  for (const entry of config.copy) {
    if (!isNonEmptyString(entry.source) || !isNonEmptyString(entry.target)) {
      throw new Error('Legacy [[copy]] entries require non-empty "source" and "target".');
    }
  }

  for (const entry of config.run) {
    if (!isNonEmptyString(entry.command)) {
      throw new Error('Legacy [[run]] entries require non-empty "command".');
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
