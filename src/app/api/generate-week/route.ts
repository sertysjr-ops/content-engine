import { NextRequest, NextResponse } from "next/server";
import { generateWeekPosts, weekSpanDays } from "@/lib/weekgen";

const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

/**
 * Weekly content pack: generates 5 platform-varied posts from one niche
 * topic and schedules them across the next 7 days (Mon–Fri slots).
 *
 * POST /api/generate-week
 *   { topic: "local AI tools", tone?: "casual" }
 * → { posts: Post[], days: number }
 */
export async function POST(req: NextRequest) {
  try {
    const { topic, tone = "casual" } = await req.json();
    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const created = await generateWeekPosts(topic.trim(), tone);

    if (created.length === 0) {
      return NextResponse.json(
        {
          error: "All generations failed",
          hint: "Is Ollama running? Try: ollama serve",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      posts: created,
      days: weekSpanDays(created),
      model: MODEL,
      topic: topic.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate week", detail: String(err) },
      { status: 500 }
    );
  }
}
