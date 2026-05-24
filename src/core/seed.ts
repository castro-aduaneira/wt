import path from "node:path";
import { type CopySeedEntry } from "./config.js";
import { copyFileEnsuringDir, ensurePathInsideRoot, pathExists } from "./fs.js";
import { log, warn } from "./logger.js";

export async function copySeedFiles(input: {
  entries: CopySeedEntry[];
  sourceRoot: string;
  targetRoot: string;
  forceOverwrite: boolean;
}): Promise<void> {
  for (const entry of input.entries) {
    validateCopySeedEntry(entry);

    const sourcePath = path.resolve(input.sourceRoot, entry.source);
    const targetPath = path.resolve(input.targetRoot, entry.target);
    const required = entry.required !== false;
    const overwrite = input.forceOverwrite || entry.overwrite === true;

    ensurePathInsideRoot(input.sourceRoot, sourcePath, "source");
    ensurePathInsideRoot(input.targetRoot, targetPath, "target");

    if (!(await pathExists(sourcePath))) {
      if (required) {
        throw new Error(`Required seed source does not exist: ${sourcePath}`);
      }

      warn(`seed skip missing optional source: ${entry.source}`);
      continue;
    }

    if ((await pathExists(targetPath)) && !overwrite) {
      log(`seed skip existing target: ${entry.target}`);
      continue;
    }

    await copyFileEnsuringDir(sourcePath, targetPath);
    log(`seed copied ${entry.source} -> ${entry.target}`);
  }
}

function validateCopySeedEntry(entry: CopySeedEntry): void {
  if (!entry.source || !entry.target) {
    throw new Error("seed.copy entries require non-empty source and target.");
  }
}
