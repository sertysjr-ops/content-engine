import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

/**
 * Engagement metrics store — time-series snapshots per post.
 *
 * Data lives in <project>/data/engagements.json (gitignored), keyed by postId:
 *   { [postId]: Snapshot[] }   // chronological, capped at MAX_SNAPSHOTS
 *
 * Deliberately separate from posts.json: metrics are a log, posts are
 * documents. Deleting a post leaves orphan snapshots behind, but every
 * read path joins against the posts store, so orphans are invisible.
 *
 * Swap plan mirrors store.ts: same exported signatures, supabase-js bodies.
 */

export type Metrics = {
  likes: number;
  replies: number;
  reposts: number;
  impressions: number;
};

export type Snapshot = Metrics & { capturedAt: string };

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "engagements.json");
const MAX_SNAPSHOTS = 50; // per post — enough for a daily-capture year

type Store = Record<string, Snapshot[]>;

function readAll(): Store {
  if (!existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeAll(store: Store): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, DATA_FILE); // atomic-ish
}

function clamp(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

/** Append a snapshot for a post. Returns the stored snapshot. */
export function record(postId: string, m: Partial<Metrics>): Snapshot {
  const store = readAll();
  const snapshot: Snapshot = {
    likes: clamp(m.likes),
    replies: clamp(m.replies),
    reposts: clamp(m.reposts),
    impressions: clamp(m.impressions),
    capturedAt: new Date().toISOString(),
  };
  const list = store[postId] ?? [];
  list.push(snapshot);
  store[postId] = list.slice(-MAX_SNAPSHOTS);
  writeAll(store);
  return snapshot;
}

export function history(postId: string): Snapshot[] {
  return readAll()[postId] ?? [];
}

export function latest(postId: string): Snapshot | null {
  const list = history(postId);
  return list.length > 0 ? list[list.length - 1] : null;
}

export type PostEngagementSummary = {
  postId: string;
  latest: Snapshot | null;
  snapshots: number;
  // deltas between first and latest snapshot — the "is it growing?" signal
  growth: Metrics | null;
};

/** Per-post rollup for posts that have at least one snapshot. */
export function summarize(validPostIds: Set<string>): PostEngagementSummary[] {
  const store = readAll();
  const out: PostEngagementSummary[] = [];
  for (const [postId, snaps] of Object.entries(store)) {
    if (!validPostIds.has(postId) || snaps.length === 0) continue;
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    out.push({
      postId,
      latest: last,
      snapshots: snaps.length,
      growth:
        snaps.length > 1
          ? {
              likes: last.likes - first.likes,
              replies: last.replies - first.replies,
              reposts: last.reposts - first.reposts,
              impressions: last.impressions - first.impressions,
            }
          : null,
    });
  }
  return out;
}

export type EngagementTotals = Metrics & { postsTracked: number };

/** Sum of the latest snapshot per tracked post. */
export function totals(validPostIds: Set<string>): EngagementTotals {
  const rows = summarize(validPostIds);
  return rows.reduce(
    (acc, r) => ({
      likes: acc.likes + (r.latest?.likes ?? 0),
      replies: acc.replies + (r.latest?.replies ?? 0),
      reposts: acc.reposts + (r.latest?.reposts ?? 0),
      impressions: acc.impressions + (r.latest?.impressions ?? 0),
      postsTracked: acc.postsTracked + 1,
    }),
    { likes: 0, replies: 0, reposts: 0, impressions: 0, postsTracked: 0 }
  );
}
