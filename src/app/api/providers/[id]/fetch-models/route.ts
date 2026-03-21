import { NextResponse } from "next/server";
import { getProvider } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p: any = getProvider(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const baseUrl = (p.baseUrl || "").replace(/\/+$/, "").replace(/\/v1$/, "");
    const headers: Record<string, string> = {};

    if (p.apiType === "anthropic") {
      headers["x-api-key"] = p.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (p.apiType === "gemini") {
      headers["x-goog-api-key"] = p.apiKey;
    } else {
      headers["Authorization"] = `Bearer ${p.apiKey}`;
    }

    const url = `${baseUrl}/v1/models`;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return NextResponse.json({ error: `HTTP ${resp.status}`, models: [] });
    const data: any = await resp.json();
    const models = (data.data || data.models || []).map((m: any) => m.id || m.name);
    return NextResponse.json({ models });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, models: [] });
  }
}
