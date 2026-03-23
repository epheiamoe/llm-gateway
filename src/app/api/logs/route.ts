import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "100", 10) || 100));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
  const model = searchParams.get("model") || undefined;
  const status = searchParams.get("status") || undefined;
  const provider = searchParams.get("provider") || undefined;

  const logs = db.listLogs(limit, offset, { model, status, provider });
  const total = db.getLogCount();

  return NextResponse.json({ logs, total });
}
