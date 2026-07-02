import { NextResponse } from "next/server";
import { getIssues, ConfigError, GitLabError } from "@/lib/gitlab";

// GitLab round-trips are cached by the module TTL cache inside getIssues();
// the route itself stays dynamic. no-store keeps the polling client's browser
// from layering its own heuristic cache on top.
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  try {
    // TEMPORARY dev-only mock: active only when MOCK_GITLAB is set (see
    // .env.local + lib/devMock.ts). Lets the calendar render without a live
    // GitLab connection. Remove this branch + lib/devMock.ts once creds exist.
    if (process.env.MOCK_GITLAB) {
      const { mockApiResponse } = await import("@/lib/devMock");
      return NextResponse.json(mockApiResponse(), NO_STORE);
    }
    return NextResponse.json(await getIssues(), NO_STORE);
  } catch (e) {
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.message }, { status: 500, ...NO_STORE });
    }
    if (e instanceof GitLabError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502, ...NO_STORE });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `取得に失敗しました: ${msg}` }, { status: 502, ...NO_STORE });
  }
}
