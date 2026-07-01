import { NextResponse } from "next/server";
import { getIssues, ConfigError, GitLabError } from "@/lib/gitlab";

// Cache the GitLab round-trip for 60s (see fetch revalidate in lib/gitlab.ts).
export const revalidate = 60;

export async function GET() {
  try {
    // TEMPORARY dev-only mock: active only when MOCK_GITLAB is set (see
    // .env.local + lib/devMock.ts). Lets the calendar render without a live
    // GitLab connection. Remove this branch + lib/devMock.ts once creds exist.
    if (process.env.MOCK_GITLAB) {
      const { mockApiResponse } = await import("@/lib/devMock");
      return NextResponse.json(mockApiResponse());
    }
    return NextResponse.json(await getIssues());
  } catch (e) {
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    if (e instanceof GitLabError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `取得に失敗しました: ${msg}` }, { status: 502 });
  }
}
