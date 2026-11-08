import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";

/**
 * Ideas inbox — file-backed JSON store for brainstormed content ideas.
 * Same zero-dependency stopgap pattern as store.ts; the swap plan is
 * identical (keep signatures, re-implement with supabase-js).
 *
 * Data lives in <DATA_DIR>/ideas.json (gitignored).
 */

export type Idea = {
  id: string;
  text: string; // the idea itself, one line
  platform: string; // suggested platform (twitter | thread | linkedin | blog | youtube)
  topic: string; // brainstorm seed this idea came from
  usedBy: string | null; // post id once converted to a draft
  createdAt: string;
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const IDEAS_FILE = path.join(DATA_DIR, "ideas.json");

function readAll(): Idea[] {
  if (!existsSync(IDEAS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(IDEAS_FILE, "utf8")) as Idea[];
  } catch {
    return [];
  }
}

function writeAll(ideas: Idea[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${IDEAS_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(ideas, null, 2));
  renameSync(tmp, IDEAS_FILE); // atomic-ish
}

/** Unused ideas first, newest first within each group. */
export function listIdeas(): Idea[] {
  return readAll().sort((a, b) => {
    const au = a.usedBy ? 1 : 0;
    const bu = b.usedBy ? 1 : 0;
    if (au !== bu) return au - bu;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function getIdea(id: string): Idea | null {
  return readAll().find((i) => i.id === id) ?? null;
}

export function addIdeas(
  inputs: { text: string; platform?: string; topic: string }[]
): Idea[] {
  const ideas = readAll();
  const now = new Date().toISOString();
  const created: Idea[] = [];
  for (const input of inputs) {
    const text = input.text.trim();
    if (!text) continue;
    // dedupe: skip near-identical existing unused ideas (case-insensitive)
    const norm = text.toLowerCase();
    if (ideas.some((i) => !i.usedBy && i.text.toLowerCase() === norm)) continue;
    const idea: Idea = {
      id: randomUUID(),
      text,
      platform: input.platform ?? "twitter",
      topic: input.topic,
      usedBy: null,
      createdAt: now,
    };
    ideas.push(idea);
    created.push(idea);
  }
  if (created.length > 0) writeAll(ideas);
  return created;
}

export function deleteIdea(id: string): boolean {
  const ideas = readAll();
  const next = ideas.filter((i) => i.id !== id);
  if (next.length === ideas.length) return false;
  writeAll(next);
  return true;
}

/** Link an idea to the draft post it became. No-op on unknown id. */
export function markUsed(id: string, postId: string): Idea | null {
  const ideas = readAll();
  const idx = ideas.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  ideas[idx] = { ...ideas[idx], usedBy: postId };
  writeAll(ideas);
  return ideas[idx];
}
