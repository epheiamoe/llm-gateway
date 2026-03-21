import { NextResponse } from "next/server";
import { getModelTimeline } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hours = parseInt(url.searchParams.get("hours") || "24");
  return NextResponse.json(getModelTimeline(hours));
}
