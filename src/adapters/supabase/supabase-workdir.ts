import fs from "node:fs/promises";
import path from "node:path";
import { hashString } from "../../core/identity.js";
import { renderSupabaseConfig, type SupabasePorts } from "./supabase-config.js";

const EXCLUDED_NAMES = new Set(["config.toml", ".temp", ".branches"]);
const DEV_PORT_BASE_MIN = 40000;
const DEV_PORT_BASE_MAX = 64980;
const DEV_PORT_BLOCK_SIZE = 20;

const DEV_PORT_OFFSETS = Object.freeze({
  shadow: 0,
  api: 1,
  db: 2,
  studio: 3,
  inbucket: 4,
  analytics: 7,
  pooler: 9,
});

export interface MaterializedSupabaseWorkdir {
  projectId: string;
  workdir: string;
  configPath: string;
  ports: SupabasePorts;
}

export async function materializeSupabaseWorkdir(input: {
  sourceSupabaseDir: string;
  targetWorkdir: string;
  worktreeId: string;
  rawTemplate: string;
  withAnalytics: boolean;
}): Promise<MaterializedSupabaseWorkdir> {
  const projectId = `wt_${input.worktreeId}`;
  const ports = allocateSupabasePorts(projectId);
  const targetSupabaseDir = path.join(input.targetWorkdir, "supabase");
  const configPath = path.join(targetSupabaseDir, "config.toml");

  await fs.mkdir(targetSupabaseDir, { recursive: true });
  await copySupabaseDirectory(input.sourceSupabaseDir, targetSupabaseDir);
  await fs.mkdir(path.join(targetSupabaseDir, ".temp"), { recursive: true });

  await fs.writeFile(
    configPath,
    renderSupabaseConfig(input.rawTemplate, {
      projectId,
      ports,
      analyticsEnabled: input.withAnalytics,
    }),
  );

  return { projectId, workdir: input.targetWorkdir, configPath, ports };
}

export function allocateSupabasePorts(projectId: string): SupabasePorts {
  const slotCount = Math.floor((DEV_PORT_BASE_MAX - DEV_PORT_BASE_MIN) / DEV_PORT_BLOCK_SIZE) + 1;
  const slotIndex = Number.parseInt(hashString(projectId, 6), 16) % slotCount;
  return buildPortMap(DEV_PORT_BASE_MIN + slotIndex * DEV_PORT_BLOCK_SIZE);
}

export function buildPortMap(basePort: number): SupabasePorts {
  return {
    shadow: basePort + DEV_PORT_OFFSETS.shadow,
    api: basePort + DEV_PORT_OFFSETS.api,
    db: basePort + DEV_PORT_OFFSETS.db,
    studio: basePort + DEV_PORT_OFFSETS.studio,
    inbucket: basePort + DEV_PORT_OFFSETS.inbucket,
    analytics: basePort + DEV_PORT_OFFSETS.analytics,
    pooler: basePort + DEV_PORT_OFFSETS.pooler,
  };
}

async function copySupabaseDirectory(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_NAMES.has(entry.name)) {
      continue;
    }

    await fs.cp(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), {
      force: true,
      recursive: true,
    });
  }
}
