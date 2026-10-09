import { NextResponse } from "next/server";

// Root URL: JSON info only (this project is an API server, not a website).
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    service: "sweetforge-server",
    status: "ok",
    endpoints: ["/api/health", "/api/auth/*", "/api/me/*", "/api/v1/*", "/api/ads/*", "/api/games"],
  });
}
