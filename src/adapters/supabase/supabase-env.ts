export function parseSupabaseStatusEnvOutput(output: string): Record<string, string> {
  const envMap: Record<string, string> = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("Using workdir ") || line.startsWith("Stopped services:")) {
      continue;
    }

    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (!match?.[1]) {
      continue;
    }

    envMap[match[1]] = stripEnvValueQuotes(match[2]?.trim() ?? "");
  }

  return envMap;
}

export function requiredSupabaseEnvValue(envMap: Record<string, string>, key: string): string {
  const value = envMap[key];

  if (!value) {
    throw new Error(`Missing required value from Supabase status env output: ${key}`);
  }

  return value;
}

function stripEnvValueQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}
