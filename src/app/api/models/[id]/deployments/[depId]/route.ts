import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; depId: string }> }) {
  const { depId } = await params;
  const body = await request.json();
  const dep = db.updateDeployment(depId, body);
  return dep ? NextResponse.json(dep) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; depId: string }> }) {
  const { depId } = await params;
  db.deleteDeployment(depId);
  return NextResponse.json({ ok: true });
}
