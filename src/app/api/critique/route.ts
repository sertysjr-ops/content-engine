import { NextRequest, NextResponse } from "next/server";
import { listPosts } from "@/lib/store";

export const runtime = "nodejs";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

/**
 * POST /api/critique — AI pre-publish review.
 *
 * Body: { id }                        → critique a stored post (404 if unknown)
 *       { content, platform? }        → critique ad-hoc text
 *
 * Returns: { score (1-10), verdict, strengths[], fixes[], hookRewrite,
 *            platform, model, postId? }
 *
 * The model is asked for strict JSON; parsing is tolerant (fences, prose
 * around the object, wrong types all get normalized) because small local
 * models love wrapping JSON in chatter.
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

    const system =
      "You are a brutally honest social-media editor. Score the post and " +
      "reply with STRICT JSON ONLY — no markdown fences, no commentary — " +
      'in exactly this shape: {"score": <integer 1-10>, "verdict": ' +
      '"<one sentence>", "strengths": ["<specific strength>", ...], ' +
      '"fixes": ["<concrete, actionable fix>", ...], "hookRewrite": ' +
      '"<a stronger opening line>"}. Give 2-4 strengths and 2-4 fixes. ' +
      "Score honestly: 7+ means genuinely good, 10 is near-perfect.";

    const user =
      `Platform: ${platform}\n\nPost to critique:\n${content.slice(0, 4000)}`;

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        think: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        options: { temperature: 0.4, num_predict: 700 },
      }),
    });

    if (!ollamaRes.ok) {
      const detail = await ollamaRes.text();
      return NextResponse.json(
        {
          error: `Ollama error (${ollamaRes.status})`,
          detail: detail.slice(0, 500),
          hint: "Is Ollama running? Try: ollama serve",
        },
        { status: 502 }
      );
    }

    const data = await ollamaRes.json();
    const raw: string = data.message?.content?.trim() ?? "";

    // tolerant parse: models wrap JSON in prose/fences — take first { … last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    let parsed: Record<string, unknown> = {};
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(raw.slice(start, end + 1));
      } catch {
        parsed = {};
      }
    }

    const strArr = (v: unknown, cap = 6): string[] =>
      Array.isArray(v)
        ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, cap)
        : [];

    const scoreNum = Number(parsed.score);
    const score = Number.isFinite(scoreNum)
      ? Math.min(10, Math.max(1, Math.round(scoreNum)))
      : 5;

    const critique = {
      score,
      verdict:
        typeof parsed.verdict === "string" && parsed.verdict.trim()
          ? parsed.verdict.trim()
          : "The model had opinions but phrased them oddly — see the lists.",
      strengths: strArr(parsed.strengths),
      fixes: strArr(parsed.fixes),
      hookRewrite:
        typeof parsed.hookRewrite === "string" ? parsed.hookRewrite.trim() : "",
      platform,
      model: MODEL,
      ...(postId ? { postId } : {}),
      // expose whether the JSON parse fully worked, for tests/debugging
      parsedCleanly: start >= 0 && Object.keys(parsed).length > 0,
    };

    return NextResponse.json(critique);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to critique", detail: String(err) },
      { status: 500 }
    );
  }
}
