import { randomUUID } from "crypto";

const SESSION_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

interface Session {
  token: string;
  expiresAt: number;
}

// In-memory session store (single-process)
const sessions = new Map<string, Session>();

export function getAdminKey(): string {
  return process.env.ADMIN_KEY || "";
}

export function validatePassword(password: string): boolean {
  const adminKey = getAdminKey();
  if (!adminKey) return true; // No admin key = any password works
  return password === adminKey;
}

export function createSession(): string {
  const token = randomUUID();
  sessions.set(token, { token, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function validateSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function isAuthenticated(request: Request, cookies?: { get(name: string): { value: string } | undefined }): boolean {
  const adminKey = getAdminKey();

  // Check session cookie
  const sessionToken = cookies?.get("gw_session")?.value;
  if (sessionToken && validateSession(sessionToken)) return true;

  // Check x-admin-key header
  const xKey = request.headers.get("x-admin-key") || "";
  if (adminKey && xKey === adminKey) return true;

  // Check Authorization header
  const auth = request.headers.get("authorization") || "";
  if (adminKey && auth === `Bearer ${adminKey}`) return true;

  // Check query param
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("admin_key") || "";
  if (adminKey && queryKey === adminKey) return true;

  // No admin key configured = open mode
  if (!adminKey) return true;

  return false;
}
