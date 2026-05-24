import fs from "node:fs/promises";
import path from "node:path";
import {
  CONFIG_FILE_NAME,
  LEGACY_CONFIG_FILE_NAME,
  mapLegacyConfig,
  parseLegacyWorktreeInitializationToml,
  stringifyConfig,
} from "../core/config.js";
import { pathExists } from "../core/fs.js";
import { getGitTopLevel } from "../core/git.js";

export interface MigrateOptions {
  cwd: string;
  dryRun: boolean;
  force: boolean;
  removeLegacy: boolean;
}

export async function migrateConfig(options: MigrateOptions): Promise<void> {
  const repoRoot = await getGitTopLevel(options.cwd);
  const configPath = path.join(repoRoot, CONFIG_FILE_NAME);
  const legacyPath = path.join(repoRoot, LEGACY_CONFIG_FILE_NAME);

  if (!(await pathExists(legacyPath))) {
    throw new Error(`Legacy config not found: ${legacyPath}`);
  }

  if ((await pathExists(configPath)) && !options.force) {
    throw new Error(
      `Refusing to overwrite existing ${CONFIG_FILE_NAME}. Re-run with --force to replace it.`,
    );
  }

  const legacyRaw = await fs.readFile(legacyPath, "utf8");
  const nextConfig = mapLegacyConfig(parseLegacyWorktreeInitializationToml(legacyRaw));
  const nextContent = stringifyConfig(nextConfig);

  if (options.dryRun) {
    process.stdout.write(nextContent);
    return;
  }

  await fs.writeFile(configPath, nextContent);

  if (options.removeLegacy) {
    await fs.rm(legacyPath, { force: true });
  }

  console.log(`Wrote ${path.relative(repoRoot, configPath)}`);

  if (options.removeLegacy) {
    console.log(`Removed ${path.relative(repoRoot, legacyPath)}`);
  } else {
    console.log(`Kept legacy config: ${path.relative(repoRoot, legacyPath)}`);
  }
}
