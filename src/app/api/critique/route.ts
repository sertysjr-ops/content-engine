import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/store";
import { critiqueContent, OllamaUnavailable } from "@/lib/critique";

export const runtime = "nodejs";

/**
 * POST /api/critique — AI pre-publish review.
 *
 * Body: { id }                        → critique a stored post (404 if unknown)
 *       { content, platform? }        → critique ad-hoc text
 *
 * Returns: { score (1-10), verdict, strengths[], fixes[], hookRewrite,
 *            platform, model, postId? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let content = typeof body.content === "string" ? body.content : "";
    let platform = typeof body.platform === "string" ? body.platform : "twitter";
    let postId: string | undefined;

    if (typeof body.id === "string" && body.id) {
      const post = listPosts().find((p) => p.id === body.id);
      if (!post) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      content = post.content || post.title;
      platform = post.platform;
      postId = post.id;
    }

    if (!content.trim()) {
      return NextResponse.json(
        { error: "content is required (or pass an id of a post that has some)" },
        { status: 400 }
      );
    }

    const critique = await critiqueContent(content, platform);
    return NextResponse.json({
      ...critique,
      ...(postId ? { postId } : {}),
    });
  } catch (err) {
    if (err instanceof OllamaUnavailable) {
      return NextResponse.json(
        {
          error: err.message,
          detail: err.detail,
          hint: "Is Ollama running? Try: ollama serve",
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Failed to critique", detail: String(err) },
      { status: 500 }
    );
  }
}
