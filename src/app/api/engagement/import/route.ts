import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/store";
import { importCsv, totals } from "@/lib/engagement";

export const runtime = "nodejs";

/**
 * POST /api/engagement/import — bulk-capture metrics from CSV text.
 *
 * Body: { csv: string }
 *
 * Expected shape: header row + data rows.
 *   post,likes,replies,reposts,impressions
 *   My Post Title,120,8,15,4500
 *
 * The "post" column matches by id or by exact title (case-insensitive).
 * Header names are forgiving: comments→replies, views→impressions,
 * retweets→reposts, etc. "1,200" in a number cell parses as 1200.
 *
 * Response: { imported: n, failed: [{row, detail, raw}], results, totals }
 * Status 200 if at least one row imported, else 400 with the failures.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const csv = (body as { csv?: unknown }).csv;
  if (typeof csv !== "string" || csv.trim() === "") {
    return NextResponse.json({ error: "need { csv: string }" }, { status: 400 });
  }

  const results = importCsv(
    csv,
    listPosts().map((p) => ({ id: p.id, title: p.title }))
  );
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (ok.length === 0) {
    return NextResponse.json(
      { error: "no rows imported", imported: 0, failed, totals: totals(new Set()) },
      { status: 400 }
    );
  }
  return NextResponse.json({
    imported: ok.length,
    failed,
    results: ok,
    totals: totals(new Set(listPosts().map((p) => p.id))),
  });
}
