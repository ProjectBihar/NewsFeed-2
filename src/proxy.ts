import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuthorized, unauthorizedResponse } from "./lib/admin/auth";

export async function proxy(request: NextRequest) {
  const authorized = await isAuthorized(
    request.headers.get("authorization"),
    process.env as Record<string, string | undefined>
  );
  if (!authorized) return unauthorizedResponse();
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
