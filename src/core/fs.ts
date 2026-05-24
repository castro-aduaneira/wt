import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function ensurePathInsideRoot(rootPath: string, candidatePath: string, label: string): void {
  const relative = path.relative(rootPath, candidatePath);

  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Resolved ${label} path escapes root: ${candidatePath}`);
  }
}

export async function copyFileEnsuringDir(sourcePath: string, targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}
