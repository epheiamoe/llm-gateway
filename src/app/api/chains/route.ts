import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET() {
  return NextResponse.json(db.listChains());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const chain = db.createChain({
    name: body.name,
    mode: body.mode || "models",
    items: typeof body.items === "string" ? body.items : JSON.stringify(body.items || []),
  });
  return NextResponse.json(chain, { status: 201 });
}
