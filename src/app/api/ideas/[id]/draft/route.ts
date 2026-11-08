import { NextRequest, NextResponse } from "next/server";
import { getIdea, markUsed } from "@/lib/ideas";
import { createPost } from "@/lib/store";

/**
 * POST /api/ideas/[id]/draft
 * Convert an inbox idea into a draft post (idea text becomes the title,
 * content starts as the idea expanded into a writing brief). Marks the
 * idea used so it sinks to the bottom of the inbox.
 *
 * → 201 { post, idea } | 404 unknown idea | 409 already used
 */
export async function POST(
  _req: NextRequest,
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

  const post = createPost({
    title: idea.text.slice(0, 80),
    content:
      `${idea.text}\n\n—\nBrainstormed from topic: "${idea.topic}". ` +
      `Expand this angle into a full ${idea.platform} post (AI Studio → Generate, or write it here).`,
    platform: idea.platform,
    status: "draft",
    aiGenerated: true,
  });
  const updated = markUsed(id, post.id);
  return NextResponse.json({ post, idea: updated }, { status: 201 });
}
