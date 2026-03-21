import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET() {
  return NextResponse.json(db.listApiKeys());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const k = db.createApiKey({ name: body.name, allowedModels: body.allowedModels, rateLimit: body.rateLimit });
  return NextResponse.json(k, { status: 201 });
}
