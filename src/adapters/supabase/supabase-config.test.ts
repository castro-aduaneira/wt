import { describe, expect, it } from "vitest";
import {
  readSupabasePortsFromConfig,
  renderSupabaseConfig,
} from "./supabase-config.js";

const template = `project_id = "old_project"

[api]
port = 54321

[db]
port = 54322
shadow_port = 54320

[db.pooler]
port = 54329

[studio]
port = 54323

[inbucket]
port = 54324

[analytics]
enabled = true
port = 54327
`;

describe("supabase config", () => {
  it("reads known Supabase local ports", () => {
    expect(readSupabasePortsFromConfig(template)).toEqual({
      api: 54321,
      db: 54322,
      shadow: 54320,
      studio: 54323,
      inbucket: 54324,
      analytics: 54327,
      pooler: 54329,
    });
  });

  it("renders project id, ports, and analytics mode", () => {
    const rendered = renderSupabaseConfig(template, {
      projectId: "wt_test_project",
      analyticsEnabled: false,
      ports: {
        shadow: 40000,
        api: 40001,
        db: 40002,
        studio: 40003,
        inbucket: 40004,
        analytics: 40007,
        pooler: 40009,
      },
    });

    expect(rendered).toContain('project_id = "wt_test_project"');
    expect(rendered).toContain("[api]\nport = 40001");
    expect(rendered).toContain("[db]\nport = 40002\nshadow_port = 40000");
    expect(rendered).toContain("[db.pooler]\nport = 40009");
    expect(rendered).toContain("[studio]\nport = 40003");
    expect(rendered).toContain("[inbucket]\nport = 40004");
    expect(rendered).toContain("[analytics]\nenabled = false\nport = 40007");
  });
});
