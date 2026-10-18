import { NextRequest, NextResponse } from "next/server";
import { createPost, type Post } from "@/lib/store";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weekly content pack: generates 5 platform-varied posts from one niche
 * topic and schedules them across the next 7 days (Mon–Fri slots).
 *
 * POST /api/generate-week
 *   { topic: "local AI tools", tone?: "casual" }
 * → { posts: Post[], days: number }
 */

type Slot = { platform: string; dayOffset: number; title: string };

const WEEK_SLOTS: Slot[] = [
  { platform: "twitter", dayOffset: 1, title: "Hook post" },
  { platform: "thread", dayOffset: 2, title: "Deep-dive thread" },
  { platform: "linkedin", dayOffset: 3, title: "Professional take" },
  { platform: "twitter", dayOffset: 5, title: "Weekend hot take" },
  { platform: "blog", dayOffset: 6, title: "Long-form teaser" },
];

const PLATFORM_PROMPTS: Record<string, string> = {
  twitter:
    "Write a Twitter/X post. Max 280 characters. Hook in the first line. At most 2 hashtags.",
  thread:
    "Write a Twitter/X thread. 4-6 tweets, each under 280 characters. Number them 1/, 2/ etc. Strong hook, clear payoff.",
  linkedin:
    "Write a LinkedIn post. Professional but personal. 120-200 words. Short paragraphs. End with a question.",
  blog:
    "Write a blog article intro (150-250 words). Compelling headline as the first line, then a hook paragraph, then a 3-point outline.",
};

async function generateOne(
  topic: string,
  tone: string,
  slot: Slot,
  priorTitles: string[]
): Promise<string> {
  const style = PLATFORM_PROMPTS[slot.platform] ?? PLATFORM_PROMPTS.twitter;
  const avoid =
    priorTitles.length > 0
      ? `\n\nAlready covered this week (don't repeat angles): ${priorTitles.join("; ")}.`
      : "";
  const user = `${style}\n\nTone: ${tone}.\nTopic: ${topic}\nAngle: ${slot.title}.${avoid}\n\nOutput only the content itself.`;

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
            "You write platform-ready content. Output only the content itself — no preamble, no meta commentary.",
        },
        { role: "user", content: user },
      ],
      stream: false,
      options: { temperature: 0.85, num_predict: 700 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status} for ${slot.platform}`);
  }
  const data = await res.json();
  const content = data.message?.content?.trim();
  if (!content) throw new Error(`Empty model output for ${slot.platform}`);
  return content;
}

export async function POST(req: NextRequest) {
  try {
    const { topic, tone = "casual" } = await req.json();
    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const now = new Date();
    const created: Post[] = [];
    const titles: string[] = [];

    for (const slot of WEEK_SLOTS) {
      try {
        const content = await generateOne(topic.trim(), tone, slot, titles);
        // first line often works as a title; fall back to slot label
        const firstLine = content.split("\n")[0].replace(/[#*_`]/g, "").trim();
        const title =
          firstLine.length > 8 && firstLine.length <= 80
            ? firstLine
            : `${slot.title}: ${topic}`;

        const scheduledAt = new Date(
          now.getTime() + slot.dayOffset * DAY_MS
        ).toISOString();

        const post = createPost({
          title,
          content,
          platform: slot.platform,
          tone,
          status: "scheduled",
          scheduledAt,
          aiGenerated: true,
        });
        created.push(post);
        titles.push(title);
      } catch (e) {
        // One bad slot shouldn't kill the pack — keep the rest.
        console.error(`generate-week: skipped ${slot.platform}:`, e);
      }
    }

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
      days: Math.max(...created.map((p) => {
        const off = new Date(p.scheduledAt!).getTime() - now.getTime();
        return Math.round(off / DAY_MS);
      })),
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
