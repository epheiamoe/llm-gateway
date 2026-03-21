import { NextResponse } from "next/server";
import { getCooldownInfo } from "@/lib/router";

export async function GET() {
  return NextResponse.json(getCooldownInfo());
}
