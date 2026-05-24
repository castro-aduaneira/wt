import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runCapture(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const maybe = error as {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };

    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `exit: ${maybe.code ?? "unknown"}`,
        maybe.stdout ? `stdout:\n${maybe.stdout}` : "",
        maybe.stderr ? `stderr:\n${maybe.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

export function runInherit(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command exited with code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

export function runShell(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command exited with code ${code}: ${command}`));
    });
  });
}
