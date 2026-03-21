import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: modelId } = await params;
  const body = await request.json();
  const dep = db.createDeployment({ modelId, providerId: body.providerId, modelName: body.modelName, order: body.order, timeout: body.timeout, maxRetries: body.maxRetries });
  return NextResponse.json(dep, { status: 201 });
}
