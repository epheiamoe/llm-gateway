import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { routeTestDirect, routeTestRequest, PLAYGROUND_TEST_PATH } from "@/lib/router";

export async function POST(request: Request) {
  const body = await request.json();
  const model = body.model;
  const message = body.message || "hi";
  const providerId = body.providerId;
  if (!model) return NextResponse.json({ error: "model is required" }, { status: 400 });

  const testBody = {
    model,
    max_tokens: 20,
    messages: [{ role: "user", content: message }],
  };

  if (providerId) {
    const provider = db.getProvider(providerId);
    if (!provider) return NextResponse.json({ error: "provider not found" }, { status: 404 });
    const trace = await routeTestDirect(model, provider, request.headers, testBody);
    return NextResponse.json(trace);
  }

  const result = await routeTestRequest(model, PLAYGROUND_TEST_PATH, "POST", request.headers, testBody);
  return NextResponse.json(result);
}
