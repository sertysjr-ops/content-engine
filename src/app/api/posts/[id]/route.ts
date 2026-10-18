import { NextRequest, NextResponse } from "next/server";
import { deletePost, updatePost } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const post = updatePost(id, {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.content === "string" ? { content: body.content } : {}),
      ...(typeof body.platform === "string" ? { platform: body.platform } : {}),
      ...(typeof body.tone === "string" ? { tone: body.tone } : {}),
      ...(typeof body.engagement === "string"
        ? { engagement: body.engagement }
        : {}),
      ...(typeof body.scheduledAt === "string" || body.scheduledAt === null
        ? { scheduledAt: body.scheduledAt }
        : {}),
      ...(typeof body.status === "string" &&
      ["draft", "scheduled", "published"].includes(body.status)
        ? { status: body.status as "draft" | "scheduled" | "published" }
        : {}),
    });
    if (!post) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!deletePost(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
