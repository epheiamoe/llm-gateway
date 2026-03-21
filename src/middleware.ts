import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Health endpoint - no auth
  if (pathname === "/health" || pathname === "/api/health") return NextResponse.next();

  // Static files and Next.js internals - no auth
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/favico") || pathname.startsWith("/logo") || pathname.startsWith("/llms.txt")) {
    return NextResponse.next();
  }

  // API auth routes - no auth needed
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  // Proxy routes /api/v1/* - use API key auth (handled in the route handler itself)
  if (pathname.startsWith("/api/v1/")) return NextResponse.next();

  // Admin API routes /api/* - check session or admin key
  if (pathname.startsWith("/api/")) {
    const adminKey = process.env.ADMIN_KEY || "";
    if (!adminKey) return NextResponse.next(); // Open mode

    const sessionToken = request.cookies.get("gw_session")?.value;
    // We can't call validateSession here (edge runtime), so we pass through
    // and let the route handler validate. But we can check admin key headers.
    const xKey = request.headers.get("x-admin-key") || "";
    const auth = request.headers.get("authorization") || "";
    const queryKey = request.nextUrl.searchParams.get("admin_key") || "";

    if (sessionToken || xKey === adminKey || auth === `Bearer ${adminKey}` || queryKey === adminKey) {
      return NextResponse.next();
    }

    return NextResponse.json(
      { error: { message: "Unauthorized: admin key required", type: "authentication_error" } },
      { status: 401 }
    );
  }

  // Login page - always accessible
  if (pathname === "/login") return NextResponse.next();

  // UI pages - check if session exists, redirect to login if not
  if (pathname === "/" || pathname.startsWith("/ui")) {
    const sessionToken = request.cookies.get("gw_session")?.value;
    const adminKey = process.env.ADMIN_KEY || "";
    if (!adminKey) return NextResponse.next(); // Open mode
    if (!sessionToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
