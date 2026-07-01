import { NextResponse } from "next/server";

// Liveness probe — no GitLab call, safe for Docker HEALTHCHECK.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
