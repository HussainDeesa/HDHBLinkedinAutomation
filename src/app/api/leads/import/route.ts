import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, badRequest } from "@/lib/api";
import { parseCsv } from "@/lib/csv";

/**
 * POST /api/leads/import — import leads from CSV.
 * Accepts either a multipart file field "file" or a raw text body.
 * Expected columns (header row, case-insensitive): profileUrl, firstName,
 * lastName, company, title. fullName is derived if absent.
 */
export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();

  let csvText = "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file && file instanceof File) {
      csvText = await file.text();
    } else {
      return badRequest("No file provided");
    }
  } else {
    csvText = await request.text();
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) return badRequest("CSV must have a header row and at least one data row");

  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name.toLowerCase());
  const col = {
    profileUrl: idx("profileurl"),
    firstName: idx("firstname"),
    lastName: idx("lastname"),
    fullName: idx("fullname"),
    company: idx("company"),
    title: idx("title"),
    headline: idx("headline"),
    location: idx("location"),
  };
  if (col.profileUrl === -1) {
    return badRequest("CSV must include a 'profileUrl' column");
  }

  let imported = 0;
  let skipped = 0;
  const get = (row: string[], i: number): string | null =>
    i >= 0 && i < row.length ? (row[i]?.trim() || null) : null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const profileUrl = get(row, col.profileUrl);
    if (!profileUrl || !/linkedin\.com\/in\//i.test(profileUrl)) {
      skipped++;
      continue;
    }
    const firstName = get(row, col.firstName);
    const lastName = get(row, col.lastName);
    const explicitFull = get(row, col.fullName);
    const fullName =
      explicitFull ?? ([firstName, lastName].filter(Boolean).join(" ") || "Unknown");

    const data = {
      profileUrl: profileUrl.split("?")[0] ?? profileUrl,
      fullName,
      firstName,
      lastName,
      company: get(row, col.company),
      title: get(row, col.title),
      headline: get(row, col.headline),
      location: get(row, col.location),
    };

    await prisma.lead.upsert({
      where: { profileUrl: data.profileUrl },
      update: { company: data.company, title: data.title },
      create: data,
    });
    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped });
}
