import path from "path";

/**
 * Resolve the absolute path of the SQLite database file from DATABASE_URL.
 * Prisma resolves relative `file:` URLs against the schema directory
 * (`prisma/`), so we mirror that. Returns null for non-SQLite URLs.
 */
export function resolveSqlitePath(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const raw = url.slice("file:".length).split("?")[0] ?? "";
  if (path.isAbsolute(raw)) return raw;
  return path.join(process.cwd(), "prisma", raw);
}
