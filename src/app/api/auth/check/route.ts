import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateSession, getAdminKey } from "@/lib/auth";

export async function GET() {
  const adminKey = getAdminKey();
  if (!adminKey) return NextResponse.json({ authenticated: true });

  const cookieStore = await cookies();
  const token = cookieStore.get("gw_session")?.value;
  if (token && validateSession(token)) {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false });
}
