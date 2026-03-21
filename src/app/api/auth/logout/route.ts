import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("gw_session")?.value;
  if (token) destroySession(token);
  cookieStore.delete("gw_session");
  return NextResponse.json({ ok: true });
}
