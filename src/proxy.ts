import { NextRequest, NextResponse } from "next/server";

// CORS for the APK / Capacitor WebView (origin http://localhost) and any web client.
// The app uses Bearer tokens (no cookies), so a wildcard origin is safe here.
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-User-Id, X-Requested-With",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, ETag",
  "Access-Control-Max-Age": "86400",
};

export function proxy(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
