import fs from "node:fs/promises";
import path from "node:path";

export async function withRuntimeLock<T>(input: {
  locksRoot: string;
  fileName: string;
  timeoutMs?: number;
  pollMs?: number;
  operation: () => Promise<T>;
}): Promise<T> {
  await fs.mkdir(input.locksRoot, { recursive: true });

  const lockPath = path.join(input.locksRoot, input.fileName);
  const timeoutMs = input.timeoutMs ?? 120_000;
  const pollMs = input.pollMs ?? 500;
  const startedAt = Date.now();
  let handle: fs.FileHandle | null = null;

  while (!handle) {
    try {
      handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        const reclaimed = await reclaimStaleRuntimeLock(lockPath);

        if (reclaimed) {
          continue;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error(`Timed out waiting for local runtime lock: ${lockPath}`);
        }

        await sleep(pollMs);
        continue;
      }

      throw error;
    }
  }

  try {
    return await input.operation();
  } finally {
    await handle.close();
    await fs.rm(lockPath, { force: true });
  }
}

export async function reclaimStaleRuntimeLock(lockPath: string): Promise<boolean> {
  const pid = await readRuntimeLockHolderPid(lockPath);

  if (pid === null) {
    return false;
  }

  if (isRuntimeLockHolderAlive(pid)) {
    return false;
  }

  await fs.rm(lockPath, { force: true });
  return true;
}

export async function readRuntimeLockHolderPid(lockPath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const firstToken = raw.trim().split(/\s+/, 1)[0];

    if (!firstToken) {
      return null;
    }

    const pid = Number.parseInt(firstToken, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isRuntimeLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error) && error.code === "EPERM";
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
