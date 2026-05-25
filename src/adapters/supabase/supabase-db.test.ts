import { describe, expect, it } from "vitest";
import {
  buildPgDumpDataOnlyArgs,
  buildPgRestoreDataOnlyArgs,
  buildPsqlFileArgs,
  buildTruncatePublicTablesArgs,
  buildTruncatePublicTablesSql,
  parseDatabaseConnectionParts,
} from "./supabase-db.js";

const input = {
  containerName: "supabase_db_wt_project",
  databaseName: "postgres",
  username: "postgres",
  password: "postgres",
};

describe("supabase db primitives", () => {
  it("parses DB_URL into docker command connection parts", () => {
    expect(parseDatabaseConnectionParts("postgresql://user%40x:p%40ss@127.0.0.1:41102/appdb")).toEqual({
      databaseName: "appdb",
      username: "user@x",
      password: "p@ss",
    });
  });

  it("builds data-only public pg_dump args", () => {
    expect(buildPgDumpDataOnlyArgs(input)).toEqual([
      "exec",
      "-e",
      "PGPASSWORD=postgres",
      "supabase_db_wt_project",
      "pg_dump",
      "-h",
      "localhost",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Fc",
      "--data-only",
      "--schema=public",
      "--no-owner",
      "--no-privileges",
    ]);
  });

  it("builds data-only public pg_restore args", () => {
    expect(buildPgRestoreDataOnlyArgs(input)).toEqual([
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=postgres",
      "supabase_db_wt_project",
      "pg_restore",
      "-h",
      "localhost",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--data-only",
      "--schema=public",
      "--no-owner",
      "--no-privileges",
    ]);
  });

  it("builds psql args for applying seed.sql with ON_ERROR_STOP", () => {
    expect(buildPsqlFileArgs(input)).toEqual([
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=postgres",
      "supabase_db_wt_project",
      "psql",
      "-h",
      "localhost",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
  });

  it("builds truncate public tables args", () => {
    const args = buildTruncatePublicTablesArgs(input);

    expect(args.slice(0, 13)).toEqual([
      "exec",
      "-e",
      "PGPASSWORD=postgres",
      "supabase_db_wt_project",
      "psql",
      "-h",
      "localhost",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    expect(args[13]).toBe("-c");
    expect(args[14]).toBe(buildTruncatePublicTablesSql());
  });

  it("keeps truncate operation public-only and restart identity cascade", () => {
    const sql = buildTruncatePublicTablesSql();

    expect(sql).toContain("where schemaname = 'public'");
    expect(sql).toContain("truncate table %I.%I restart identity cascade");
  });
});
