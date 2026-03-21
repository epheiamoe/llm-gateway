import { NextResponse } from "next/server";
import * as db from "@/lib/db";

function maskProvider(p: any) {
  if (!p) return p;
  return { ...p, apiKey: p.apiKey ? `${p.apiKey.slice(0, 6)}...${p.apiKey.slice(-4)}` : "" };
}

export async function GET() {
  return NextResponse.json((db.listProviders() as any[]).map(maskProvider));
}

export async function POST(request: Request) {
  const body = await request.json();
  const baseUrl = (body.baseUrl || "").replace(/\/+$/, "").replace(/\/v1$/, "");
  const p = db.createProvider({ name: body.name, baseUrl, apiKey: body.apiKey || "", apiType: body.apiType || "openai" });
  return NextResponse.json(maskProvider(p), { status: 201 });
}
