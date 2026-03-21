import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chain = db.getChain(id);
  return chain ? NextResponse.json(chain) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const chain = db.updateChain(id, {
    name: body.name,
    mode: body.mode,
    items: typeof body.items === "string" ? body.items : (body.items ? JSON.stringify(body.items) : undefined),
    enabled: body.enabled,
  });
  return chain ? NextResponse.json(chain) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.deleteChain(id);
  return NextResponse.json({ ok: true });
}
