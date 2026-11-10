#!/usr/bin/env node
/**
 * Integration test for the Content Engine API.
 * Boots `next start` on an ephemeral port, exercises the full post CRUD
 * cycle + stats, then kills the server. Run: node test/api.test.mjs
 */
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 3311;
const BASE = `http://localhost:${PORT}`;

// Mock webhook receiver: captures raw bodies + headers so we can verify
// payloads and HMAC signatures. A second, dead URL is also configured so
// every drain exercises failure isolation too.
const HOOK_PORT = 3312;
const HOOK_SECRET = "whsec-test";
const received = [];
const hookServer = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    received.push({
      url: req.url,
      headers: req.headers,
      raw: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
});
await new Promise((r) => hookServer.listen(HOOK_PORT, r));

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
  env: {
    ...process.env,
    PUBLISH_WEBHOOK_URLS: `http://localhost:${HOOK_PORT}/hook?token=supersecret,http://localhost:33999/dead`,
    PUBLISH_WEBHOOK_SECRET: HOOK_SECRET,
  },
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

  // --- generate-week: bulk AI pack ---
  const week = await api("/api/generate-week", {
    method: "POST",
    body: JSON.stringify({ topic: "test niche: mechanical keyboards", tone: "casual" }),
  });
  check(
    "POST /api/generate-week returns scheduled posts",
    week.status === 200 && week.body.posts?.length >= 3,
    `got ${week.body.posts?.length} posts`
  );
  const weekPosts = week.body.posts ?? [];
  check(
    "week posts all scheduled + aiGenerated",
    weekPosts.every(
      (p) => p.status === "scheduled" && p.aiGenerated === true && p.scheduledAt
    )
  );
  check(
    "week posts scheduled in the future",
    weekPosts.every((p) => new Date(p.scheduledAt).getTime() > Date.now())
  );
  const platformsSeen = new Set(weekPosts.map((p) => p.platform));
  check(
    "week pack has platform variety",
    platformsSeen.size >= 2,
    `platforms: ${[...platformsSeen].join(",")}`
  );

  // cleanup week posts so the store returns to seed state
  for (const p of weekPosts) {
    await api(`/api/posts/${p.id}`, { method: "DELETE" });
  }
  const stats2 = await api("/api/stats");
  check("stats back to 6 after week cleanup", stats2.body.total === 6);

  // --- recycle: mint fresh angles from an existing post ---
  const seedList = await api("/api/posts");
  const source = seedList.body.posts.find((p) => p.title.includes("AI Tools"));
  check("recycle: seed source post exists", !!source);

  const recycle = await api("/api/recycle", {
    method: "POST",
    body: JSON.stringify({ postId: source.id, count: 3 }),
  });
  check(
    "POST /api/recycle returns 3 variants",
    recycle.status === 200 && recycle.body.variants?.length === 3,
    `got ${recycle.body.variants?.length} status=${recycle.status} err=${recycle.body.error ?? ""}`
  );
  const variants = recycle.body.variants ?? [];
  check(
    "variants are drafts, aiGenerated, linked to source",
    variants.every(
      (v) =>
        v.status === "draft" &&
        v.aiGenerated === true &&
        v.recycledFrom === source.id &&
        v.platform === source.platform
    )
  );
  check(
    "variants differ from source content",
    variants.every((v) => v.content.trim() !== source.content.trim())
  );

  const missing = await api("/api/recycle", {
    method: "POST",
    body: JSON.stringify({ postId: "does-not-exist" }),
  });
  check("recycle unknown post → 404", missing.status === 404);

  // cleanup variants
  for (const v of variants) {
    await api(`/api/posts/${v.id}`, { method: "DELETE" });
  }
  const stats3 = await api("/api/stats");
  check("stats back to 6 after recycle cleanup", stats3.body.total === 6);

  // --- engagement: time-series metric snapshots ---
  const pub = seedList.body.posts.find((p) => p.status === "published");
  const eng1 = await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: pub.id, likes: 42, replies: 7, impressions: 1200 }),
  });
  check(
    "POST /api/engagement records a snapshot",
    eng1.status === 200 && eng1.body.recorded?.length === 1 &&
      eng1.body.recorded[0].snapshot.likes === 42
  );

  const eng2 = await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: pub.id, likes: 60, impressions: 1500 }),
  });
  check("second snapshot appends", eng2.status === 200);

  const hist = await api(`/api/engagement?postId=${pub.id}`);
  check(
    "GET history returns both snapshots, chronological",
    hist.body.history?.length === 2 &&
      hist.body.history[1].likes === 60 &&
      hist.body.latest?.impressions === 1500
  );

  const summary = await api("/api/engagement");
  const row = summary.body.posts?.find((r) => r.postId === pub.id);
  check(
    "summary rolls up latest + growth",
    summary.status === 200 &&
      summary.body.totals?.postsTracked >= 1 &&
      row?.growth?.likes === 18 &&
      row?.title === pub.title &&
      Array.isArray(row?.history)
  );

  const batch = await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ entries: [
      { postId: pub.id, reposts: 5 },
      { postId: "does-not-exist", likes: 1 },
      { bogus: true },
    ] }),
  });
  check(
    "batch: good entries recorded, bad ones reported",
    batch.status === 200 &&
      batch.body.recorded?.length === 1 &&
      batch.body.failed?.length === 2
  );

  const badMetric = await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: pub.id, likes: -5 }),
  });
  check("negative metric rejected", badMetric.status === 400 || badMetric.status === 404);

  const orphan = await api("/api/engagement?postId=does-not-exist");
  check("GET unknown post → 404", orphan.status === 404);

  // --- CSV import: bulk capture from platform exports ---
  const csvGood = [
    "post,likes,comments,retweets,views",
    `"${source.title}",120,8,15,"4,500"`,
    `${source.id},121,,,4600`,
  ].join("\n");
  const imp = await api("/api/engagement/import", {
    method: "POST",
    body: JSON.stringify({ csv: csvGood }),
  });
  check(
    "CSV import by title + id (aliases + quoted thousands)",
    imp.status === 200 && imp.body.imported === 2,
    `status=${imp.status} imported=${imp.body.imported} err=${imp.body.error ?? ""}`
  );
  check(
    "CSV snapshot values parsed (4500 from \"4,500\")",
    imp.body.results?.[0]?.snapshot?.likes === 120 &&
      imp.body.results?.[0]?.snapshot?.impressions === 4500 &&
      imp.body.results?.[0]?.snapshot?.replies === 8
  );

  const csvMixed = [
    "post,likes,impressions",
    "No Such Post Ever,10,100",
    `${source.id},notanumber,50`,
    `${source.id},33,700`,
  ].join("\r\n");
  const imp2 = await api("/api/engagement/import", {
    method: "POST",
    body: JSON.stringify({ csv: csvMixed }),
  });
  check(
    "CSV import reports bad rows, still imports good ones (CRLF ok)",
    imp2.status === 200 &&
      imp2.body.imported === 1 &&
      imp2.body.failed?.length === 2 &&
      imp2.body.failed.some((f) => f.detail.includes("not found")) &&
      imp2.body.failed.some((f) => f.detail.includes("bad number"))
  );

  const impBad = await api("/api/engagement/import", {
    method: "POST",
    body: JSON.stringify({ csv: "likes,impressions\n10,20" }),
  });
  check("CSV without post column → 400", impBad.status === 400);

  const impEmpty = await api("/api/engagement/import", {
    method: "POST",
    body: JSON.stringify({ csv: "post,likes" }),
  });
  check("CSV with no data rows → 400", impEmpty.status === 400);

  const csvHist = await api(`/api/engagement?postId=${source.id}`);
  check(
    "CSV captures land in history (chronological)",
    csvHist.body.history?.length >= 2 &&
      csvHist.body.latest?.likes === 33
  );

  // delete the post → its snapshots become invisible to summary
  await api(`/api/posts/${pub.id}`, { method: "DELETE" });
  await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: pub.title, content: pub.content, platform: pub.platform,
      status: "published", engagement: pub.engagement,
    }),
  });
  const summary2 = await api("/api/engagement");
  const orphanRow = summary2.body.posts?.find((r) => r.postId === pub.id);
  check(
    "deleted post's snapshots hidden from summary",
    !orphanRow && summary2.body.totals.postsTracked === 0
  );
  const stats4 = await api("/api/stats");
  check("post store restored to 6 posts", stats4.body.total === 6);

  // --- recycle-suggest: engagement-driven refresh ranking ---
  const rs = await api("/api/recycle-suggest?limit=2");
  check(
    "recycle-suggest: ≤ limit, all published, has score/reason/signals",
    rs.status === 200 &&
      rs.body.suggestions?.length === 2 &&
      rs.body.suggestions.every(
        (s) =>
          s.post.status === "published" &&
          typeof s.score === "number" &&
          s.score > 0 &&
          typeof s.reason === "string" &&
          s.reason.length > 0 &&
          Array.isArray(s.signals) &&
          s.signals.length > 0
      )
  );

  // fresh post with declining impressions must top the radar
  const radarPost = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Radar probe: declining post",
      content: "probe",
      platform: "twitter",
      status: "published",
    }),
  });
  const rp = radarPost.body.post;
  await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: rp.id, likes: 100, impressions: 5000 }),
  });
  await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: rp.id, likes: 101, impressions: 2000 }),
  });
  const rs2 = await api("/api/recycle-suggest?limit=1");
  check(
    "declining post tops radar with 'declining' + 'high-reach' signals",
    rs2.body.suggestions?.[0]?.post.id === rp.id &&
      rs2.body.suggestions[0].signals.includes("declining") &&
      rs2.body.suggestions[0].signals.includes("high-reach"),
    `got ${rs2.body.suggestions?.[0]?.post.title} signals=${rs2.body.suggestions?.[0]?.signals}`
  );
  check(
    "declining reason mentions the drop",
    /declining/.test(rs2.body.suggestions?.[0]?.reason ?? "")
  );
  await api(`/api/posts/${rp.id}`, { method: "DELETE" });

  // --- publish queue: due scheduled posts flip to published ---
  const pastDue = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Queue probe: overdue",
      content: "should have gone out yesterday",
      platform: "twitter",
      status: "scheduled",
      scheduledAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
    }),
  });
  const future = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Queue probe: future",
      content: "not yet",
      platform: "twitter",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    }),
  });
  const overdue = pastDue.body.post;
  const notYet = future.body.post;

  const dueBefore = await api("/api/publish/due");
  check(
    "GET /api/publish/due lists overdue, not future",
    dueBefore.status === 200 &&
      dueBefore.body.due?.some((p) => p.id === overdue.id) &&
      !dueBefore.body.due?.some((p) => p.id === notYet.id)
  );
  check(
    "preview does not mutate (post still scheduled)",
    dueBefore.body.due?.find((p) => p.id === overdue.id)?.status === "scheduled"
  );

  const drained = await api("/api/publish/due", { method: "POST" });
  check(
    "POST /api/publish/due drains everything the preview listed",
    drained.status === 200 &&
      drained.body.count === dueBefore.body.count &&
      drained.body.published?.some((p) => p.id === overdue.id) &&
      !drained.body.published?.some((p) => p.id === notYet.id) &&
      drained.body.published?.every((p) => p.status === "published"),
    `count=${drained.body.count} preview=${dueBefore.body.count}`
  );

  const dueAfter = await api("/api/publish/due");
  check("queue empty after drain", dueAfter.body.count === 0);

  const drainAgain = await api("/api/publish/due", { method: "POST" });
  check(
    "draining an empty queue is a no-op",
    drainAgain.status === 200 && drainAgain.body.count === 0
  );

  const futureStill = await api(`/api/posts?status=scheduled`);
  check(
    "future post untouched by the drain",
    futureStill.body.posts?.some(
      (p) => p.id === notYet.id && p.status === "scheduled"
    )
  );

  await api(`/api/posts/${overdue.id}`, { method: "DELETE" });
  await api(`/api/posts/${notYet.id}`, { method: "DELETE" });
  const stats5 = await api("/api/stats");
  check("post store restored to 6 after queue probes", stats5.body.total === 6);

  // --- webhooks: published posts fan out to PUBLISH_WEBHOOK_URLS ---
  received.length = 0; // ignore deliveries fired by the queue probes above
  const hookProbe = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Webhook probe: overdue",
      content: "fan me out",
      platform: "linkedin",
      status: "scheduled",
      scheduledAt: new Date(Date.now() - 3600000).toISOString(),
    }),
  });
  const hp = hookProbe.body.post;
  const hookDrain = await api("/api/publish/due", { method: "POST" });
  check(
    "drain reports webhook fan-out (1 delivered, 1 failed-dead-url)",
    hookDrain.status === 200 &&
      hookDrain.body.webhooks?.delivered === 1 &&
      hookDrain.body.webhooks?.failed === 1,
    `got ${JSON.stringify(hookDrain.body.webhooks)}`
  );
  check(
    "mock receiver got post.published with the probe post",
    received.length === 1 &&
      (() => {
        const payload = JSON.parse(received[0].raw);
        return (
          payload.event === "post.published" &&
          payload.post?.id === hp.id &&
          payload.post?.title === "Webhook probe: overdue" &&
          payload.post?.status === "published"
        );
      })(),
    `received=${received.length}`
  );
  check(
    "HMAC signature header verifies against the raw body",
    received[0]?.headers["x-content-engine-signature"] ===
      "sha256=" + createHmac("sha256", HOOK_SECRET).update(received[0].raw).digest("hex")
  );

  const whStatus = await api("/api/publish/webhooks");
  check(
    "GET /api/publish/webhooks: config + delivery log, secrets stripped",
    whStatus.status === 200 &&
      whStatus.body.configured?.includes(`http://localhost:${HOOK_PORT}/hook`) &&
      !whStatus.body.configured?.some((u) => u.includes("supersecret")) &&
      whStatus.body.deliveries?.some(
        (d) => d.postId === hp.id && d.ok === true && d.httpStatus === 200
      ) &&
      whStatus.body.deliveries?.some(
        (d) => d.postId === hp.id && d.ok === false && d.error
      ) &&
      !whStatus.body.deliveries?.some((d) => d.url.includes("supersecret")),
    `configured=${JSON.stringify(whStatus.body.configured)}`
  );

  await api(`/api/posts/${hp.id}`, { method: "DELETE" });

  // --- digest: email-ready briefing from existing data ---
  const digestJson = await api("/api/digest?format=json");
  check(
    "digest json: subject + all sections present",
    digestJson.status === 200 &&
      typeof digestJson.body.subject === "string" &&
      digestJson.body.subject.includes("Content digest") &&
      Array.isArray(digestJson.body.radar) &&
      Array.isArray(digestJson.body.dueNow) &&
      Array.isArray(digestJson.body.upcoming) &&
      typeof digestJson.body.stats?.total === "number" &&
      typeof digestJson.body.engagement?.postsTracked === "number"
  );

  // radar probe again so the digest has a known declining pick
  const digPost = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Digest probe: fading banger",
      content: "probe",
      platform: "twitter",
      status: "published",
    }),
  });
  const dp = digPost.body.post;
  await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: dp.id, likes: 50, impressions: 3000 }),
  });
  await api("/api/engagement", {
    method: "POST",
    body: JSON.stringify({ postId: dp.id, likes: 51, impressions: 900 }),
  });
  const digDue = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Digest probe: overdue",
      content: "late",
      platform: "linkedin",
      status: "scheduled",
      scheduledAt: new Date(Date.now() - 3600000).toISOString(),
    }),
  });

  const dj2 = await api("/api/digest?format=json");
  check(
    "digest radar tops with the declining probe",
    dj2.body.radar?.[0]?.postId === dp.id &&
      dj2.body.radar[0].signals.includes("declining"),
    `got ${dj2.body.radar?.[0]?.title}`
  );
  check(
    "digest dueNow contains the overdue probe, upcoming excludes it",
    dj2.body.dueNow?.some((q) => q.postId === digDue.body.post.id) &&
      !dj2.body.upcoming?.some((q) => q.postId === digDue.body.post.id)
  );

  const htmlRes = await fetch(`${BASE}/api/digest`);
  const html = await htmlRes.text();
  check(
    "digest html: text/html, escapes + includes probe titles",
    htmlRes.headers.get("content-type")?.includes("text/html") &&
      html.includes("Digest probe: fading banger") &&
      html.includes("Digest probe: overdue") &&
      html.includes("Content Engine digest")
  );
  check(
    "digest html escapes injected markup in titles",
    await (async () => {
      const evil = await api("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          title: '<img src=x onerror=alert(1)> "quoted"',
          content: "xss",
          platform: "twitter",
          status: "scheduled",
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      const h = await (await fetch(`${BASE}/api/digest`)).text();
      await api(`/api/posts/${evil.body.post.id}`, { method: "DELETE" });
      return (
        !h.includes("<img src=x") &&
        h.includes("&lt;img src=x") &&
        h.includes("&quot;quoted&quot;")
      );
    })()
  );

  await api(`/api/posts/${dp.id}`, { method: "DELETE" });
  await api(`/api/posts/${digDue.body.post.id}`, { method: "DELETE" });
  const stats6 = await api("/api/stats");
  check("post store restored to 6 after digest probes", stats6.body.total === 6);

  // --- critique: AI pre-publish review (live model) ---
  const adhoc = await api("/api/critique", {
    method: "POST",
    body: JSON.stringify({
      content: "just shipped my new app!! its really cool, check it out",
      platform: "twitter",
    }),
  });
  check(
    "POST /api/critique ad-hoc: score 1-10 + verdict + lists + hook rewrite",
    adhoc.status === 200 &&
      Number.isInteger(adhoc.body.score) &&
      adhoc.body.score >= 1 && adhoc.body.score <= 10 &&
      typeof adhoc.body.verdict === "string" && adhoc.body.verdict.length > 5 &&
      Array.isArray(adhoc.body.strengths) &&
      Array.isArray(adhoc.body.fixes) &&
      typeof adhoc.body.hookRewrite === "string" &&
      adhoc.body.platform === "twitter",
    `status=${adhoc.status} body=${JSON.stringify(adhoc.body).slice(0, 200)}`
  );
  check(
    "critique parsed the model's JSON cleanly (no fallback verdict)",
    adhoc.body.parsedCleanly === true &&
      !adhoc.body.verdict.includes("phrased them oddly") &&
      adhoc.body.strengths.length >= 1 && adhoc.body.fixes.length >= 1,
    `verdict=${adhoc.body.verdict}`
  );

  // by post id: platform + postId echo
  const critTarget = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Critique probe",
      content: "10 lessons from 10 years of writing code every single day",
      platform: "linkedin",
      status: "draft",
    }),
  });
  const byId = await api("/api/critique", {
    method: "POST",
    body: JSON.stringify({ id: critTarget.body.post.id }),
  });
  check(
    "POST /api/critique by id: postId + platform echoed, valid score",
    byId.status === 200 &&
      byId.body.postId === critTarget.body.post.id &&
      byId.body.platform === "linkedin" &&
      byId.body.score >= 1 && byId.body.score <= 10,
    `status=${byId.status} body=${JSON.stringify(byId.body).slice(0, 160)}`
  );
  await api(`/api/posts/${critTarget.body.post.id}`, { method: "DELETE" });

  const critMissing = await api("/api/critique", {
    method: "POST",
    body: JSON.stringify({ id: "does-not-exist" }),
  });
  check("critique unknown post id → 404", critMissing.status === 404);

  const critEmpty = await api("/api/critique", {
    method: "POST",
    body: JSON.stringify({}),
  });
  check("critique with neither id nor content → 400", critEmpty.status === 400);

  // --- batch critique: the draft review queue (live model) ---
  const batchProbe1 = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Batch probe weak",
      content: "my app is out. its cool i guess",
      platform: "twitter",
      status: "draft",
    }),
  });
  const batchProbe2 = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Batch probe strong",
      content:
        "I deleted 80% of my app's features. Revenue doubled.\n\nHere's what I kept and why subtraction beats addition:",
      platform: "twitter",
      status: "draft",
    }),
  });

  const critBatch = await api("/api/critique/batch", {
    method: "POST",
    body: JSON.stringify({ status: "draft", limit: 8 }),
  });
  const batchRows = Array.isArray(critBatch.body.results)
    ? critBatch.body.results
    : [];
  const probeRows = batchRows.filter(
    (r) =>
      r.post?.id === batchProbe1.body.post.id ||
      r.post?.id === batchProbe2.body.post.id
  );
  check(
    "POST /api/critique/batch: both probe drafts scored, shape intact",
    critBatch.status === 200 &&
      probeRows.length === 2 &&
      probeRows.every(
        (r) =>
          Number.isInteger(r.score) &&
          r.score >= 1 &&
          r.score <= 10 &&
          typeof r.verdict === "string" &&
          Array.isArray(r.fixes) &&
          !r.error
      ),
    `status=${batch.status} probes=${JSON.stringify(probeRows).slice(0, 200)}`
  );
  const scoredRows = batchRows.filter((r) => !r.error);
  const sortedWorstFirst = scoredRows.every(
    (r, i) => i === 0 || scoredRows[i - 1].score <= r.score
  );
  check(
    "batch results sorted worst-first (failures sink to bottom)",
    sortedWorstFirst &&
      typeof critBatch.body.count === "number" &&
      critBatch.body.count === scoredRows.length,
    `scores=${scoredRows.map((r) => r.score).join(",")}`
  );

  const batchLimit = await api("/api/critique/batch", {
    method: "POST",
    body: JSON.stringify({ status: "draft", limit: 1 }),
  });
  check(
    "batch honors limit=1 (exactly one post critiqued, capped LLM spend)",
    batchLimit.status === 200 &&
      Array.isArray(batchLimit.body.results) &&
      batchLimit.body.results.length === 1,
    `status=${batchLimit.status} n=${batchLimit.body.results?.length}`
  );

  const batchBadStatus = await api("/api/critique/batch", {
    method: "POST",
    body: JSON.stringify({ status: "banana", limit: 1 }),
  });
  check(
    "batch with invalid status falls back to drafts (no crash)",
    batchBadStatus.status === 200 &&
      batchBadStatus.body.status === "draft" &&
      Array.isArray(batchBadStatus.body.results),
    `status=${batchBadStatus.status} body.status=${batchBadStatus.body.status}`
  );

  // --- apply hook rewrite: swap the opening line, keep the rest ---
  const applyProbe = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Hook probe",
      content: "weak opener nobody reads\nsecond line stays\nthird line too",
      platform: "twitter",
      status: "draft",
    }),
  });
  const hookCrit = await api("/api/critique", {
    method: "POST",
    body: JSON.stringify({ id: applyProbe.body.post.id }),
  });
  if (hookCrit.status === 200 && hookCrit.body.hookRewrite?.trim()) {
    const hook = hookCrit.body.hookRewrite.trim();
    // mirror the page's swap: first line out, hook in, rest untouched
    const original = applyProbe.body.post.content;
    const patched =
      hook + original.slice(original.indexOf("\n"));
    const apply = await api(`/api/posts/${applyProbe.body.post.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content: patched }),
    });
    const after = await api(`/api/posts`);
    const updated = (after.body.posts ?? []).find(
      (p) => p.id === applyProbe.body.post.id
    );
    check(
      "apply hook: first line becomes the rewrite, rest of the post preserved",
      apply.status === 200 &&
        updated?.content.split("\n")[0] === hook &&
        updated?.content.includes("second line stays") &&
        updated?.content.includes("third line too"),
      `first=${updated?.content.split("\n")[0]?.slice(0, 80)}`
    );
  } else {
    check("apply hook: critique returned a usable hookRewrite", false,
      `status=${hookCrit.status} hook=${hookCrit.body?.hookRewrite}`);
  }

  for (const probe of [batchProbe1, batchProbe2, applyProbe]) {
    await api(`/api/posts/${probe.body.post.id}`, { method: "DELETE" });
  }
  const stats7 = await api("/api/stats");
  check("post store restored to 6 after critique probes", stats7.body.total === 6);

  // --- ideas inbox: brainstorm → list → draft → delete ---
  const ideas0 = await api("/api/ideas");
  check("GET /api/ideas returns an array", Array.isArray(ideas0.body.ideas));

  const ideasBad = await api("/api/ideas", {
    method: "POST",
    body: JSON.stringify({ topic: "" }),
  });
  check("POST /api/ideas with empty topic → 400", ideasBad.status === 400);

  const brainstorm = await api("/api/ideas", {
    method: "POST",
    body: JSON.stringify({ topic: "offline AI tools for creators", count: 3, platform: "twitter" }),
  });
  const newIdeas = brainstorm.body.ideas ?? [];
  check(
    "POST /api/ideas brainstorms ideas (live LLM)",
    brainstorm.status === 201 && newIdeas.length >= 2 &&
      newIdeas.every((i) => i.text.length >= 12 && i.topic && i.usedBy === null),
    `status=${brainstorm.status} n=${newIdeas.length}`
  );

  const ideaCountClamp = await api("/api/ideas", {
    method: "POST",
    body: JSON.stringify({ topic: "cli tools", count: 99 }),
  });
  check(
    "count=99 is clamped to ≤10",
    ideaCountClamp.status === 201 && (ideaCountClamp.body.ideas ?? []).length <= 10,
    `n=${(ideaCountClamp.body.ideas ?? []).length}`
  );
  // clean the clamp batch — we only care about the count
  for (const i of ideaCountClamp.body.ideas ?? []) {
    await api(`/api/ideas/${i.id}`, { method: "DELETE" });
  }

  if (newIdeas.length > 0) {
    const idea = newIdeas[0];
    const drafted = await api(`/api/ideas/${idea.id}/draft`, { method: "POST" });
    check(
      "POST /api/ideas/[id]/draft creates a draft post",
      drafted.status === 201 &&
        drafted.body.post?.status === "draft" &&
        drafted.body.post?.aiGenerated === true &&
        drafted.body.idea?.usedBy === drafted.body.post?.id,
      `status=${drafted.status}`
    );

    const redraft = await api(`/api/ideas/${idea.id}/draft`, { method: "POST" });
    check("re-drafting a used idea → 409", redraft.status === 409);

    const missingDraft = await api(`/api/ideas/does-not-exist/draft`, { method: "POST" });
    check("drafting unknown idea → 404", missingDraft.status === 404);

    // --- idea → week bridge: plan a full scheduled pack from one idea ---
    const weekIdeaRes = await api("/api/ideas", {
      method: "POST",
      body: JSON.stringify({ topic: "morning routines for developers", count: 2 }),
    });
    const weekIdeas = weekIdeaRes.body.ideas ?? [];
    const weekIdea = weekIdeas[0];
    if (weekIdea) {
      const missingWeek = await api(`/api/ideas/does-not-exist/week`, { method: "POST" });
      check("planning week from unknown idea → 404", missingWeek.status === 404);

      const planned = await api(`/api/ideas/${weekIdea.id}/week`, {
        method: "POST",
        body: JSON.stringify({ tone: "casual" }),
      });
      const pack = planned.body.posts ?? [];
      check(
        "POST /api/ideas/[id]/week schedules a pack (live LLM)",
        planned.status === 201 &&
          pack.length >= 3 &&
          pack.every((p) => p.status === "scheduled" && p.scheduledAt && p.aiGenerated) &&
          planned.body.idea?.usedBy === pack[0]?.id &&
          typeof planned.body.days === "number",
        `status=${planned.status} n=${pack.length}`
      );

      const replan = await api(`/api/ideas/${weekIdea.id}/week`, { method: "POST" });
      check("re-planning a used idea → 409", replan.status === 409);

      // cleanup: pack posts, then every idea this probe brainstormed
      for (const p of pack) {
        await api(`/api/posts/${p.id}`, { method: "DELETE" });
      }
    }
    for (const i of weekIdeas) {
      await api(`/api/ideas/${i.id}`, { method: "DELETE" });
    }

    // ideas list: used idea sinks below unused ones
    const ideasAfter = await api("/api/ideas");
    const list = ideasAfter.body.ideas ?? [];
    const idx = list.findIndex((i) => i.id === idea.id);
    const firstUnused = list.findIndex((i) => !i.usedBy);
    check(
      "used ideas sort below unused ones",
      idx === -1 || firstUnused === -1 || idx > firstUnused
    );

    // cleanup: delete the created post + all brainstormed ideas
    if (drafted.body.post?.id) {
      await api(`/api/posts/${drafted.body.post.id}`, { method: "DELETE" });
    }
  }
  for (const i of newIdeas) {
    await api(`/api/ideas/${i.id}`, { method: "DELETE" });
  }
  const del404 = await api(`/api/ideas/does-not-exist`, { method: "DELETE" });
  check("DELETE unknown idea → 404", del404.status === 404);
  const stats8 = await api("/api/stats");
  check("post store restored to 6 after ideas probes", stats8.body.total === 6);

  // --- thread mode: split content into a numbered X thread ---
  const LONG_FORM =
    "Most creators fail because they treat content like a lottery ticket instead of a system. " +
    "They post when they feel inspired, wonder why nothing compounds, and quit after six weeks. " +
    "The accounts that grow do three boring things every single week: they batch ideas on Sunday, " +
    "they recycle what already worked into new angles, and they schedule everything so consistency " +
    "never depends on motivation. None of this requires talent. It requires a calendar and the " +
    "discipline to ship when the post is good enough, not perfect. Your twentieth systematized post " +
    "will beat your first inspired one almost every time, because the algorithm rewards cadence " +
    "and your audience rewards reliability. Build the machine first, then let creativity ride on it.";

  const adhocThread = await api("/api/threadify", {
    method: "POST",
    body: JSON.stringify({ content: LONG_FORM, title: "Content systems", count: 5 }),
  });
  const adhocTweets = adhocThread.body.tweets ?? [];
  check(
    "POST /api/threadify splits ad-hoc content (live LLM)",
    adhocThread.status === 200 &&
      adhocTweets.length >= 2 &&
      adhocTweets.length <= 6 &&
      adhocTweets.every((t) => typeof t.text === "string" && t.text.length > 0) &&
      adhocTweets.every((t) => t.chars === t.text.length && t.chars <= 280) &&
      typeof adhocThread.body.fallback === "boolean",
    `status=${adhocThread.status} n=${adhocTweets.length}`
  );

  const noBody = await api("/api/threadify", {
    method: "POST",
    body: JSON.stringify({}),
  });
  check("threadify with neither postId nor content → 400", noBody.status === 400);

  const missingPost = await api("/api/threadify", {
    method: "POST",
    body: JSON.stringify({ postId: "does-not-exist" }),
  });
  check("threadify unknown postId → 404", missingPost.status === 404);

  // save flow: real post → scheduled thread, staggered and linked
  const src = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Threadify probe",
      content: LONG_FORM,
      platform: "blog",
      status: "draft",
    }),
  });
  const srcId = src.body.post?.id;
  if (srcId) {
    const scheduled = await api("/api/threadify", {
      method: "POST",
      body: JSON.stringify({ postId: srcId, count: 4, save: true, schedule: true }),
    });
    const saved = scheduled.body.saved?.posts ?? [];
    const threadIds = new Set(saved.map((p) => p.threadId));
    check(
      "threadify save+schedule mints a linked, staggered thread",
      scheduled.status === 201 &&
        saved.length >= 2 &&
        saved.every((p) => p.platform === "thread" && p.status === "scheduled") &&
        saved.every((p) => p.recycledFrom === srcId) &&
        threadIds.size === 1 &&
        saved.map((p) => p.threadIndex).join(",") ===
          saved.map((_, i) => i + 1).join(",") &&
        saved.every(
          (p, i) => i === 0 || p.scheduledAt > saved[i - 1].scheduledAt
        ) &&
        scheduled.body.source?.id === srcId,
      `status=${scheduled.status} n=${saved.length}`
    );

    // the source post itself is untouched
    const listAfter = await api("/api/posts");
    const srcAfter = (listAfter.body.posts ?? []).find((p) => p.id === srcId);
    check(
      "threadify leaves the source post unmodified",
      srcAfter?.content === LONG_FORM && srcAfter?.status === "draft"
    );

    // cleanup: the thread tweets, then the source
    for (const p of saved) {
      await api(`/api/posts/${p.id}`, { method: "DELETE" });
    }
    await api(`/api/posts/${srcId}`, { method: "DELETE" });
  } else {
    check("threadify save probe setup (create source post)", false);
  }

  // --- threadify edited save: client tweets skip the LLM, saved verbatim ---
  const editSrc = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Edited thread probe",
      content: "source content the llm would normally split",
      platform: "blog",
      status: "draft",
    }),
  });
  const editSrcId = editSrc.body.post?.id;
  if (editSrcId) {
    const EDITED = [
      "1/ I rewrote this opener by hand",
      "2/ this middle tweet was edited too   ",
      "3/ and the closer is all mine",
    ];
    const editedSave = await api("/api/threadify", {
      method: "POST",
      body: JSON.stringify({ postId: editSrcId, tweets: EDITED, save: true }),
    });
    const editSaved = editedSave.body.saved?.posts ?? [];
    check(
      "edited tweets save verbatim, enumeration de-duped, LLM skipped",
      editedSave.status === 201 &&
        editedSave.body.edited === true &&
        editedSave.body.model === null &&
        editSaved.length === 3 &&
        // "1/ " the user typed is stripped, server adds its own exactly once
        editSaved[0].content === "1/ I rewrote this opener by hand" &&
        editSaved[1].content === "2/ this middle tweet was edited too" &&
        editSaved[2].content === "3/ and the closer is all mine" &&
        editSaved.every((p) => p.platform === "thread" && p.status === "draft") &&
        editSaved.every((p) => p.aiGenerated === false) &&
        new Set(editSaved.map((p) => p.threadId)).size === 1 &&
        editSaved.map((p) => p.threadIndex).join(",") === "1,2,3",
      `status=${editedSave.status} first=${editSaved[0]?.content?.slice(0, 60)}`
    );

    const tooFew = await api("/api/threadify", {
      method: "POST",
      body: JSON.stringify({ postId: editSrcId, tweets: ["only one"], save: true }),
    });
    check("edited tweets with <2 non-empty → 400", tooFew.status === 400);

    const noSave = await api("/api/threadify", {
      method: "POST",
      body: JSON.stringify({ postId: editSrcId, tweets: ["a", "b"] }),
    });
    check("tweets without save:true → 400", noSave.status === 400);

    for (const p of editSaved) {
      await api(`/api/posts/${p.id}`, { method: "DELETE" });
    }
    await api(`/api/posts/${editSrcId}`, { method: "DELETE" });
  } else {
    check("edited save probe setup (create source post)", false);
    check("edited tweets with <2 non-empty → 400", false);
    check("tweets without save:true → 400", false);
  }

  const stats9 = await api("/api/stats");
  check("post store restored to 6 after threadify probes", stats9.body.total === 6);

  console.log(`\n${passed} checks passed`);
} finally {
  server.kill("SIGTERM");
  await delay(500);
  server.kill("SIGKILL");
  hookServer.close();
}
