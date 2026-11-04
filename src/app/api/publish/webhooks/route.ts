import { NextResponse } from "next/server";
import { listDeliveries, webhookUrls } from "@/lib/webhooks";

export const runtime = "nodejs";

/**
 * GET /api/publish/webhooks → webhook config status + recent delivery log.
 *   { configured: string[] (safe URLs), deliveries: WebhookDelivery[] }
 * URLs are stored host+path only — query-string tokens are never logged.
 */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 50;
  return NextResponse.json({
    configured: webhookUrls().map((u) => {
      try {
        const p = new URL(u);
        return `${p.origin}${p.pathname}`;
      } catch {
        return "<invalid-url>";
      }
    }),
    deliveries: listDeliveries(Math.min(limit, 200)),
  });
}
