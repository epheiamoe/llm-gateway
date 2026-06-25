import { NextResponse } from "next/server";
import { getApiKeyByKey, incrementApiKeyUsage, listApiKeys, listModels } from "@/lib/db";
import { getStoredResponseModel, routeRequest, routeRetrieveResponse } from "@/lib/router";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function apiKeyAuth(request: Request): Response | null {
  const keys = listApiKeys() as any[];
  if (keys.length === 0) return null; // Open mode

  let apiKey = "";
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer gw-")) {
    apiKey = authHeader.replace("Bearer ", "");
  }
  const xApiKey = request.headers.get("x-api-key") || "";
  if (xApiKey.startsWith("gw-")) {
    apiKey = xApiKey;
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: { message: "API key required. Use 'Authorization: Bearer gw-...' or 'x-api-key: gw-...'", type: "authentication_error" } },
      { status: 401 }
    );
  }

  const keyRecord: any = getApiKeyByKey(apiKey);
  if (!keyRecord) {
    return NextResponse.json({ error: { message: "Invalid API key", type: "authentication_error" } }, { status: 401 });
  }
  if (!keyRecord.enabled) {
    return NextResponse.json({ error: { message: "API key disabled", type: "authentication_error" } }, { status: 403 });
  }

  incrementApiKeyUsage(keyRecord.id);
  return null;
}

function checkAllowedModels(request: Request, requestModel: string): Response | null {
  const keys = listApiKeys() as any[];
  if (keys.length === 0) return null;

  let apiKey = "";
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer gw-")) apiKey = authHeader.replace("Bearer ", "");
  const xApiKey = request.headers.get("x-api-key") || "";
  if (xApiKey.startsWith("gw-")) apiKey = xApiKey;
  if (!apiKey) return null;

  const keyRecord: any = getApiKeyByKey(apiKey);
  if (!keyRecord?.allowedModels) return null;

  const allowed = keyRecord.allowedModels.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(requestModel)) {
    return NextResponse.json(
      { error: { message: `Model "${requestModel}" not allowed for this API key`, type: "authentication_error" } },
      { status: 403 }
    );
  }
  return null;
}

async function handleRequest(request: Request, pathSegments: string[]): Promise<Response> {
  // Auth check
  const authError = apiKeyAuth(request);
  if (authError) return authError;

  const subPath = pathSegments.join("/");
  const fullPath = `/v1/${subPath}`;

  // GET /v1/models
  if (request.method === "GET" && subPath === "models") {
    const dbModels = listModels().map((m: any) => ({
      id: m.name,
      object: "model",
      created: Math.floor(m.createdAt / 1000),
      owned_by: "llm-gateway",
    }));
    // Optional pass-through models for providers like OpenCode GO where the gateway
    // routes by a fallback model but still needs to advertise the real model IDs.
    const passThrough = process.env.OPENCODE_GO_MODELS
      ? process.env.OPENCODE_GO_MODELS.split(",").map(s => s.trim()).filter(Boolean).map(name => ({
          id: name,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "opencode-go",
        }))
      : [];
    const seen = new Set<string>();
    const data = [...dbModels, ...passThrough].filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return NextResponse.json({ object: "list", data });
  }

  // GET /v1/responses/:id - retrieve response
  if (request.method === "GET" && subPath.startsWith("responses/")) {
    const responseId = subPath.replace("responses/", "");
    const modelCheck = getStoredResponseModel(responseId);
    if (modelCheck) {
      const modelError = checkAllowedModels(request, modelCheck);
      if (modelError) return modelError;
    }
    return routeRetrieveResponse(responseId);
  }

  // POST /v1/chat/completions
  if (request.method === "POST" && subPath === "chat/completions") {
    const body = await request.json();
    const modelName = body.model;
    if (!modelName) {
      return NextResponse.json({ error: { message: "model is required", type: "invalid_request_error" } }, { status: 400 });
    }
    const modelError = checkAllowedModels(request, modelName);
    if (modelError) return modelError;
    const isStreaming = body.stream === true;
    return routeRequest(modelName, "/v1/chat/completions", "POST", request.headers, body, isStreaming);
  }

  // POST /v1/responses
  if (request.method === "POST" && subPath === "responses") {
    const body = await request.json();
    const modelName = body.model;
    if (!modelName) {
      return NextResponse.json({ error: { message: "model is required", type: "invalid_request_error" } }, { status: 400 });
    }
    const modelError = checkAllowedModels(request, modelName);
    if (modelError) return modelError;
    const isStreaming = body.stream === true;
    return routeRequest(modelName, "/v1/responses", "POST", request.headers, body, isStreaming);
  }

  // POST /v1/messages (Anthropic-compatible)
  if (request.method === "POST" && subPath === "messages") {
    const body = await request.json();
    const modelName = body.model;
    if (!modelName) {
      return NextResponse.json({ error: { message: "model is required", type: "invalid_request_error" } }, { status: 400 });
    }
    const modelError = checkAllowedModels(request, modelName);
    if (modelError) return modelError;
    const isStreaming = body.stream === true;
    return routeRequest(modelName, "/v1/messages", "POST", request.headers, body, isStreaming);
  }

  // POST /v1/embeddings
  if (request.method === "POST" && subPath === "embeddings") {
    const body = await request.json();
    const modelName = body.model;
    if (!modelName) {
      return NextResponse.json({ error: { message: "model is required", type: "invalid_request_error" } }, { status: 400 });
    }
    const modelError = checkAllowedModels(request, modelName);
    if (modelError) return modelError;
    return routeRequest(modelName, "/v1/embeddings", "POST", request.headers, body, false);
  }

  // POST /v1/rerank or /v1/re-rank
  if (request.method === "POST" && (subPath === "rerank" || subPath === "re-rank")) {
    const body = await request.json();
    const modelName = body.model;
    if (!modelName) {
      return NextResponse.json({ error: { message: "model is required", type: "invalid_request_error" } }, { status: 400 });
    }
    const modelError = checkAllowedModels(request, modelName);
    if (modelError) return modelError;
    return routeRequest(modelName, `/v1/${subPath}`, "POST", request.headers, body, false);
  }

  // Gemini native API: /v1/models/<model>:<action> and /v1beta/models/<model>:<action>
  const geminiMatch = subPath.match(/^(?:models|beta\/models)\/([^:]+):(\w+)$/);
  if (request.method === "POST" && geminiMatch) {
    const modelName = geminiMatch[1]!;
    const action = geminiMatch[2]!;
    const body = await request.json();
    const isStreaming = action === "streamGenerateContent";
    return routeRequest(modelName, `/v1beta/models/${modelName}:${action}`, "POST", request.headers, body, isStreaming);
  }

  return NextResponse.json(
    { error: { message: `Unknown proxy path: ${fullPath}`, type: "invalid_request_error" } },
    { status: 404 }
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleRequest(request, path);
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleRequest(request, path);
}
