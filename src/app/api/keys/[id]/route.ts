import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const k = db.updateApiKey(id, body);
  return k ? NextResponse.json(k) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.deleteApiKey(id);
  return NextResponse.json({ ok: true });
}
