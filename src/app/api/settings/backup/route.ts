import { NextResponse } from "next/server";
import fs from "fs/promises";
import { getUserId, unauthorized, badRequest, serverError } from "@/lib/api";
import { resolveSqlitePath } from "@/lib/db-file";

/** GET — download a copy of the SQLite database file. */
export async function GET() {
  if (!(await getUserId())) return unauthorized();
  const dbPath = resolveSqlitePath();
  if (!dbPath) return badRequest("Backup is only supported for SQLite databases");
  try {
    const buffer = await fs.readFile(dbPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="backup-${Date.now()}.db"`,
      },
    });
  } catch {
    return serverError("Could not read database file");
  }
}

/** POST — restore the SQLite database from an uploaded .db file. */
export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const dbPath = resolveSqlitePath();
  if (!dbPath) return badRequest("Restore is only supported for SQLite databases");

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("No file provided");
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Keep a safety copy of the current db before overwriting.
    await fs.copyFile(dbPath, `${dbPath}.pre-restore`).catch(() => undefined);
    await fs.writeFile(dbPath, buffer);
    return NextResponse.json({ ok: true, note: "Restart the app and worker to pick up the restored database." });
  } catch {
    return serverError("Could not restore database file");
  }
}
