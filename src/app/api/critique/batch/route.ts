import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/store";
import { critiqueContent, OllamaUnavailable } from "@/lib/critique";

export const runtime = "nodejs";

const HARD_LIMIT = 10;

/**
 * POST /api/critique/batch — the draft review queue.
 *
 * Body: { status?: "draft" | "scheduled" | "published" (default "draft"),
 *         limit?: number (default 8, max 10) }
 *
 * Critiques every post with that status (oldest first, capped), then
 * returns them sorted WORST-FIRST so the most fix-needing draft is on top:
 *
 * { results: [{ post: {id,title,platform,status}, score, verdict, fixes,
 *               hookRewrite, strengths, error? }...],
 *   count, failed, model }
 *
 * Sequential calls (one local model — parallel would just queue inside
 * Ollama anyway) with per-post error isolation: one bad post never sinks
 * the queue; it lands at the bottom with an `error` field.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const status =
      typeof body.status === "string" &&
      ["draft", "scheduled", "published"].includes(body.status)
        ? body.status
        : "draft";
    const limitRaw = Number(body.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(HARD_LIMIT, Math.max(1, Math.round(limitRaw)))
      : 8;

    const candidates = listPosts()
      .filter((p) => p.status === status && (p.content || p.title).trim())
      .slice(0, limit);

    if (candidates.length === 0) {
      return NextResponse.json({
        results: [],
        count: 0,
        failed: 0,
        status,
        hint: `no ${status} posts with content to critique`,
      });
    }

    type Row = {
      post: { id: string; title: string; platform: string; status: string };
      score: number;
      verdict: string;
      strengths: string[];
      fixes: string[];
      hookRewrite: string;
      tookMs: number;
      error?: string;
    };

    const results: Row[] = [];
    for (const post of candidates) {
      const t0 = Date.now();
      try {
        const c = await critiqueContent(post.content || post.title, post.platform);
        results.push({
          post: {
            id: post.id,
            title: post.title,
            platform: post.platform,
            status: post.status,
          },
          score: c.score,
          verdict: c.verdict,
          strengths: c.strengths,
          fixes: c.fixes,
          hookRewrite: c.hookRewrite,
          tookMs: Date.now() - t0,
        });
      } catch (err) {
        results.push({
          post: {
            id: post.id,
            title: post.title,
            platform: post.platform,
            status: post.status,
          },
          score: -1,
          verdict: "",
          strengths: [],
          fixes: [],
          hookRewrite: "",
          tookMs: Date.now() - t0,
          error:
            err instanceof OllamaUnavailable
              ? err.message
              : `critique failed: ${String(err).slice(0, 200)}`,
        });
        // Ollama down → every remaining post will fail the same way; bail early
        if (err instanceof OllamaUnavailable) {
          return NextResponse.json(
            {
              error: err.message,
              detail: err.detail,
              hint: "Is Ollama running? Try: ollama serve",
              results,
            },
            { status: 502 }
          );
        }
      }
    }

    // worst-first; failures sink to the bottom
    results.sort((a, b) => {
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      return a.score - b.score;
    });

    return NextResponse.json({
      results,
      count: results.filter((r) => !r.error).length,
      failed: results.filter((r) => !!r.error).length,
      status,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Batch critique failed", detail: String(err) },
      { status: 500 }
    );
  }
}
