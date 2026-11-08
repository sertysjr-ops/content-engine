import { NextRequest, NextResponse } from "next/server";
import { addIdeas, listIdeas, type Idea } from "@/lib/ideas";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

const PLATFORMS = ["twitter", "thread", "linkedin", "blog", "youtube"];

/**
 * Ideas inbox.
 *
 * GET  /api/ideas            → { ideas: Idea[] } (unused first)
 * POST /api/ideas            → brainstorm {topic, count?, platform?}
 *                              → { ideas: Idea[], model, topic }
 *
 * Brainstorming asks the local model for a numbered list of content
 * ideas; parsing is tolerant (bullets, "1." / "1)", stray blank lines)
 * because small models drift formats constantly.
 */

function parseIdeas(raw: string, cap: number): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const cleaned = line
      .replace(/^\s*(?:[-*•]|\d{1,2}[.)]):?\s+/, "") // bullets / numbering
      .replace(/^["']|["']$/g, "") // wrapping quotes
      .trim();
    if (cleaned.length < 12 || cleaned.length > 220) continue;
    if (/^(here are|sure|okay|certainly|of course)/i.test(cleaned)) continue;
    if (!out.some((x) => x.toLowerCase() === cleaned.toLowerCase())) {
      out.push(cleaned);
    }
    if (out.length >= cap) break;
  }
  return out;
}

export async function GET() {
  return NextResponse.json({ ideas: listIdeas() });
}

export async function POST(req: NextRequest) {
  try {
    const { topic, count = 5, platform } = await req.json();
    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }
    const n = Math.min(10, Math.max(1, Math.round(Number(count)) || 5));
    const plat =
      typeof platform === "string" && PLATFORMS.includes(platform)
        ? platform
        : "twitter";

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
              "You brainstorm content ideas for creators. Output ONLY a " +
              "numbered list of ideas, one per line. Each idea is a single " +
              "specific, punchy line — a title or angle someone could write " +
              "a post from. No preamble, no commentary, no explanations.",
          },
          {
            role: "user",
            content:
              `Brainstorm ${n} distinct content ideas about: ${topic.trim()}\n` +
              `They will become ${plat} posts. Vary the angles (how-to, ` +
              `mistake, contrarian, story, data, listicle). Output exactly ` +
              `${n} numbered lines.`,
          },
        ],
        stream: false,
        options: { temperature: 0.9, num_predict: 600 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Ollama ${res.status}`, hint: "Is Ollama running? Try: ollama serve" },
        { status: 502 }
      );
    }
    const data = await res.json();
    const raw: string = data.message?.content ?? "";
    const texts = parseIdeas(raw, n);
    if (texts.length === 0) {
      return NextResponse.json(
        { error: "Model returned no usable ideas", hint: "Try a more specific topic" },
        { status: 502 }
      );
    }

    const created: Idea[] = addIdeas(
      texts.map((text) => ({ text, platform: plat, topic: topic.trim() }))
    );
    return NextResponse.json(
      { ideas: created, model: MODEL, topic: topic.trim() },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to brainstorm ideas", detail: String(err) },
      { status: 500 }
    );
  }
}
