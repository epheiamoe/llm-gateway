import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET() {
  const models = db.listModels() as any[];
  const enriched = models.map(m => ({
    ...m,
    deployments: db.listDeployments(m.id),
  }));
  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const m = db.createModel(body.name);
  return NextResponse.json(m, { status: 201 });
}
