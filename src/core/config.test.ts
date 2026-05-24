import { describe, expect, it } from "vitest";
import { mapLegacyConfig, parseLegacyWorktreeInitializationToml } from "./config.js";

const legacyConfig = `[[copy]]
source = ".env"
target = ".env"
required = true
overwrite = false

[[run]]
command = "pnpm install"
required = true

[[run]]
command = "pnpm db:worktree:init"
required = true
`;

describe("config", () => {
  it("parses legacy .worktree-initialization.toml", () => {
    expect(parseLegacyWorktreeInitializationToml(legacyConfig)).toEqual({
      copy: [
        {
          source: ".env",
          target: ".env",
          required: true,
          overwrite: false,
        },
      ],
      run: [
        {
          command: "pnpm install",
          required: true,
        },
        {
          command: "pnpm db:worktree:init",
          required: true,
        },
      ],
    });
  });

  it("maps legacy config to wt seed and hooks", () => {
    const mapped = mapLegacyConfig(parseLegacyWorktreeInitializationToml(legacyConfig));

    expect(mapped.seed?.copy).toEqual([
      {
        source: ".env",
        target: ".env",
        required: true,
        overwrite: false,
      },
    ]);
    expect(mapped.hooks?.afterNew).toEqual(["pnpm install", "pnpm db:worktree:init"]);
  });
});
