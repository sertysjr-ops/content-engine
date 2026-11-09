/**
 * Thread Mode — shared logic for splitting long-form content into a
 * numbered X/Twitter thread.
 *
 * parseTweets() is deliberately tolerant: local models drift between
 * "1/ text", "1. text", "Tweet 1: text" and bare newline-separated tweets.
 * hardSplit() is the zero-LLM fallback (sentence-aware greedy chunker) so
 * the feature never hard-fails when the model output is unparseable.
 */

export type Tweet = { text: string; chars: number };

export const MAX_TWEET = 280;
// Models overshoot; keep parsed tweets a bit under the hard limit so the
// "1/ " numbering prefix always fits.
const SOFT_TWEET = 272;

export function buildThreadPrompt(opts: {
  title: string;
  content: string;
  count: number;
}): string {
  return (
    `Split this content into a Twitter/X thread of exactly ${opts.count} tweets.\n\n` +
    `Rules:\n` +
    `- Each tweet MUST be under ${MAX_TWEET} characters (shorter is fine).\n` +
    `- Number every tweet exactly like "1/ ", "2/ ", ... on its own line.\n` +
    `- Tweet 1 is the hook — make it impossible to scroll past.\n` +
    `- Last tweet is the payoff / call to action.\n` +
    `- Keep the author's voice; don't add hashtags except maybe one in the final tweet.\n` +
    `- Output ONLY the numbered tweets, no preamble, no commentary.\n\n` +
    `Title: ${opts.title}\n\n` +
    `Content:\n${opts.content}`
  );
}

/** Strip a leading numbering prefix ("1/ ", "2. ", "Tweet 3:" etc). */
function stripPrefix(line: string): string {
  return line
    .replace(/^\s*(?:tweet\s*)?\d+\s*[\/\.\):\-–—]\s*/i, "")
    .trim();
}

/**
 * Tolerant parser for model output. Returns [] when nothing looks like a
 * thread so callers can fall back to hardSplit().
 */
export function parseTweets(raw: string, count: number): Tweet[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const tweets: string[] = [];
  let current = "";

  for (const line of lines) {
    const startsNumbered = /^\s*(?:tweet\s*)?\d+\s*[\/\.\):\-–—]\s*/i.test(
      line
    );
    if (startsNumbered) {
      if (current.trim()) tweets.push(current.trim());
      current = stripPrefix(line);
    } else if (current) {
      // continuation of the current tweet
      current += " " + line;
    }
    // else: preamble before the first numbered tweet — ignore
  }
  if (current.trim()) tweets.push(current.trim());

  // Filter junk, drop empties, cap at requested count (+1 slack for a
  // numbering mistake), enforce the char limit by re-chunking overshoots.
  const clean = tweets.filter((t) => t.length > 0);
  if (clean.length < 2) return [];

  const out: Tweet[] = [];
  for (const t of clean.slice(0, count + 1)) {
    if (t.length <= MAX_TWEET) {
      out.push({ text: t, chars: t.length });
    } else {
      for (const chunk of greedyChunks(t, SOFT_TWEET)) {
        out.push({ text: chunk, chars: chunk.length });
      }
    }
    if (out.length >= count) break;
  }
  return out.slice(0, count);
}

/**
 * Zero-LLM fallback: greedy sentence-aware chunking into <=maxLen tweets.
 * Splits on sentence boundaries first, then hard-wraps long sentences.
 */
export function hardSplit(content: string, maxLen = SOFT_TWEET): Tweet[] {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  // sentence-ish boundaries: ., !, ?, ;, — followed by space
  const sentences = flat
    .split(/(?<=[.!?;])\s+|(?<=—)\s+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > maxLen) {
      if (buf) {
        chunks.push(buf);
        buf = "";
      }
      chunks.push(...greedyChunks(s, maxLen));
      continue;
    }
    const joined = buf ? `${buf} ${s}` : s;
    if (joined.length <= maxLen) {
      buf = joined;
    } else {
      chunks.push(buf);
      buf = s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.map((text) => ({ text, chars: text.length }));
}

/** Greedy word-wrap into <=maxLen chunks (last resort hard cut). */
function greedyChunks(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    const joined = buf ? `${buf} ${w}` : w;
    if (joined.length <= maxLen) {
      buf = joined;
    } else {
      if (buf) out.push(buf);
      if (w.length > maxLen) {
        for (let i = 0; i < w.length; i += maxLen) {
          out.push(w.slice(i, i + maxLen));
        }
        buf = "";
      } else {
        buf = w;
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}
