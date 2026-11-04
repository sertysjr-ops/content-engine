import { createHmac, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import type { Post } from "./store";

/**
 * Outbound webhook dispatch — the automation-friendly stand-in for real
 * platform API publishing (which needs Dani's Twitter/LinkedIn app keys).
 *
 * When posts get published (auto-publish queue or manually), each post is
 * POSTed as JSON to every URL in PUBLISH_WEBHOOK_URLS (comma-separated).
 * Point that at an n8n/Make/Zapier webhook and any downstream platform
 * wiring lives there — zero platform keys in this repo.
 *
 * Optional PUBLISH_WEBHOOK_SECRET adds an X-Content-Engine-Signature header
 * (HMAC-SHA256 of the raw body) so the receiver can verify authenticity.
 *
 * Every attempt is logged to data/webhook-deliveries.json (200-cap ring)
 * for observability; failures never throw — publishing must not break
 * because a webhook is down.
 */

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DELIVERIES_FILE = path.join(DATA_DIR, "webhook-deliveries.json");
const MAX_DELIVERIES = 200;
const TIMEOUT_MS = 10_000;

export type WebhookDelivery = {
  id: string;
  postId: string;
  url: string; // host+path only — never log query strings (may carry secrets)
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  at: string; // ISO
};

export function webhookUrls(): string[] {
  return (process.env.PUBLISH_WEBHOOK_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Strip query/hash before persisting — webhook URLs often carry tokens. */
function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

function readDeliveries(): WebhookDelivery[] {
  if (!existsSync(DELIVERIES_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DELIVERIES_FILE, "utf8")) as WebhookDelivery[];
  } catch {
    return [];
  }
}

export function listDeliveries(limit = 50): WebhookDelivery[] {
  return readDeliveries().slice(-limit).reverse();
}

function recordDelivery(d: WebhookDelivery): void {
  const all = readDeliveries();
  all.push(d);
  const trimmed = all.slice(-MAX_DELIVERIES);
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DELIVERIES_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  renameSync(tmp, DELIVERIES_FILE);
}

export type DispatchResult = {
  url: string; // safeUrl form
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
};

async function postToWebhook(post: Post, url: string): Promise<DispatchResult> {
  const body = JSON.stringify({
    event: "post.published",
    post,
    at: new Date().toISOString(),
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.PUBLISH_WEBHOOK_SECRET;
  if (secret) {
    headers["X-Content-Engine-Signature"] =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result: DispatchResult;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    result = {
      url: safeUrl(url),
      ok: res.ok,
      httpStatus: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    result = {
      url: safeUrl(url),
      ok: false,
      httpStatus: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }

  recordDelivery({
    id: randomUUID(),
    postId: post.id,
    url: result.url,
    ok: result.ok,
    httpStatus: result.httpStatus,
    error: result.error,
    at: new Date().toISOString(),
  });
  return result;
}

/**
 * Fan one published post out to every configured webhook.
 * Returns one result per URL (empty array when none configured).
 */
export async function dispatchPublished(post: Post): Promise<DispatchResult[]> {
  const urls = webhookUrls();
  return Promise.all(urls.map((u) => postToWebhook(post, u)));
}

/** Batch helper for the auto-publish queue. */
export async function dispatchMany(posts: Post[]): Promise<{
  delivered: number;
  failed: number;
  results: DispatchResult[];
}> {
  const nested = await Promise.all(posts.map((p) => dispatchPublished(p)));
  const results = nested.flat();
  return {
    delivered: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
