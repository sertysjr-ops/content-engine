import { listPosts, listDuePosts, getStats } from "./store";
import { totals } from "./engagement";
import { suggestRecycles, type RecycleSuggestion } from "./recycle-suggest";

/**
 * Weekly digest — an email-ready briefing assembled from data we already
 * have. No LLM, no writes: pure read + render, so it's instant and safe
 * to hit from a cron or a dashboard button.
 *
 * Two shapes:
 *   - buildDigestJson() — structured payload (tests, future SMTP sender)
 *   - renderDigestHtml() — inline-styled, email-client-safe HTML you can
 *     paste into Gmail/Mailchimp or send as-is once SMTP is wired.
 *
 * Sections:
 *   1. Recycle Radar — top posts worth refreshing (score + reason)
 *   2. Publish queue — scheduled posts due right now
 *   3. Week in numbers — library stats + engagement totals
 *   4. Upcoming — next 7 days of scheduled posts
 */

export type DigestPick = {
  postId: string;
  title: string;
  platform: string;
  score: number;
  reason: string;
  signals: string[];
};

export type DigestQueueItem = {
  postId: string;
  title: string;
  platform: string;
  scheduledAt: string | null;
};

export type Digest = {
  subject: string;
  generatedAt: string;
  radar: DigestPick[];
  dueNow: DigestQueueItem[];
  upcoming: DigestQueueItem[];
  stats: ReturnType<typeof getStats>;
  engagement: ReturnType<typeof totals>;
};

function toPick(s: RecycleSuggestion): DigestPick {
  return {
    postId: s.post.id,
    title: s.post.title,
    platform: s.post.platform,
    score: s.score,
    reason: s.reason,
    signals: s.signals,
  };
}

export function buildDigestJson(now = new Date()): Digest {
  const posts = listPosts();
  const validIds = new Set(posts.map((p) => p.id));
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const upcoming = posts
    .filter(
      (p) =>
        p.status === "scheduled" &&
        p.scheduledAt !== null &&
        p.scheduledAt > nowIso &&
        p.scheduledAt <= weekAhead
    )
    .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))
    .map((p) => ({
      postId: p.id,
      title: p.title,
      platform: p.platform,
      scheduledAt: p.scheduledAt,
    }));

  const dueNow = listDuePosts(now).map((p) => ({
    postId: p.id,
    title: p.title,
    platform: p.platform,
    scheduledAt: p.scheduledAt,
  }));

  const radar = suggestRecycles(3, now.getTime()).map(toPick);

  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return {
    subject: `Content digest — ${dateStr}: ${radar.length} recycle picks, ${dueNow.length} due now`,
    generatedAt: nowIso,
    radar,
    dueNow,
    upcoming,
    stats: getStats(),
    engagement: totals(validIds),
  };
}

/* ------------------------------------------------------------------ */
/* HTML rendering — inline styles only (email clients strip <style>)  */
/* ------------------------------------------------------------------ */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const S = {
  h2: 'style="font-size:15px;margin:24px 0 8px;color:#e4e4e7;border-bottom:1px solid #27272a;padding-bottom:6px;"',
  li: 'style="margin:0 0 10px;padding:10px 12px;background:#18181b;border:1px solid #27272a;border-radius:8px;list-style:none;"',
  badge:
    'style="display:inline-block;font-size:11px;padding:1px 8px;border-radius:999px;background:#27272a;color:#a1a1aa;margin-right:6px;"',
  muted: 'style="color:#71717a;font-size:12px;"',
  title: 'style="color:#fafafa;font-size:14px;font-weight:600;"',
};

function section(title: string, body: string): string {
  return `<h2 ${S.h2}>${esc(title)}</h2>${body}`;
}

function emptyNote(msg: string): string {
  return `<p ${S.muted}>${esc(msg)}</p>`;
}

export function renderDigestHtml(d: Digest): string {
  const radarHtml =
    d.radar.length === 0
      ? emptyNote("No published posts yet — radar wakes up once you ship.")
      : `<ul style="margin:0;padding:0;">${d.radar
          .map(
            (p) => `<li ${S.li}>
              <span ${S.badge}>${esc(p.platform)}</span>
              <span ${S.badge}>score ${p.score}</span>
              <div ${S.title}>${esc(p.title)}</div>
              <div ${S.muted}>${esc(p.reason)}</div>
            </li>`
          )
          .join("")}</ul>`;

  const dueHtml =
    d.dueNow.length === 0
      ? emptyNote("Nothing due right now. Queue is clean.")
      : `<ul style="margin:0;padding:0;">${d.dueNow
          .map(
            (q) => `<li ${S.li}>
              <span ${S.badge}>${esc(q.platform)}</span>
              <span ${S.title}>${esc(q.title)}</span>
              <div ${S.muted}>was scheduled ${esc(fmtDate(q.scheduledAt))} — hit POST /api/publish/due</div>
            </li>`
          )
          .join("")}</ul>`;

  const upcomingHtml =
    d.upcoming.length === 0
      ? emptyNote("Nothing scheduled this week — run Fill my week in AI Studio.")
      : `<ul style="margin:0;padding:0;">${d.upcoming
          .map(
            (q) => `<li ${S.li}>
              <span ${S.badge}>${esc(q.platform)}</span>
              <span ${S.title}>${esc(q.title)}</span>
              <div ${S.muted}>${esc(fmtDate(q.scheduledAt))}</div>
            </li>`
          )
          .join("")}</ul>`;

  const e = d.engagement;
  const st = d.stats;
  const numbersHtml = `<table style="border-collapse:collapse;font-size:13px;color:#d4d4d8;">
    <tr><td style="padding:3px 16px 3px 0;color:#71717a;">Library</td>
        <td>${st.total} posts (${st.draft} drafts · ${st.scheduled} scheduled · ${st.published} published)</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#71717a;">AI-generated</td><td>${st.aiGenerated}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#71717a;">Tracked posts</td><td>${e.postsTracked}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#71717a;">Impressions</td><td>${e.impressions.toLocaleString()}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#71717a;">Likes / replies / reposts</td>
        <td>${e.likes.toLocaleString()} / ${e.replies.toLocaleString()} / ${e.reposts.toLocaleString()}</td></tr>
  </table>`;

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#09090b;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;">
    <h1 style="font-size:20px;color:#fafafa;margin:0 0 4px;">📬 Content Engine digest</h1>
    <p ${S.muted}>${esc(d.subject)} · generated ${esc(fmtDate(d.generatedAt))}</p>
    ${section("♻️ Recycle radar — refresh these next", radarHtml)}
    ${section("🚀 Due to publish now", dueHtml)}
    ${section("🗓 Coming up this week", upcomingHtml)}
    ${section("📊 Library in numbers", numbersHtml)}
    <p ${S.muted} style="margin-top:28px;">Sent by your local Content Engine · ${esc(
      d.generatedAt
    )}</p>
  </div>
</body></html>`;
}
