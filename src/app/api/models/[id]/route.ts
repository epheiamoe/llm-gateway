import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = db.getModel(id);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const deployments = db.listDeployments(id);
  return NextResponse.json({ ...(m as any), deployments });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  db.updateModel(id, body.name);
  return NextResponse.json(db.getModel(id));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.deleteModel(id);
  return NextResponse.json({ ok: true });
}
