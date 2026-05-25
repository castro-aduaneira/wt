import { runCapture } from "../../core/command.js";

export const LOW_RAM_SUPABASE_EXCLUDES = ["logflare", "vector"] as const;

export function buildSupabaseStatusArgs(input: {
  workdir: string;
  envOutput: boolean;
}): string[] {
  const args = ["supabase", "status", "--workdir", input.workdir];

  if (input.envOutput) {
    args.push("-o", "env");
  }

  return args;
}

export function buildSupabaseStartArgs(input: {
  workdir: string;
  withAnalytics: boolean;
}): string[] {
  const args = ["supabase", "start", "--workdir", input.workdir];

  if (!input.withAnalytics) {
    args.push("--exclude", LOW_RAM_SUPABASE_EXCLUDES.join(","));
  }

  return args;
}

export function buildSupabaseStopArgs(input: {
  workdir: string;
  noBackup: boolean;
}): string[] {
  const args = ["supabase", "stop", "--workdir", input.workdir];

  if (input.noBackup) {
    args.push("--no-backup");
  }

  return args;
}

export async function purgeSupabaseProjectResources(input: {
  projectId: string;
  cwd: string;
}): Promise<void> {
  await removeDockerResourcesByLabel({
    commandGroup: ["ps", "-aq"],
    removeGroup: ["rm", "-f"],
    cwd: input.cwd,
    projectId: input.projectId,
  });
  await removeDockerResourcesByLabel({
    commandGroup: ["network", "ls", "-q"],
    removeGroup: ["network", "rm"],
    cwd: input.cwd,
    projectId: input.projectId,
  });
  await removeDockerResourcesByLabel({
    commandGroup: ["volume", "ls", "-q"],
    removeGroup: ["volume", "rm", "-f"],
    cwd: input.cwd,
    projectId: input.projectId,
  });
}

async function removeDockerResourcesByLabel(input: {
  commandGroup: string[];
  removeGroup: string[];
  cwd: string;
  projectId: string;
}): Promise<void> {
  const listResult = await runCapture(
    "docker",
    [...input.commandGroup, "--filter", `label=com.supabase.cli.project=${input.projectId}`],
    input.cwd,
  );
  const resourceIds = listResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (resourceIds.length === 0) {
    return;
  }

  await runCapture("docker", [...input.removeGroup, ...resourceIds], input.cwd);
}
