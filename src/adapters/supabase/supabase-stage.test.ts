import { describe, expect, it } from "vitest";
import {
  buildStageProjectId,
  getStageRuntimePaths,
} from "./supabase-stage.js";

describe("supabase stage", () => {
  it("builds deterministic stage project ids with configurable prefix", () => {
    expect(buildStageProjectId("/repo/main", "ct_stage_")).toMatch(/^ct_stage_[a-f0-9]{8}$/);
    expect(buildStageProjectId("/repo/main", "wt_stage_")).toMatch(/^wt_stage_[a-f0-9]{8}$/);
    expect(buildStageProjectId("/repo/main", "ct_stage_")).not.toBe(
      buildStageProjectId("/repo/other", "ct_stage_"),
    );
  });

  it("resolves stage runtime paths under the configured runtime root", () => {
    expect(getStageRuntimePaths("/repo/.git/ct-local-envs")).toEqual({
      stageRoot: "/repo/.git/ct-local-envs/staging",
      stageProjectWorkdir: "/repo/.git/ct-local-envs/staging/project",
      stageSnapshotPath: "/repo/.git/ct-local-envs/staging/snapshots/staging.dump",
    });
  });
});
