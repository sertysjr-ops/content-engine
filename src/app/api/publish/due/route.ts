import { NextResponse } from "next/server";
import { listDuePosts, publishDuePosts } from "@/lib/store";
import { dispatchMany } from "@/lib/webhooks";

export const runtime = "nodejs"; // needs fs — not edge-compatible

/**
 * Auto-publish queue.
 *
 * GET  /api/publish/due → preview: scheduled posts whose time has passed,
 *                         without touching them ({ due: Post[], count }).
 * POST /api/publish/due → flip all due posts to "published", then fan each
 *                         out to PUBLISH_WEBHOOK_URLS (n8n/Make/Zapier-ready)
 *                         ({ published, count, webhooks: {delivered, failed} }).
 *
 * Wire POST to a cron (Vercel Cron / system crontab hitting the URL) and
 * the queue drains itself. Platform API posting plugs into publishDuePosts
 * later — the status machine is already correct.
 */
export async function GET() {
  const due = listDuePosts();
  return NextResponse.json({ due, count: due.length });
}

export async function POST() {
  const published = publishDuePosts();
  const webhooks = await dispatchMany(published);
  return NextResponse.json({
    published,
    count: published.length,
    webhooks: {
      delivered: webhooks.delivered,
      failed: webhooks.failed,
      results: webhooks.results,
    },
  });
}
