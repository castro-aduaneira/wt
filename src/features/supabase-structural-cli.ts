import { type Command } from "commander";
import {
  diffEmancipatedSupabase,
  genTypesFromEmancipatedSupabase,
  resetEmancipatedSupabase,
} from "./supabase-structural-command.js";

export function registerSupabaseStructuralCommands(supabase: Command): void {
  supabase
    .command("reset")
    .description("Run Supabase db reset against the current emancipated worktree stack")
    .action(async () => {
      await resetEmancipatedSupabase({ cwd: process.cwd() });
    });

  supabase
    .command("gen-types")
    .description("Run Supabase gen types against the current emancipated worktree stack")
    .option("--lang <lang>", "language passed to `supabase gen types`")
    .option("--schema <schema>", "schema passed to `supabase gen types`")
    .option("--local", "pass --local to `supabase gen types`")
    .option("--linked", "pass --linked to `supabase gen types`")
    .action(async (options: StructuralOptions) => {
      await genTypesFromEmancipatedSupabase({
        cwd: process.cwd(),
        extraArgs: toExtraArgs(options),
      });
    });

  const supabaseDb = supabase.command("db").description("Supabase database structural commands");

  supabaseDb
    .command("diff")
    .description("Run Supabase db diff against the current emancipated worktree stack")
    .option("--schema <schema>", "schema passed to `supabase db diff`")
    .option("--file <file>", "file passed to `supabase db diff`")
    .option("--local", "pass --local to `supabase db diff`")
    .option("--linked", "pass --linked to `supabase db diff`")
    .option("--use-migra", "pass --use-migra to `supabase db diff`")
    .option("--use-pg-schema", "pass --use-pg-schema to `supabase db diff`")
    .option("--use-pg-admin", "pass --use-pg-admin to `supabase db diff`")
    .action(async (options: StructuralOptions) => {
      await diffEmancipatedSupabase({
        cwd: process.cwd(),
        extraArgs: toExtraArgs(options),
      });
    });
}

interface StructuralOptions {
  lang?: string;
  schema?: string;
  file?: string;
  local?: boolean;
  linked?: boolean;
  useMigra?: boolean;
  usePgSchema?: boolean;
  usePgAdmin?: boolean;
}

function toExtraArgs(options: StructuralOptions): string[] {
  const args: string[] = [];

  pushStringOption(args, "--lang", options.lang);
  pushStringOption(args, "--schema", options.schema);
  pushStringOption(args, "--file", options.file);
  pushBooleanOption(args, "--local", options.local);
  pushBooleanOption(args, "--linked", options.linked);
  pushBooleanOption(args, "--use-migra", options.useMigra);
  pushBooleanOption(args, "--use-pg-schema", options.usePgSchema);
  pushBooleanOption(args, "--use-pg-admin", options.usePgAdmin);

  return args;
}

function pushStringOption(args: string[], flag: string, value: string | undefined): void {
  if (value === undefined) {
    return;
  }

  args.push(flag, value);
}

function pushBooleanOption(args: string[], flag: string, enabled: boolean | undefined): void {
  if (enabled !== true) {
    return;
  }

  args.push(flag);
}
