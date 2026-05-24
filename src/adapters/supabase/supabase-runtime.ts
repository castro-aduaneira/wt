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
