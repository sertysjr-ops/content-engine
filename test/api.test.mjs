#!/usr/bin/env node
/**
 * Integration test for the Content Engine API.
 * Boots `next start` on an ephemeral port, exercises the full post CRUD
 * cycle + stats, then kills the server. Run: node test/api.test.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 3311;
const BASE = `http://localhost:${PORT}`;

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function waitUp(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/stats`);
      if (r.ok) return true;
    } catch {}
    await delay(500);
  }
  return false;
}

let passed = 0;
function check(name, cond, extra = "") {
  if (!cond) {
    console.error(`❌ ${name} ${extra}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${name}`);
    passed++;
  }
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

try {
  if (!(await waitUp())) {
    console.error("server never came up\n" + serverLog);
    process.exit(1);
  }

  // seed data present
  const stats0 = await api("/api/stats");
  check("GET /api/stats seeds 6 posts", stats0.body.total === 6,
    `got ${stats0.body.total}`);

  const list0 = await api("/api/posts");
  check("GET /api/posts returns seeded posts", list0.body.posts?.length === 6);

  // create
  const created = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Test: AI-generated post",
      content: "Hello from the integration test.",
      platform: "twitter",
      status: "draft",
      aiGenerated: true,
    }),
  });
  const post = created.body.post;
  check("POST /api/posts creates", created.status === 201 && !!post?.id);

  // filter
  const q = await api("/api/posts?q=integration");
  check("search q=integration finds it", q.body.posts?.some((p) => p.id === post.id));

  // patch
  const patched = await api(`/api/posts/${post.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "scheduled", scheduledAt: new Date(Date.now() + 86400000).toISOString() }),
  });
  check("PATCH status→scheduled", patched.body.post?.status === "scheduled");

  // delete
  const del = await api(`/api/posts/${post.id}`, { method: "DELETE" });
  check("DELETE removes post", del.status === 200 && del.body.ok === true);

  const gone = await api(`/api/posts/${post.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "x" }),
  });
  check("PATCH deleted post → 404", gone.status === 404);

  const stats1 = await api("/api/stats");
  check("stats back to 6 after delete", stats1.body.total === 6);

  console.log(`\n${passed} checks passed`);
} finally {
  server.kill("SIGTERM");
  await delay(500);
  server.kill("SIGKILL");
}
