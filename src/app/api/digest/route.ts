import { NextRequest, NextResponse } from "next/server";
import { buildDigestJson, renderDigestHtml } from "@/lib/digest";

export const runtime = "nodejs";

/**
 * Weekly digest — GET /api/digest
 *
 * Default: email-ready HTML (open in a browser tab, copy-paste into any
 * email client, or curl from cron). ?format=json returns the structured
 * payload for a future SMTP sender or another consumer.
 *
 * Read-only, no LLM — safe to hit as often as you like.
 */
export async function GET(req: NextRequest) {
  const digest = buildDigestJson();
  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json(digest);
  }
  return new NextResponse(renderDigestHtml(digest), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
