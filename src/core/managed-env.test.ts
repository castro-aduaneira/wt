import { describe, expect, it } from "vitest";
import { removeManagedEnvFileBlock, upsertManagedEnvBlock } from "./managed-env.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseEnv = `SUPABASE_URL=https://prod.example.supabase.co
SUPABASE_ANON_KEY=prod-anon
POSTGRES_URL=postgres://prod
CUSTOM_VALUE=keep-me
`;

describe("managed env", () => {
  it("appends managed values without deleting user assignments", () => {
    const updated = upsertManagedEnvBlock(baseEnv, {
      WT_SUPABASE_ENV_MODE: "emancipated",
      SUPABASE_URL: "http://127.0.0.1:41101",
      SUPABASE_ANON_KEY: "local-anon",
      POSTGRES_URL: "postgres://local",
    });

    expect(updated).toContain("SUPABASE_URL=https://prod.example.supabase.co");
    expect(updated).toContain("SUPABASE_ANON_KEY=prod-anon");
    expect(updated).toContain("POSTGRES_URL=postgres://prod");
    expect(updated).toContain("CUSTOM_VALUE=keep-me");
    expect(updated).toContain("# >>> WT MANAGED ENV >>>");
    expect(updated).toContain('WT_SUPABASE_ENV_MODE="emancipated"');
    expect(updated).toContain('SUPABASE_URL="http://127.0.0.1:41101"');
  });

  it("replaces only the managed block on repeated upsert", () => {
    const first = upsertManagedEnvBlock(baseEnv, {
      WT_SUPABASE_ENV_MODE: "emancipated",
      SUPABASE_URL: "http://127.0.0.1:41101",
    });
    const second = upsertManagedEnvBlock(first, {
      WT_SUPABASE_ENV_MODE: "emancipated",
      SUPABASE_URL: "http://127.0.0.1:42201",
    });

    expect(second).toContain("SUPABASE_URL=https://prod.example.supabase.co");
    expect(second).toContain('SUPABASE_URL="http://127.0.0.1:42201"');
    expect(second).not.toContain('SUPABASE_URL="http://127.0.0.1:41101"');
    expect(second.match(/# >>> WT MANAGED ENV >>>/g)).toHaveLength(1);
  });

  it("removes only the managed block from a file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wt-managed-env-test-"));
    const envPath = path.join(root, ".env");
    const withBlock = upsertManagedEnvBlock(baseEnv, {
      WT_SUPABASE_ENV_MODE: "emancipated",
      SUPABASE_URL: "http://127.0.0.1:41101",
    });

    try {
      await fs.writeFile(envPath, withBlock);
      await removeManagedEnvFileBlock(envPath);

      const cleaned = await fs.readFile(envPath, "utf8");
      expect(cleaned).toBe(baseEnv);
    } finally {
      await fs.rm(root, { force: true, recursive: true });
    }
  });
});
