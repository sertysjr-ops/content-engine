"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Heart, MessageSquare, Repeat2, Eye, Recycle, Lightbulb, Upload } from "lucide-react";

type Snapshot = {
  likes: number;
  replies: number;
  reposts: number;
  impressions: number;
  capturedAt: string;
};

type PostRow = {
  postId: string;
  title: string;
  latest: Snapshot | null;
  snapshots: number;
  history: Snapshot[];
  growth: {
    likes: number;
    replies: number;
    reposts: number;
    impressions: number;
  } | null;
};

type Summary = {
  totals: Snapshot & { postsTracked: number };
  posts: PostRow[];
};

type SuggestionPost = {
  id: string;
  title: string;
  platform: string;
  status: string;
  createdAt: string;
};

type Suggestion = {
  post: SuggestionPost;
  score: number;
  reason: string;
  signals: string[];
};

const SIGNAL_STYLES: Record<string, string> = {
  declining: "bg-red-500/10 text-red-500",
  growing: "bg-emerald-500/10 text-emerald-500",
  "high-reach": "bg-violet-500/10 text-violet-500",
  "thin-data": "bg-amber-500/10 text-amber-500",
  "never-measured": "bg-amber-500/10 text-amber-500",
  aged: "bg-sky-500/10 text-sky-500",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Tiny inline SVG sparkline of a metric over time. No deps, no canvas. */
function Sparkline({
  values,
  width = 88,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");
  const trending = values[values.length - 1] >= values[0];
  const stroke = trending ? "#10b981" : "#ef4444";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-label={`trend ${trending ? "up" : "down"} over ${values.length} captures`}
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recycling, setRecycling] = useState<string | null>(null);
  const [recycleFlash, setRecycleFlash] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErrs, setImportErrs] = useState<{ row: number; detail: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engagement");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/recycle-suggest?limit=3");
      if (res.ok) {
        const body = await res.json();
        setSuggestions(body.suggestions ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadSuggestions();
  }, [load, loadSuggestions]);

  const doRecycle = useCallback(
    async (postId: string) => {
      setRecycling(postId);
      setRecycleFlash(null);
      try {
        const res = await fetch("/api/recycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, count: 3 }),
        });
        if (res.ok) {
          const body = await res.json();
          setRecycleFlash(`+${body.variants?.length ?? 0} variants drafted — find them in Content`);
          loadSuggestions();
        } else {
          setRecycleFlash("recycle failed — is Ollama running?");
        }
      } finally {
        setRecycling(null);
      }
    },
    [loadSuggestions]
  );

  const doImport = useCallback(async () => {
    if (csvText.trim() === "") return;
    setImporting(true);
    setImportMsg(null);
    setImportErrs([]);
    try {
      const res = await fetch("/api/engagement/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const body = await res.json();
      if (res.ok) {
        setImportMsg(`Imported ${body.imported} row${body.imported === 1 ? "" : "s"} ✓`);
        setCsvText("");
        load();
        loadSuggestions();
      } else {
        setImportMsg(body.error ?? "import failed");
      }
      setImportErrs(body.failed ?? []);
    } finally {
      setImporting(false);
    }
  }, [csvText, load, loadSuggestions]);

  const totals = data?.totals;
  const engagements = totals ? totals.likes + totals.replies + totals.reposts : 0;
  const engRate =
    totals && totals.impressions > 0
      ? ((engagements / totals.impressions) * 100).toFixed(1) + "%"
      : "—";

  const kpis = [
    { title: "Impressions", value: totals ? fmt(totals.impressions) : "—", icon: Eye },
    { title: "Engagements", value: totals ? fmt(engagements) : "—", icon: Heart },
    { title: "Engagement rate", value: engRate, icon: TrendingUp },
    { title: "Posts tracked", value: totals ? String(totals.postsTracked) : "—", icon: BarChart3 },
  ];

  // Weekly capture activity: bucket every snapshot's capturedAt into the
  // weekday it happened on — the bar chart shows when you actually pulled
  // numbers (and how the cadence grows once the habit sticks).
  const weekly = [0, 0, 0, 0, 0, 0, 0]; // JS getDay(): Sun=0 … Sat=6
  if (data) {
    for (const p of data.posts) {
      for (const s of p.history ?? []) {
        weekly[new Date(s.capturedAt).getDay()] += 1;
      }
    }
  }
  // Reorder so the visual starts on Monday: Mon,Tue,…,Sun
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => weekly[d]);
  const orderedMax = Math.max(...ordered, 1);
  const hasSnapshots = weekly.some((n) => n > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Real numbers — captured from the Content page, stored as time series.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">
                {loading ? "loading…" : "latest snapshot per post"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-500" />
              Capture Cadence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasSnapshots ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No snapshots yet — bars appear once you log metrics.
              </div>
            ) : (
              <div className="flex h-[200px] items-end justify-between gap-3">
                {ordered.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-violet-600 to-fuchsia-500 transition-all hover:opacity-80"
                      style={{ height: `${(n / orderedMax) * 100}%` }}
                      title={`${n} snapshot${n === 1 ? "" : "s"}`}
                    />
                    <span className="text-xs text-muted-foreground">{DAY_LABELS[i]}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              Top Performing Posts
            </CardTitle>
          </CardHeader>
          <CardContent>
          {!loading && (!data || data.posts.length === 0) && (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>No metrics yet.</span>
              <span className="text-xs">
                Hit the 📈 button on a published post in the Content page to log
                its numbers — snapshots stack up over time and feed this dashboard.
              </span>
            </div>
          )}
          <div className="space-y-4">
            {data?.posts.map((post, i) => {
              const s = post.latest;
              if (!s) return null;
              const postEng = s.likes + s.replies + s.reposts;
              const rate = s.impressions > 0 ? ((postEng / s.impressions) * 100).toFixed(1) : "0.0";
              return (
                <div
                  key={post.postId}
                  className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-sm font-bold text-violet-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(s.impressions)} impressions · {post.snapshots} snapshot
                      {post.snapshots === 1 ? "" : "s"}
                      {post.growth && post.growth.impressions !== 0 && (
                        <span className={post.growth.impressions > 0 ? " text-emerald-500" : " text-red-500"}>
                          {" "}({post.growth.impressions > 0 ? "+" : ""}
                          {fmt(post.growth.impressions)} since first capture)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <Sparkline values={(post.history ?? []).map((h) => h.impressions)} />
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {fmt(s.likes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {fmt(s.replies)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="h-3 w-3" /> {fmt(s.reposts)}
                    </span>
                    <Badge variant="secondary">{rate}%</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Recycle Radar
            <span className="text-xs font-normal text-muted-foreground">
              what to refresh next, scored from your real metrics
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recycleFlash && (
            <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
              {recycleFlash}
            </div>
          )}
          {suggestions.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No published posts to recycle yet.
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => {
                const maxScore = suggestions[0]?.score || 1;
                return (
                  <div
                    key={s.post.id}
                    className="flex items-center gap-4 rounded-lg border p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-500">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{s.post.title}</p>
                        {s.signals.map((sig) => (
                          <Badge
                            key={sig}
                            variant="secondary"
                            className={SIGNAL_STYLES[sig] ?? ""}
                          >
                            {sig}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.reason}</p>
                      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                          style={{ width: `${(s.score / maxScore) * 100}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => doRecycle(s.post.id)}
                      disabled={recycling !== null}
                      className="flex shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                    >
                      <Recycle className="h-3.5 w-3.5" />
                      {recycling === s.post.id ? "working…" : "Recycle"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-sky-500" />
            Import metrics from CSV
            <span className="text-xs font-normal text-muted-foreground">
              paste an export from any platform dashboard
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">
            Header row required. Columns: <code className="rounded bg-muted px-1">post</code> (title or id),{" "}
            <code className="rounded bg-muted px-1">likes</code>,{" "}
            <code className="rounded bg-muted px-1">replies</code>,{" "}
            <code className="rounded bg-muted px-1">reposts</code>,{" "}
            <code className="rounded bg-muted px-1">impressions</code> — aliases like comments/views/retweets work too.
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={4}
            placeholder={"post,likes,replies,reposts,impressions\n10 AI Tools That Will 10x Your Productivity,120,8,15,\"4,500\""}
            className="w-full rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={doImport}
              disabled={importing || csvText.trim() === ""}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
            >
              {importing ? "importing…" : "Import"}
            </button>
            {importMsg && <span className="text-xs text-muted-foreground">{importMsg}</span>}
          </div>
          {importErrs.length > 0 && (
            <div className="mt-2 space-y-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              {importErrs.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-500">
                  row {e.row}: {e.detail}
                </p>
              ))}
              {importErrs.length > 5 && (
                <p className="text-xs text-red-500">…and {importErrs.length - 5} more</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
