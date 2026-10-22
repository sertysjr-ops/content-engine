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

/* ------------------------------------------------------------------ */
/* CSV import — bulk-capture metrics exported from platform dashboards */
/* ------------------------------------------------------------------ */

export type CsvRowResult =
  | { ok: true; row: number; postId: string; title: string; snapshot: Snapshot }
  | { ok: false; row: number; detail: string; raw: string };

const HEADER_ALIASES: Record<string, keyof Metrics | "post"> = {
  post: "post",
  title: "post",
  id: "post",
  postid: "post",
  likes: "likes",
  favorites: "likes",
  replies: "replies",
  comments: "replies",
  reposts: "reposts",
  retweets: "reposts",
  quotes: "reposts",
  impressions: "impressions",
  views: "impressions",
  reach: "impressions",
};

/**
 * Parse CSV text into snapshot records. First row must be a header row.
 * The "post" column matches by id first, then exact title (trimmed,
 * case-insensitive). Rows with no metrics are skipped; rows matching no
 * post are reported, not fatal. Quoted fields with commas are handled.
 */
export function importCsv(
  csv: string,
  posts: { id: string; title: string }[]
): CsvRowResult[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const byTitle = new Map(posts.map((p) => [p.title.trim().toLowerCase(), p]));
  const out: CsvRowResult[] = [];

  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    return [
      { ok: false, row: 0, detail: "need a header row plus at least one data row", raw: csv.slice(0, 80) },
    ];
  }

  const header = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  const postIdx = header.indexOf("post");
  if (postIdx === -1) {
    return [
      {
        ok: false,
        row: 0,
        detail: "no post column found — expected one of: post, title, id",
        raw: rows[0].join(","),
      },
    ];
  }
  const metricCols = header
    .map((h, i) => ({ key: h, i }))
    .filter((c): c is { key: keyof Metrics; i: number } => c.key !== null && c.key !== "post");
  if (metricCols.length === 0) {
    return [
      { ok: false, row: 0, detail: "no metric columns found (likes/replies/reposts/impressions)", raw: rows[0].join(",") },
    ];
  }

  rows.slice(1).forEach((cells, i) => {
    const rowNum = i + 2; // 1-indexed incl. header
    const raw = cells.join(",");
    if (cells.every((c) => c.trim() === "")) return; // blank line
    const key = (cells[postIdx] ?? "").trim();
    const post = byId.get(key) ?? byTitle.get(key.toLowerCase());
    if (!post) {
      out.push({ ok: false, row: rowNum, detail: `post '${key}' not found`, raw });
      return;
    }
    const metrics: Partial<Metrics> = {};
    for (const { key: mk, i: col } of metricCols) {
      const v = (cells[col] ?? "").trim().replace(/[,\s]/g, "");
      if (v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        out.push({ ok: false, row: rowNum, detail: `bad number '${cells[col]?.trim()}' for ${mk}`, raw });
        return;
      }
      metrics[mk] = n;
    }
    if (Object.keys(metrics).length === 0) {
      out.push({ ok: false, row: rowNum, detail: "row has no metric values", raw });
      return;
    }
    out.push({
      ok: true,
      row: rowNum,
      postId: post.id,
      title: post.title,
      snapshot: record(post.id, metrics),
    });
  });
  return out;
}

/** Minimal RFC-4180-ish CSV: quoted fields, escaped quotes, \r\n tolerance. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, ""); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      rows.push(cur);
      cur = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 1 || r[0]?.trim() !== "");
}
