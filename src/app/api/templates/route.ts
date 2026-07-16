import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, parseBody } from "@/lib/api";

export async function GET(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const type = new URL(request.url).searchParams.get("type");
  const templates = await prisma.template.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["connection_note", "message"]),
  body: z.string().min(1),
});

export async function POST(request: Request) {
  if (!(await getUserId())) return unauthorized();
  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.type === "connection_note" && parsed.data.body.length > 300) {
    return NextResponse.json(
      { error: "Connection notes are limited to 300 characters" },
      { status: 400 },
    );
  }
  const template = await prisma.template.create({ data: parsed.data });
  return NextResponse.json(template, { status: 201 });
}
