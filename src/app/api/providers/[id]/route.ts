import { NextResponse } from "next/server";
import * as db from "@/lib/db";

function maskProvider(p: any) {
  if (!p) return p;
  return { ...p, apiKey: p.apiKey ? `${p.apiKey.slice(0, 6)}...${p.apiKey.slice(-4)}` : "" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = db.getProvider(id);
  return p ? NextResponse.json(maskProvider(p)) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (body.baseUrl) body.baseUrl = body.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  if (body.apiKey && body.apiKey.includes("...")) delete body.apiKey;
  const p = db.updateProvider(id, body);
  return p ? NextResponse.json(maskProvider(p)) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.deleteProvider(id);
  return NextResponse.json({ ok: true });
}
