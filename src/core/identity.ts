import crypto from "node:crypto";
import path from "node:path";

export function hashString(value: string, length: number): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function slugify(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error(`Could not derive a valid slug from: ${value}`);
  }

  return normalized;
}

export function inferSlugFromSource(source: string): string {
  const basename = path.basename(source);
  const stem = basename.replace(/\.[^.]+$/, "");
  return slugify(stem);
}

export function buildWorktreeId(worktreePath: string): string {
  const sanitized = slugify(path.basename(path.resolve(worktreePath))).replace(/-/g, "_");
  return `${sanitized}_${hashString(path.resolve(worktreePath), 8)}`;
}
