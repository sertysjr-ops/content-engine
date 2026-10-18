import { NextRequest, NextResponse } from "next/server";
import { createPost, listPosts, type PostStatus } from "@/lib/store";

export const runtime = "nodejs"; // needs fs — not edge-compatible

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters = {
    q: sp.get("q") ?? undefined,
    status: (sp.get("status") as PostStatus | null) ?? undefined,
    platform: sp.get("platform") ?? undefined,
  };
  return NextResponse.json({ posts: listPosts(filters) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.title !== undefined && typeof body.title !== "string") {
      return NextResponse.json({ error: "title must be a string" }, { status: 400 });
    }
    const post = createPost({
      title: body.title,
      content: typeof body.content === "string" ? body.content : "",
      platform: typeof body.platform === "string" ? body.platform : "twitter",
      tone: typeof body.tone === "string" ? body.tone : undefined,
      status: ["draft", "scheduled", "published"].includes(body.status)
        ? body.status
        : "draft",
      scheduledAt:
        typeof body.scheduledAt === "string" ? body.scheduledAt : null,
      engagement: typeof body.engagement === "string" ? body.engagement : null,
      aiGenerated: body.aiGenerated === true,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
