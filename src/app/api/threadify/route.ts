import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createPost, listPosts, type Post } from "@/lib/store";
import {
  buildThreadPrompt,
  hardSplit,
  parseTweets,
  type Tweet,
} from "@/lib/threadify";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

/**
 * Thread Mode — split a post into a numbered X/Twitter thread.
 *
 * POST /api/threadify
 *   Preview:  { postId } | { content, title? }  (+ count?: 3-10, default 5)
 *     → 200 { tweets: [{text, chars}], fallback, source, model }
 *   Save:     + save: true, schedule?: boolean (default false → drafts),
 *             startAt?: ISO (default now+1h), gapMinutes?: number (default 2)
 *     → 201 { ..., saved: { threadId, posts: Post[] } }
 *
 * The LLM does the splitting; parseTweets() handles format drift and
 * hardSplit() (zero-LLM greedy chunker) is the never-fail fallback, flagged
 * in the response via fallback: true. Saved threads become one post per
 * tweet (platform "thread"), linked by threadId + threadIndex, staggered
 * gapMinutes apart so the auto-publish queue drips them out in order.
 */

async function generateThread(
  title: string,
  content: string,
  count: number
): Promise<{ tweets: Tweet[]; fallback: boolean }> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      think: false,
      messages: [
        {
          role: "system",
          content:
            "You are a world-class Twitter/X ghostwriter. You split long-form content into threads that people actually finish reading. Output only the numbered tweets.",
        },
        { role: "user", content: buildThreadPrompt({ title, content, count }) },
      ],
      stream: false,
      options: { temperature: 0.7, num_predict: 1200 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  const raw = data.message?.content?.trim();
  if (!raw) throw new Error("Empty model output");

  const parsed = parseTweets(raw, count);
  if (parsed.length >= 2) return { tweets: parsed, fallback: false };
  // Model output didn't look like a thread — never hard-fail the user.
  return { tweets: hardSplit(content).slice(0, count), fallback: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, title: adhocTitle, save = false } = body;
    const content: string = typeof body.content === "string" ? body.content : "";
    const count = Math.min(10, Math.max(3, Number(body.count) || 5));
    const schedule = body.schedule === true;
    const gapMinutes = Math.min(60, Math.max(1, Number(body.gapMinutes) || 2));

    let title: string;
    let sourceContent: string;
    let source: { id: string | null; title: string };
    let tone: string | undefined;

    if (postId) {
      const matches = listPosts().filter((p) => p.id === postId);
      if (matches.length === 0) {
        return NextResponse.json({ error: "post not found" }, { status: 404 });
      }
      title = matches[0].title;
      sourceContent = matches[0].content;
      tone = matches[0].tone;
      source = { id: matches[0].id, title: matches[0].title };
    } else {
      if (!content.trim()) {
        return NextResponse.json(
          { error: "content (or postId) is required" },
          { status: 400 }
        );
      }
      title = (typeof adhocTitle === "string" && adhocTitle.trim()) || "Untitled";
      sourceContent = content;
      source = { id: null, title };
    }

    let tweets: Tweet[];
    let fallback = false;
    try {
      ({ tweets, fallback } = await generateThread(title, sourceContent, count));
    } catch (e) {
      // Ollama down entirely → zero-LLM fallback still ships a thread.
      console.error("threadify: LLM failed, using hardSplit:", e);
      tweets = hardSplit(sourceContent).slice(0, count);
      fallback = true;
    }
    if (tweets.length === 0) {
      return NextResponse.json(
        { error: "Nothing to thread — source content is empty" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      tweets,
      count: tweets.length,
      fallback,
      source,
      model: fallback ? null : MODEL,
    };

    if (save) {
      const threadId = randomUUID();
      const start = body.startAt
        ? new Date(body.startAt)
        : new Date(Date.now() + 60 * 60 * 1000);
      if (isNaN(start.getTime())) {
        return NextResponse.json(
          { error: "startAt must be a valid ISO date" },
          { status: 400 }
        );
      }
      const posts: Post[] = tweets.map((t, i) =>
        createPost({
          title: `${title} — 🧵 ${i + 1}/${tweets.length}`,
          content: `${i + 1}/ ${t.text}`,
          platform: "thread",
          tone,
          status: schedule ? "scheduled" : "draft",
          scheduledAt: schedule
            ? new Date(start.getTime() + i * gapMinutes * 60_000).toISOString()
            : null,
          engagement: null,
          aiGenerated: !fallback,
          recycledFrom: source.id,
          threadId,
          threadIndex: i + 1,
        })
      );
      payload.saved = { threadId, posts };
      return NextResponse.json(payload, { status: 201 });
    }

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to threadify", detail: String(err) },
      { status: 500 }
    );
  }
}
