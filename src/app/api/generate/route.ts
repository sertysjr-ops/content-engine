import { NextRequest, NextResponse } from "next/server";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

const PLATFORM_PROMPTS: Record<string, string> = {
  twitter:
    "Write a Twitter/X post. Max 280 characters. Hook in the first line. No hashtags spam — at most 2 hashtags.",
  thread:
    "Write a Twitter/X thread. 5-8 tweets, each under 280 characters. Number them 1/, 2/ etc. Strong hook, clear payoff.",
  linkedin:
    "Write a LinkedIn post. Professional but personal. 150-250 words. Short paragraphs. End with a question to drive comments.",
  blog:
    "Write a blog article intro (200-300 words). Compelling headline, a hook, and an outline of what the reader will learn.",
  youtube:
    "Write a YouTube video description. First 2 lines hook the viewer, then a summary, then 5 hashtag suggestions.",
};

export async function POST(req: NextRequest) {
  try {
    const { topic, platform = "twitter", tone = "casual" } = await req.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        { error: "topic is required" },
        { status: 400 }
      );
    }

    const system =
      "You write platform-ready content. Output only the content itself — no preamble, no meta commentary, no quotes around it.";
    const style = PLATFORM_PROMPTS[platform] ?? PLATFORM_PROMPTS.twitter;
    const user = `${style}\n\nTone: ${tone}.\nTopic: ${topic}`;

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
        options: { temperature: 0.8, num_predict: 768 },
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
    const content = data.message?.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json(
        {
          error: "Model returned empty content",
          hint: "The reasoning model may have used all tokens thinking. Try a shorter topic.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      content,
      model: MODEL,
      platform,
      topic,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate", detail: String(err) },
      { status: 500 }
    );
  }
}
