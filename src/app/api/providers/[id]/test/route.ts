import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p: any = db.getProvider(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const baseUrl = p.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

    if (p.apiType === "anthropic") {
      headers["x-api-key"] = p.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      const url = `${baseUrl}/v1/messages`;
      const resp = await fetch(url, {
        method: "POST", headers,
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal: AbortSignal.timeout(10000),
      });
      return NextResponse.json({ ok: resp.ok, status: resp.status, message: resp.ok ? "Connection successful" : await resp.text().then(t => t.slice(0, 200)) });
    } else if (p.apiType === "gemini") {
      headers["x-goog-api-key"] = p.apiKey;
      const url = `${baseUrl}/v1beta/models/gemini-3-pro:generateContent`;
      const resp = await fetch(url, {
        method: "POST", headers,
        body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }], role: "user" }] }),
        signal: AbortSignal.timeout(10000),
      });
      return NextResponse.json({ ok: resp.ok, status: resp.status, message: resp.ok ? "Connection successful" : await resp.text().then(t => t.slice(0, 200)) });
    } else if (p.apiType === "openai-responses") {
      headers["Authorization"] = `Bearer ${p.apiKey}`;
      const url = `${baseUrl}/v1/models`;
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      return NextResponse.json({ ok: resp.ok, status: resp.status, message: resp.ok ? "Connection successful" : await resp.text().then(t => t.slice(0, 200)) });
    } else {
      headers["Authorization"] = `Bearer ${p.apiKey}`;
      const url = `${baseUrl}/v1/models`;
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      return NextResponse.json({ ok: resp.ok, status: resp.status, message: resp.ok ? "Connection successful" : await resp.text().then(t => t.slice(0, 200)) });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, status: 0, message: e.message || "Connection failed" });
  }
}
