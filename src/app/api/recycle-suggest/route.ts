import { NextRequest, NextResponse } from "next/server";
import { suggestRecycles } from "@/lib/recycle-suggest";

/**
 * Recycle radar — GET /api/recycle-suggest?limit=3
 *
 * No LLM, no writes. Ranks published posts by refresh value using
 * engagement history + age. Each suggestion carries the full post, a
 * score, a primary reason, and signal tags the UI can badge.
 *
 * → { suggestions: [{ post, score, reason, signals }], generatedAt }
 */

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 3;
  const suggestions = suggestRecycles(limit);
  return NextResponse.json({ suggestions, generatedAt: new Date().toISOString() });
}
