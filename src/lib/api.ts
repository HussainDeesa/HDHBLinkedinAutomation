import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { authOptions } from "@/lib/auth";

/** Ensure there is an authenticated session; returns the user id or null. */
export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ?? null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "Internal error"): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Parse + validate a request body against a Zod schema. Returns either the
 * validated data or a 400 response describing the validation errors.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: badRequest("Invalid JSON body") };
  }
  try {
    return { data: schema.parse(json) };
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: badRequest("Validation failed", err.flatten()) };
    }
    return { error: badRequest("Validation failed") };
  }
}
