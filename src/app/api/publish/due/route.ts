import { NextResponse } from "next/server";
import { listDuePosts, publishDuePosts } from "@/lib/store";

export const runtime = "nodejs"; // needs fs — not edge-compatible

/**
 * Auto-publish queue.
 *
 * GET  /api/publish/due → preview: scheduled posts whose time has passed,
 *                         without touching them ({ due: Post[], count }).
 * POST /api/publish/due → flip all due posts to "published"
 *                         ({ published: Post[], count }).
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
  return NextResponse.json({ published, count: published.length });
}
