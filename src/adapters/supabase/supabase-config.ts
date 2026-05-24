export interface SupabasePorts {
  shadow: number;
  api: number;
  db: number;
  studio: number;
  inbucket: number;
  analytics: number;
  pooler: number;
}

export interface RenderSupabaseConfigInput {
  projectId: string;
  ports: SupabasePorts;
  analyticsEnabled?: boolean;
}

export function renderSupabaseConfig(
  rawTemplate: string,
  input: RenderSupabaseConfigInput,
): string {
  let rendered = rawTemplate;

  rendered = replaceTomlAssignment(rendered, null, "project_id", `"${input.projectId}"`);
  rendered = replaceTomlAssignment(rendered, "api", "port", String(input.ports.api));
  rendered = replaceTomlAssignment(rendered, "db", "port", String(input.ports.db));
  rendered = replaceTomlAssignment(rendered, "db", "shadow_port", String(input.ports.shadow));

  if (rawTemplate.includes("[db.pooler]")) {
    rendered = replaceTomlAssignment(rendered, "db.pooler", "port", String(input.ports.pooler));
  }

  if (rawTemplate.includes("[studio]")) {
    rendered = replaceTomlAssignment(rendered, "studio", "port", String(input.ports.studio));
  }

  if (rawTemplate.includes("[inbucket]")) {
    rendered = replaceTomlAssignment(rendered, "inbucket", "port", String(input.ports.inbucket));
  }

  if (rawTemplate.includes("[analytics]")) {
    if (typeof input.analyticsEnabled === "boolean") {
      rendered = replaceTomlAssignment(
        rendered,
        "analytics",
        "enabled",
        input.analyticsEnabled ? "true" : "false",
      );
    }

    rendered = replaceTomlAssignment(rendered, "analytics", "port", String(input.ports.analytics));
  }

  return rendered;
}

export function readSupabasePortsFromConfig(rawTemplate: string): SupabasePorts {
  return {
    api: readTomlAssignmentNumber(rawTemplate, "api", "port"),
    db: readTomlAssignmentNumber(rawTemplate, "db", "port"),
    shadow: readTomlAssignmentNumber(rawTemplate, "db", "shadow_port"),
    studio: readTomlAssignmentNumber(rawTemplate, "studio", "port"),
    inbucket: readTomlAssignmentNumber(rawTemplate, "inbucket", "port"),
    analytics: rawTemplate.includes("[analytics]")
      ? readTomlAssignmentNumber(rawTemplate, "analytics", "port")
      : 40007,
    pooler: rawTemplate.includes("[db.pooler]")
      ? readTomlAssignmentNumber(rawTemplate, "db.pooler", "port")
      : 40009,
  };
}

export function replaceTomlAssignment(
  rawTemplate: string,
  sectionName: string | null,
  key: string,
  value: string,
): string {
  const lines = rawTemplate.split(/\r?\n/);
  let activeSection: string | null = null;
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const sectionMatch = line.match(/^\s*\[([^\]]+)]\s*$/);

    if (sectionMatch?.[1]) {
      activeSection = sectionMatch[1];
      continue;
    }

    const isTargetSection =
      sectionName === null ? activeSection === null : activeSection === sectionName;

    if (!isTargetSection) {
      continue;
    }

    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(line)) {
      lines[index] = `${key} = ${value}`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    throw new Error(`Unable to replace TOML assignment ${sectionName ?? "<root>"}.${key}`);
  }

  return `${lines.join("\n")}${rawTemplate.endsWith("\n") ? "\n" : ""}`.replace(/\n\n$/u, "\n");
}

export function readTomlAssignmentNumber(
  rawTemplate: string,
  sectionName: string,
  key: string,
): number {
  const lines = rawTemplate.split(/\r?\n/);
  let activeSection: string | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)]\s*$/);

    if (sectionMatch?.[1]) {
      activeSection = sectionMatch[1];
      continue;
    }

    if (activeSection !== sectionName) {
      continue;
    }

    const match = line.match(
      new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`),
    );

    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  throw new Error(`Unable to read TOML assignment ${sectionName}.${key}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
