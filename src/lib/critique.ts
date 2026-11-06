/**
 * Shared AI-critique core — used by /api/critique (single) and
 * /api/critique/batch (review queue). Kept LLM-call + tolerant-parse in
 * one place so the batch route can't drift from the single-shot one.
 */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

export type CritiqueResult = {
  score: number;
  verdict: string;
  strengths: string[];
  fixes: string[];
  hookRewrite: string;
  platform: string;
  model: string;
  parsedCleanly: boolean;
};

export class OllamaUnavailable extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Ollama error (${status})`);
    this.status = status;
    this.detail = detail.slice(0, 500);
  }
}

/**
 * Score a post 1-10 with the local model. Throws OllamaUnavailable when
 * the server can't be reached / errors; never throws on malformed model
 * output (that path degrades to score 5 + parsedCleanly:false).
 */
export async function critiqueContent(
  content: string,
  platform: string
): Promise<CritiqueResult> {
  const system =
    "You are a brutally honest social-media editor. Score the post and " +
    "reply with STRICT JSON ONLY — no markdown fences, no commentary — " +
    'in exactly this shape: {"score": <integer 1-10>, "verdict": ' +
    '"<one sentence>", "strengths": ["<specific strength>", ...], ' +
    '"fixes": ["<concrete, actionable fix>", ...], "hookRewrite": ' +
    '"<a stronger opening line>"}. Give 2-4 strengths and 2-4 fixes. ' +
    "Score honestly: 7+ means genuinely good, 10 is near-perfect.";

  const user = `Platform: ${platform}\n\nPost to critique:\n${content.slice(0, 4000)}`;

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
    throw new OllamaUnavailable(ollamaRes.status, await ollamaRes.text());
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
      ? v
          .filter((s): s is string => typeof s === "string" && !!s.trim())
          .slice(0, cap)
      : [];

  const scoreNum = Number(parsed.score);
  const score = Number.isFinite(scoreNum)
    ? Math.min(10, Math.max(1, Math.round(scoreNum)))
    : 5;

  return {
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
    parsedCleanly: start >= 0 && Object.keys(parsed).length > 0,
  };
}

/**
 * Swap a post's opening line for the critique's stronger hook.
 * First line break wins; a single-line post is replaced wholesale.
 * Pure + exported for tests.
 */
export function applyHookRewrite(content: string, hookRewrite: string): string {
  const hook = hookRewrite.trim();
  if (!hook) return content;
  const nl = content.indexOf("\n");
  if (nl < 0) return hook;
  return hook + content.slice(nl);
}
