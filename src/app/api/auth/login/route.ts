import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validatePassword, createSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = body.password ?? "";

  if (!validatePassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = createSession();
  const cookieStore = await cookies();
  cookieStore.set("gw_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 48 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
