import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";

/**
 * File-backed JSON store — zero-dependency stopgap until Supabase lands.
 *
 * Swap plan: keep the exported function signatures, re-implement the bodies
 * with supabase-js. Everything above this file (API routes, UI) stays put.
 *
 * Data lives in <project>/data/posts.json (gitignored). NOT for serverless
 * (Vercel) — deploy to a Node host or finish the Supabase migration first.
 */

export type PostStatus = "draft" | "scheduled" | "published";

export type Post = {
  id: string;
  title: string;
  content: string;
  platform: string; // twitter | thread | linkedin | blog | youtube
  tone?: string;
  status: PostStatus;
  scheduledAt: string | null; // ISO
  engagement: string | null; // e.g. "1.2k" — manual until real analytics
  aiGenerated: boolean;
  recycledFrom?: string | null; // source post id when minted via /api/recycle
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "posts.json");

function seedPosts(): Post[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const mk = (
    title: string,
    content: string,
    platform: string,
    status: PostStatus,
    scheduledOffsetDays: number | null,
    engagement: string | null
  ): Post => ({
    id: randomUUID(),
    title,
    content,
    platform,
    status,
    scheduledAt:
      scheduledOffsetDays === null
        ? null
        : new Date(now + scheduledOffsetDays * day).toISOString(),
    engagement,
    aiGenerated: false,
    createdAt: new Date(now - 30 * day).toISOString(),
    updatedAt: new Date(now - 30 * day).toISOString(),
  });
  return [
    mk(
      "10 AI Tools That Will 10x Your Productivity",
      "I tested 47 AI tools this month. Most were hype. These 10 actually saved me hours:\n\n1. A local LLM for drafting (no API bill)\n2. …",
      "twitter",
      "published",
      -12,
      "1.2k"
    ),
    mk(
      "How I Built a $10K MRR SaaS in 30 Days",
      "Day 1: I had an idea and zero users.\nDay 30: $10K MRR.\n\nHere's the exact playbook — no fluff, just the moves that worked.",
      "linkedin",
      "scheduled",
      3,
      null
    ),
    mk(
      "The Future of No-Code Development",
      "No-code isn't replacing developers. It's replacing the 80% of dev work that was never really engineering.",
      "blog",
      "draft",
      null,
      null
    ),
    mk(
      "5 Landing Page Mistakes (and fixes)",
      "Your landing page is leaking money. Here are the 5 mistakes I fix on every audit:\n\n1. Headline about you, not the customer…",
      "twitter",
      "published",
      -9,
      "3.4k"
    ),
    mk("Weekly Wins #3", "What shipped this week, what broke, and what's next. 🧵", "twitter", "published", -6, "890"),
    mk(
      "Launch teaser video",
      "Something new is coming. Built offline-first, powered by local AI. Full reveal next week.",
      "youtube",
      "scheduled",
      10,
      null
    ),
  ];
}

function readAll(): Post[] {
  if (!existsSync(DATA_FILE)) {
    mkdirSync(DATA_DIR, { recursive: true });
    const seeded = seedPosts();
    writeFileSync(DATA_FILE, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8")) as Post[];
  } catch {
    return [];
  }
}

function writeAll(posts: Post[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(posts, null, 2));
  renameSync(tmp, DATA_FILE); // atomic-ish
}

export type PostFilters = {
  q?: string;
  status?: PostStatus | "all";
  platform?: string;
};

export function listPosts(filters: PostFilters = {}): Post[] {
  let posts = readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filters.q) {
    const q = filters.q.toLowerCase();
    posts = posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
    );
  }
  if (filters.status && filters.status !== "all") {
    posts = posts.filter((p) => p.status === filters.status);
  }
  if (filters.platform && filters.platform !== "all") {
    posts = posts.filter((p) => p.platform === filters.platform);
  }
  return posts;
}

export type PostInput = Partial<Omit<Post, "id" | "createdAt" | "updatedAt">>;

export function createPost(input: PostInput): Post {
  const posts = readAll();
  const now = new Date().toISOString();
  const post: Post = {
    id: randomUUID(),
    title: input.title?.trim() || "Untitled",
    content: input.content ?? "",
    platform: input.platform ?? "twitter",
    tone: input.tone,
    status: input.status ?? "draft",
    scheduledAt: input.scheduledAt ?? null,
    engagement: input.engagement ?? null,
    aiGenerated: input.aiGenerated ?? false,
    recycledFrom: input.recycledFrom ?? null,
    createdAt: now,
    updatedAt: now,
  };
  posts.push(post);
  writeAll(posts);
  return post;
}

export function updatePost(id: string, patch: PostInput): Post | null {
  const posts = readAll();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  posts[idx] = { ...posts[idx], ...patch, id, updatedAt: new Date().toISOString() };
  writeAll(posts);
  return posts[idx];
}

export function deletePost(id: string): boolean {
  const posts = readAll();
  const next = posts.filter((p) => p.id !== id);
  if (next.length === posts.length) return false;
  writeAll(next);
  return true;
}

export type Stats = {
  total: number;
  draft: number;
  scheduled: number;
  published: number;
  aiGenerated: number;
  scheduledUpcoming: number;
};

export function getStats(): Stats {
  const posts = readAll();
  const now = new Date().toISOString();
  return {
    total: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    aiGenerated: posts.filter((p) => p.aiGenerated).length,
    scheduledUpcoming: posts.filter(
      (p) => p.status === "scheduled" && p.scheduledAt && p.scheduledAt > now
    ).length,
  };
}
