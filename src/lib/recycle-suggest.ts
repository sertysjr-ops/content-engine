import { listPosts, type Post } from "./store";
import { history, type Snapshot } from "./engagement";

/**
 * Recycle radar — ranks published posts by "refresh value".
 *
 * Pure scoring over existing data (no LLM calls), so it's instant and
 * deterministic. Three signals, weighted:
 *
 *  1. Momentum  — snapshots show impressions going down → the post is
 *     fading; a fresh angle re-exposes the insight. Decline is worth more
 *     than growth (a growing post doesn't need help yet).
 *  2. Reach     — high absolute impressions means the topic is proven;
 *     recycling a winner is lower-risk than recycling a dud.
 *  3. Age       — older posts have faded from feeds entirely, so the
 *     "same insight, new angle" play is effectively fresh content.
 *
 * Posts with zero snapshots still get scored (age + a small blind bonus)
 * so the radar works before the metrics habit kicks in.
 */

export type RecycleSignal =
  | "declining"
  | "growing"
  | "high-reach"
  | "thin-data"
  | "never-measured"
  | "aged";

export type RecycleSuggestion = {
  post: Post;
  score: number;
  reason: string;
  signals: RecycleSignal[];
};

const DAY = 24 * 60 * 60 * 1000;

function ageDays(post: Post, now: number): number {
  return Math.max(0, (now - new Date(post.createdAt).getTime()) / DAY);
}

function growth(first: Snapshot, last: Snapshot) {
  return {
    impressions: last.impressions - first.impressions,
    likes: last.likes - first.likes,
    replies: last.replies - first.replies,
    reposts: last.reposts - first.reposts,
  };
}

function scorePost(post: Post, now: number): RecycleSuggestion | null {
  if (post.status !== "published") return null;

  const snaps = history(post.id);
  const age = ageDays(post, now);
  let score = 0;
  const signals: RecycleSignal[] = [];
  const reasons: string[] = [];

  if (snaps.length >= 2) {
    const g = growth(snaps[0], snaps[snaps.length - 1]);
    if (g.impressions < 0) {
      // Fading — the strongest signal. Scale with the size of the decline
      // but cap so one viral-to-zero post doesn't crowd out everything.
      score += 30 + Math.min(20, Math.abs(g.impressions) / 100);
      signals.push("declining");
      reasons.push(
        `impressions declining (${g.impressions} since first capture) — refresh it`
      );
    } else if (g.impressions > 0) {
      score += Math.min(15, g.impressions / 300);
      signals.push("growing");
      reasons.push("still gaining — recycle while the topic is hot");
    }
    const last = snaps[snaps.length - 1];
    if (last.impressions >= 2000) {
      score += 15;
      signals.push("high-reach");
      reasons.push(`${last.impressions} impressions — proven topic`);
    }
  } else if (snaps.length === 1) {
    score += 10;
    signals.push("thin-data");
    reasons.push("only one snapshot — thin data, trust the age signal");
  } else {
    score += 8 + Math.min(12, age);
    signals.push("never-measured");
    reasons.push("never measured — recycle on instinct");
  }

  // Age: feeds bury everything within days; an old post is fair game again.
  const agePts = Math.min(20, age * 1.5);
  score += agePts;
  if (age >= 7) {
    signals.push("aged");
    reasons.push(`${Math.round(age)}d old — faded from feeds`);
  }

  return {
    post,
    score: Math.round(score * 10) / 10,
    reason: reasons[0], // primary reason; full list available via signals
    signals,
  };
}

/** Top-N published posts worth recycling, best score first. */
export function suggestRecycles(limit = 3, now = Date.now()): RecycleSuggestion[] {
  return listPosts()
    .map((p) => scorePost(p, now))
    .filter((s): s is RecycleSuggestion => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}
