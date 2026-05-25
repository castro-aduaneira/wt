import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { runCapture } from "../../core/command.js";
import { pathExists } from "../../core/fs.js";
import { parseSupabaseStatusEnvOutput, requiredSupabaseEnvValue } from "./supabase-env.js";

export interface DatabaseConnectionParts {
  databaseName: string;
  username: string;
  password: string;
}

export interface DockerDbCommandInput extends DatabaseConnectionParts {
  containerName: string;
}

export interface SeedApplyResult {
  applied: boolean;
  seedPath: string;
}

const REQUIRED_STATUS_KEYS = Object.freeze([
  "API_URL",
  "DB_URL",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "PUBLISHABLE_KEY",
  "SECRET_KEY",
]);

export async function getSupabaseStatusEnvMap(workdir: string): Promise<Record<string, string>> {
  const result = await runCapture(
    "npx",
    ["supabase", "status", "-o", "env", "--workdir", workdir],
    workdir,
  );
  const envMap = parseSupabaseStatusEnvOutput(result.stdout);

  for (const key of REQUIRED_STATUS_KEYS) {
    requiredSupabaseEnvValue(envMap, key);
  }

  return envMap;
}

export async function readSupabaseProjectId(workdir: string): Promise<string> {
  const configPath = path.join(workdir, "supabase", "config.toml");
  const raw = await fsp.readFile(configPath, "utf8");
  const match = raw.match(/^\s*project_id\s*=\s*"([^"]+)"\s*(?:#.*)?$/m);

  if (!match?.[1]) {
    throw new Error(`Unable to read project_id from ${configPath}`);
  }

  return match[1];
}

export async function resolveSupabaseDbContainerName(workdir: string): Promise<string> {
  const projectId = await readSupabaseProjectId(workdir);
  const expectedName = `supabase_db_${projectId}`;

  try {
    const inspection = await runCapture(
      "docker",
      ["inspect", "-f", "{{.State.Running}}", expectedName],
      workdir,
    );

    if (inspection.stdout.trim() === "true") {
      return expectedName;
    }
  } catch {
    // Fall through to a stricter error below.
  }

  throw new Error(
    [
      `Unable to resolve running Supabase DB container for project_id=${projectId}.`,
      `Expected container name: ${expectedName}`,
      `Ensure the local stack is running for workdir ${workdir}.`,
    ].join("\n"),
  );
}

export function parseDatabaseConnectionParts(dbUrl: string): DatabaseConnectionParts {
  const parsed = new URL(dbUrl);

  return {
    databaseName: parsed.pathname.replace(/^\//, "") || "postgres",
    username: decodeURIComponent(parsed.username || "postgres"),
    password: decodeURIComponent(parsed.password || "postgres"),
  };
}

export async function dumpDatabaseToFile(input: {
  workdir: string;
  outputPath: string;
}): Promise<void> {
  const envMap = await getSupabaseStatusEnvMap(input.workdir);
  const dbUrl = requiredSupabaseEnvValue(envMap, "DB_URL");
  const containerName = await resolveSupabaseDbContainerName(input.workdir);
  const connection = parseDatabaseConnectionParts(dbUrl);

  await fsp.mkdir(path.dirname(input.outputPath), { recursive: true });
  await pipeCommandToFile({
    outputPath: input.outputPath,
    command: "docker",
    args: buildPgDumpDataOnlyArgs({
      containerName,
      ...connection,
    }),
    cwd: input.workdir,
  });
}

export async function restoreBackupIntoRunningProject(input: {
  workdir: string;
  backupPath: string;
}): Promise<void> {
  const envMap = await getSupabaseStatusEnvMap(input.workdir);
  const dbUrl = requiredSupabaseEnvValue(envMap, "DB_URL");
  const containerName = await resolveSupabaseDbContainerName(input.workdir);
  const connection = parseDatabaseConnectionParts(dbUrl);

  await truncatePublicTables(input.workdir, {
    containerName,
    ...connection,
  });

  await pipeFileToCommand({
    inputPath: input.backupPath,
    command: "docker",
    args: buildPgRestoreDataOnlyArgs({
      containerName,
      ...connection,
    }),
    cwd: input.workdir,
  });
}

export async function applyLocalSeedIntoRunningProject(workdir: string): Promise<SeedApplyResult> {
  const seedPath = path.join(workdir, "supabase", "seed.sql");

  if (!(await pathExists(seedPath))) {
    return { applied: false, seedPath };
  }

  const envMap = await getSupabaseStatusEnvMap(workdir);
  const dbUrl = requiredSupabaseEnvValue(envMap, "DB_URL");
  const containerName = await resolveSupabaseDbContainerName(workdir);
  const connection = parseDatabaseConnectionParts(dbUrl);

  await pipeFileToCommand({
    inputPath: seedPath,
    command: "docker",
    args: buildPsqlFileArgs({
      containerName,
      ...connection,
    }),
    cwd: workdir,
  });

  return { applied: true, seedPath };
}

export async function truncatePublicTables(
  workdir: string,
  input: DockerDbCommandInput,
): Promise<void> {
  await runCapture("docker", buildTruncatePublicTablesArgs(input), workdir);
}

export function buildPgDumpDataOnlyArgs(input: DockerDbCommandInput): string[] {
  return [
    "exec",
    "-e",
    `PGPASSWORD=${input.password}`,
    input.containerName,
    "pg_dump",
    "-h",
    "localhost",
    "-U",
    input.username,
    "-d",
    input.databaseName,
    "-Fc",
    "--data-only",
    "--schema=public",
    "--no-owner",
    "--no-privileges",
  ];
}

export function buildPgRestoreDataOnlyArgs(input: DockerDbCommandInput): string[] {
  return [
    "exec",
    "-i",
    "-e",
    `PGPASSWORD=${input.password}`,
    input.containerName,
    "pg_restore",
    "-h",
    "localhost",
    "-U",
    input.username,
    "-d",
    input.databaseName,
    "--data-only",
    "--schema=public",
    "--no-owner",
    "--no-privileges",
  ];
}

export function buildPsqlFileArgs(input: DockerDbCommandInput): string[] {
  return [
    "exec",
    "-i",
    "-e",
    `PGPASSWORD=${input.password}`,
    input.containerName,
    "psql",
    "-h",
    "localhost",
    "-U",
    input.username,
    "-d",
    input.databaseName,
    "-v",
    "ON_ERROR_STOP=1",
  ];
}

export function buildTruncatePublicTablesArgs(input: DockerDbCommandInput): string[] {
  return [
    "exec",
    "-e",
    `PGPASSWORD=${input.password}`,
    input.containerName,
    "psql",
    "-h",
    "localhost",
    "-U",
    input.username,
    "-d",
    input.databaseName,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    buildTruncatePublicTablesSql(),
  ];
}

export function buildTruncatePublicTablesSql(): string {
  return [
    "do $$",
    "declare truncate_sql text;",
    "begin",
    "  select string_agg(format('truncate table %I.%I restart identity cascade', schemaname, tablename), '; ')",
    "    into truncate_sql",
    "  from pg_tables",
    "  where schemaname = 'public';",
    "  if truncate_sql is not null then",
    "    execute truncate_sql;",
    "  end if;",
    "end",
    "$$;",
  ].join("\n");
}

async function pipeCommandToFile(input: {
  outputPath: string;
  command: string;
  args: string[];
  cwd: string;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(input.outputPath, { flags: "w" });
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
      shell: false,
    });

    child.stdout.pipe(output);
    child.on("error", reject);
    output.on("error", reject);
    child.on("exit", (code) => {
      output.end();

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command exited with code ${code}: ${input.command} ${input.args.join(" ")}`));
    });
  });
}

async function pipeFileToCommand(input: {
  inputPath: string;
  command: string;
  args: string[];
  cwd: string;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const file = fs.createReadStream(input.inputPath);
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "inherit", "inherit"],
      shell: false,
    });

    file.pipe(child.stdin);
    child.on("error", reject);
    file.on("error", reject);
    child.stdin.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command exited with code ${code}: ${input.command} ${input.args.join(" ")}`));
    });
  });
}
