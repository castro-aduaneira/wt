import { describe, expect, it } from "vitest";
import { slugify } from "./identity.js";

describe("slugify", () => {
  it("normalizes text into a filesystem-safe slug", () => {
    expect(slugify("Minha Feature Nova")).toBe("minha-feature-nova");
  });

  it("removes accents", () => {
    expect(slugify("Emancipação Supabase")).toBe("emancipacao-supabase");
  });
});
