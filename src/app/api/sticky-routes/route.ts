import { NextResponse } from "next/server";
import { getStickyInfo, clearStickyRoute, setStickyDeployment } from "@/lib/router";

export async function GET() {
  return NextResponse.json(getStickyInfo());
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const model = url.searchParams.get("model") || undefined;
  clearStickyRoute(model);
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.model || !body.deploymentId) {
    return NextResponse.json({ error: "model and deploymentId required" }, { status: 400 });
  }
  setStickyDeployment(body.model, body.deploymentId, body.ttlMs, true);
  return NextResponse.json({ ok: true });
}
