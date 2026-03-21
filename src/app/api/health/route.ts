import { NextResponse } from "next/server";

const startedAt = Date.now();

export async function GET() {
  return NextResponse.json({ ok: true, uptimeMs: Date.now() - startedAt });
}
