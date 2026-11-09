import { NextRequest, NextResponse } from "next/server";
import { getIdea, markUsed } from "@/lib/ideas";
import { generateWeekPosts, weekSpanDays } from "@/lib/weekgen";

/**
 * POST /api/ideas/[id]/week
 * Turn an inbox idea into a full scheduled week — the idea text becomes
 * the topic for the 5-slot weekly pack. Marks the idea used (linked to
 * the first post of the pack) so it sinks out of the inbox.
 *
 *   body: { tone?: "casual" }
 * → 201 { posts, idea, days } | 404 unknown idea | 409 already used
 *   502 all generations failed (idea NOT marked used — retryable)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idea = getIdea(id);
  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }
  if (idea.usedBy) {
    return NextResponse.json(
      { error: "Idea already converted", postId: idea.usedBy },
      { status: 409 }
    );
  }

  let tone = "casual";
  try {
    const body = await req.json();
    if (typeof body?.tone === "string" && body.tone.trim()) {
      tone = body.tone.trim();
    }
  } catch {
    // empty body is fine — default tone
  }

  const created = await generateWeekPosts(idea.text, tone);
  if (created.length === 0) {
    return NextResponse.json(
      {
        error: "All generations failed",
        hint: "Is Ollama running? The idea was NOT marked used — retryable.",
      },
      { status: 502 }
    );
  }

  const updated = markUsed(id, created[0].id);
  return NextResponse.json(
    { posts: created, idea: updated, days: weekSpanDays(created) },
    { status: 201 }
  );
}
