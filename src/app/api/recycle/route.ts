import { NextRequest, NextResponse } from "next/server";
import { createPost, listPosts, type Post } from "@/lib/store";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

/**
 * Content recycling: take an existing post and mint fresh angles from it.
 *
 * POST /api/recycle
 *   { postId: string, count?: number (2-4, default 3) }
 * → { originals: Post[], originalsCreated: number, source: {id,title} }
 *
 * Each variant is a NEW DRAFT linked to the source via recycledFrom, so the
 * content page can show "recycled from X" and the loop can run again on the
 * variants. Angles are chosen by the LLM and de-duplicated client-side by
 * first-line comparison.
 */

const ANGLE_PREFS = [
  "a contrarian / hot-take angle",
  "a tactical how-to angle (step-by-step)",
  "a personal story / lesson-learned angle",
  "a data-driven / listicle angle",
  "a myth-busting angle",
] as const;

async function generateVariant(
  source: Post,
  angle: string,
  usedOpeners: string[]
): Promise<string> {
  const style =
    source.platform === "linkedin"
      ? "LinkedIn post. Professional but personal. 120-200 words. Short paragraphs. End with a question."
      : source.platform === "blog"
        ? "Blog article intro (150-250 words). Compelling headline first line, hook paragraph, then a 3-point outline."
        : source.platform === "thread"
          ? "Twitter/X thread. 4-6 tweets, each under 280 chars, numbered 1/, 2/… Strong hook, clear payoff."
          : "Twitter/X post. Max 280 chars. Hook in the first line. At most 2 hashtags.";

  const avoid =
    usedOpeners.length > 0
      ? `\n\nDo NOT open with anything similar to these existing openers: ${usedOpeners.join(" | ")}.`
      : "";

  const user =
    `Rewrite this content as ${angle}.\n\n` +
    `Format: ${style}\n` +
    `Topic source ("${source.title}"):\n${source.content}\n` +
    `Keep the core insight but change the framing, the hook, and the structure entirely. ` +
    `Output only the new content itself — no preamble.${avoid}`;

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
            "You repurpose content. Same insight, new angle — never a lazy paraphrase. Output only the content itself.",
        },
        { role: "user", content: user },
      ],
      stream: false,
      options: { temperature: 0.9, num_predict: 700 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Empty model output");
  return content;
}

export async function POST(req: NextRequest) {
  try {
    const { postId, count = 3 } = await req.json();
    if (!postId || typeof postId !== "string") {
      return NextResponse.json({ error: "postId is required" }, { status: 400 });
    }
    const n = Math.min(4, Math.max(1, Number(count) || 3));

    const matches = listPosts().filter((p) => p.id === postId);
    if (matches.length === 0) {
      return NextResponse.json({ error: "post not found" }, { status: 404 });
    }
    const source = matches[0];

    // Deterministic angle mix: pick n distinct angles, rotating so repeated
    // runs on the same post don't hammer the same angle first.
    const start = source.title.length % ANGLE_PREFS.length;
    const angles = Array.from(
      { length: n },
      (_, i) => ANGLE_PREFS[(start + i) % ANGLE_PREFS.length]
    );

    const created: Post[] = [];
    const usedOpeners: string[] = [
      source.content.split("\n")[0].slice(0, 60),
    ];

    for (const angle of angles) {
      try {
        const content = await generateVariant(source, angle, usedOpeners);
        const firstLine = content.split("\n")[0].replace(/[#*_`]/g, "").trim();
        if (firstLine) usedOpeners.push(firstLine.slice(0, 60));

        const title =
          firstLine.length > 8 && firstLine.length <= 80
            ? firstLine
            : `${source.title} — ${angle}`;

        created.push(
          createPost({
            title,
            content,
            platform: source.platform,
            tone: source.tone,
            status: "draft",
            aiGenerated: true,
            recycledFrom: source.id,
          })
        );
      } catch (e) {
        console.error(`recycle: skipped ${angle}:`, e);
      }
    }

    if (created.length === 0) {
      return NextResponse.json(
        {
          error: "All recycling generations failed",
          hint: "Is Ollama running? Try: ollama serve",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      variants: created,
      angles: angles.slice(0, created.length),
      source: { id: source.id, title: source.title },
      model: MODEL,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to recycle", detail: String(err) },
      { status: 500 }
    );
  }
}
