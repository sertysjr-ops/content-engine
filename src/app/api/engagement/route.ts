import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/store";
import {
  history,
  latest,
  record,
  summarize,
  totals,
  type Metrics,
} from "@/lib/engagement";

export const runtime = "nodejs";

/**
 * Engagement metrics — time-series snapshots per post.
 *
 * GET  /api/engagement            → { totals, posts: [{postId, title, latest, snapshots, growth}] }
 * GET  /api/engagement?postId=id  → { postId, history, latest }
 * POST /api/engagement            → { postId, likes?, replies?, reposts?, impressions? }
 *                                   (at least one metric required; 404 if post unknown)
 * POST /api/engagement            → { entries: [{ postId, ...metrics }] }  (batch)
 *
 * Numbers are clamped to non-negative integers. Snapshots are append-only —
 * edit the latest numbers by just posting a fresh capture.
 */

function validIds(): Set<string> {
  return new Set(listPosts().map((p) => p.id));
}

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get("postId");
  if (postId) {
    if (!validIds().has(postId)) {
      return NextResponse.json({ error: "post not found" }, { status: 404 });
    }
    return NextResponse.json({ postId, history: history(postId), latest: latest(postId) });
  }
  const ids = validIds();
  const titles = new Map(listPosts().map((p) => [p.id, p.title]));
  return NextResponse.json({
    totals: totals(ids),
    posts: summarize(ids)
      .map((s) => ({
        ...s,
        title: titles.get(s.postId) ?? "Untitled",
        history: history(s.postId),
      }))
      .sort(
        (a, b) => (b.latest?.impressions ?? 0) - (a.latest?.impressions ?? 0)
      ),
  });
}

function parseEntry(raw: unknown): { postId: string; metrics: Partial<Metrics> } | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.postId !== "string" || !e.postId) return null;
  const metrics: Partial<Metrics> = {};
  for (const k of ["likes", "replies", "reposts", "impressions"] as const) {
    if (e[k] !== undefined && e[k] !== null) {
      if (typeof e[k] !== "number" || !Number.isFinite(e[k]) || e[k] < 0) {
        return null; // malformed number — reject the whole entry
      }
      metrics[k] = e[k];
    }
  }
  if (Object.keys(metrics).length === 0) return null;
  return { postId: e.postId, metrics };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rawEntries = Array.isArray((body as { entries?: unknown[] }).entries)
    ? (body as { entries: unknown[] }).entries
    : [body];

  const ids = validIds();
  const results: { postId: string; snapshot: unknown }[] = [];
  const errors: { index: number; detail: string }[] = [];

  rawEntries.forEach((raw, i) => {
    const entry = parseEntry(raw);
    if (!entry) {
      errors.push({ index: i, detail: "need postId + at least one non-negative metric" });
      return;
    }
    if (!ids.has(entry.postId)) {
      errors.push({ index: i, detail: `post '${entry.postId}' not found` });
      return;
    }
    results.push({ postId: entry.postId, snapshot: record(entry.postId, entry.metrics) });
  });

  if (results.length === 0) {
    return NextResponse.json(
      { error: "no valid entries", errors },
      { status: errors.some((e) => e.detail.includes("not found")) ? 404 : 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    recorded: results,
    failed: errors,
    totals: totals(validIds()),
  });
}
