"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  FileText,
  Calendar,
  Plus,
  Trash2,
  X,
  Check,
  RefreshCw,
  Recycle,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";

type Post = {
  id: string;
  title: string;
  content: string;
  platform: string;
  status: "published" | "scheduled" | "draft";
  scheduledAt: string | null;
  engagement: string | null;
  aiGenerated: boolean;
  recycledFrom?: string | null;
};

const statusVariant = {
  published: "default",
  scheduled: "secondary",
  draft: "outline",
} as const;

const platformLabel: Record<string, string> = {
  twitter: "Twitter / X",
  thread: "Twitter thread",
  linkedin: "LinkedIn",
  blog: "Blog",
  youtube: "YouTube",
};

type Critique = {
  score: number;
  verdict: string;
  strengths: string[];
  fixes: string[];
  hookRewrite: string;
};

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-500 border-emerald-500/40";
  if (score >= 5) return "text-amber-500 border-amber-500/40";
  return "text-red-500 border-red-500/40";
}

export default function ContentPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPlatform, setNewPlatform] = useState("twitter");
  const [saving, setSaving] = useState(false);
  const [recycling, setRecycling] = useState<string | null>(null);
  const [recycleFlash, setRecycleFlash] = useState<Record<string, number>>({});
  const [metricsFor, setMetricsFor] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [metricsFlash, setMetricsFlash] = useState<Record<string, string>>({});
  const [critiqueFor, setCritiqueFor] = useState<string | null>(null);
  const [critiques, setCritiques] = useState<Record<string, Critique>>({});
  const [critiquing, setCritiquing] = useState<string | null>(null);
  const [applyingHook, setApplyingHook] = useState<string | null>(null);
  const [hookFlash, setHookFlash] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<
    | {
        post: { id: string; title: string; platform: string; status: string };
        score: number;
        verdict: string;
        strengths: string[];
        fixes: string[];
        hookRewrite: string;
        error?: string;
      }[]
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPost() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          platform: newPlatform,
          status: "draft",
        }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewContent("");
        setShowNew(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removePost(id: string) {
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function advanceStatus(post: Post) {
    const next =
      post.status === "draft"
        ? "scheduled"
        : post.status === "scheduled"
          ? "published"
          : "draft";
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) await load();
  }

  async function recyclePost(post: Post) {
    setRecycling(post.id);
    try {
      const res = await fetch("/api/recycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, count: 3 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecycleFlash((f) => ({ ...f, [post.id]: data.variants?.length ?? 0 }));
        setTimeout(() => {
          setRecycleFlash((f) => {
            const next = { ...f };
            delete next[post.id];
            return next;
          });
        }, 4000);
        await load();
      }
    } finally {
      setRecycling(null);
    }
  }

  async function critiquePost(post: Post) {
    if (critiqueFor === post.id) {
      setCritiqueFor(null); // toggle closed
      return;
    }
    setCritiqueFor(post.id);
    if (critiques[post.id]) return; // cached for this session
    setCritiquing(post.id);
    try {
      const res = await fetch("/api/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCritiques((c) => ({
          ...c,
          [post.id]: {
            score: data.score,
            verdict: data.verdict,
            strengths: data.strengths ?? [],
            fixes: data.fixes ?? [],
            hookRewrite: data.hookRewrite ?? "",
          },
        }));
      }
    } finally {
      setCritiquing(null);
    }
  }

  async function applyHook(post: Post) {
    const hook = critiques[post.id]?.hookRewrite?.trim();
    if (!hook) return;
    setApplyingHook(post.id);
    try {
      // swap the opening line for the stronger hook, keep the rest
      const nl = post.content.indexOf("\n");
      const newContent = nl < 0 ? hook : hook + post.content.slice(nl);
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      if (res.ok) {
        // stale cache: the critique was scored against the old hook
        setCritiques((c) => {
          const next = { ...c };
          delete next[post.id];
          return next;
        });
        setHookFlash((f) => ({ ...f, [post.id]: "hook applied ✨" }));
        setTimeout(() => {
          setHookFlash((f) => {
            const n = { ...f };
            delete n[post.id];
            return n;
          });
        }, 4000);
        await load();
      }
    } finally {
      setApplyingHook(null);
    }
  }

  async function reviewDrafts() {
    setReviewing(true);
    setReviewQueue(null);
    try {
      const res = await fetch("/api/critique/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft", limit: 8 }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewQueue(data.results ?? []);
      }
    } finally {
      setReviewing(false);
    }
  }

  function openFromQueue(postId: string) {
    const row = reviewQueue?.find((r) => r.post.id === postId);
    const post = posts.find((p) => p.id === postId);
    if (!row || !post) return;
    if (row.error) return; // nothing cached to show; let them re-run single
    // prime the cache so the panel opens instantly without a re-fetch
    setCritiques((c) =>
      c[postId]
        ? c
        : {
            ...c,
            [postId]: {
              score: row.score,
              verdict: row.verdict,
              strengths: row.strengths,
              fixes: row.fixes,
              hookRewrite: row.hookRewrite,
            },
          }
    );
    setCritiqueFor(postId);
    setReviewQueue(null);
  }

  async function saveMetrics(post: Post) {
    const body: Record<string, number> = {};
    for (const k of ["likes", "replies", "reposts", "impressions"] as const) {
      const v = Number(metrics[`${post.id}:${k}`] ?? "");
      if (metrics[`${post.id}:${k}`] !== undefined && metrics[`${post.id}:${k}`] !== "" && Number.isFinite(v)) {
        body[k] = v;
      }
    }
    if (Object.keys(body).length === 0) return;
    const res = await fetch("/api/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, ...body }),
    });
    if (res.ok) {
      setMetricsFor(null);
      setMetrics((m) => {
        const next = { ...m };
        for (const k of Object.keys(body)) delete next[`${post.id}:${k}`];
        return next;
      });
      setMetricsFlash((f) => ({ ...f, [post.id]: "snapshot saved 📈" }));
      setTimeout(() => {
        setMetricsFlash((f) => {
          const n = { ...f };
          delete n[post.id];
          return n;
        });
      }, 3000);
    }
  }

  const filtered = posts.filter((p) => {
    const matchesQuery =
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.content.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || p.status === filter;
    return matchesQuery && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content</h1>
          <p className="text-muted-foreground">
            All your posts, drafts, and scheduled content.
          </p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          className="bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700"
        >
          {showNew ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showNew ? "Cancel" : "New post"}
        </Button>
      </div>

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New draft</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Post title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              placeholder="Content (or generate it in AI Studio and save it here)"
              rows={4}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Select
                value={newPlatform}
                onValueChange={(v) => setNewPlatform(v ?? "twitter")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformLabel).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={createPost} disabled={saving || !newTitle.trim()}>
                <Check className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search posts…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={reviewDrafts}
          disabled={reviewing}
          title="AI-critique every draft, sorted worst-first — your fix queue"
        >
          {reviewing ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin text-fuchsia-500" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4 text-fuchsia-500" />
          )}
          {reviewing ? "Reviewing…" : "Review drafts"}
        </Button>
      </div>

      {reviewing && (
        <Card>
          <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            ✨ Scoring all drafts with the local model — worst offenders will
            float to the top…
          </CardContent>
        </Card>
      )}
      {reviewQueue && (
        <Card className="border-fuchsia-500/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Draft review queue — worst first
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setReviewQueue(null)}
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {reviewQueue.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No drafts with content to critique.
              </p>
            )}
            {reviewQueue.map((row) => (
              <button
                key={row.post.id}
                onClick={() => openFromQueue(row.post.id)}
                disabled={!!row.error}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-fuchsia-500/40 disabled:opacity-60"
              >
                {row.error ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-muted text-xs text-muted-foreground">
                    ✕
                  </span>
                ) : (
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${scoreColor(row.score)}`}
                  >
                    {row.score}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {row.post.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.error ?? row.verdict}
                  </p>
                </div>
                {!row.error && row.fixes.length > 0 && (
                  <Badge variant="outline" className="shrink-0 text-amber-500">
                    {row.fixes.length} fixes
                  </Badge>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {loading && (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading posts…
            </CardContent>
          </Card>
        )}
        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No posts match your filters.
            </CardContent>
          </Card>
        )}
        {filtered.map((post) => (
          <Card
            key={post.id}
            className="transition-colors hover:border-violet-500/30"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{post.title}</CardTitle>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{platformLabel[post.platform] ?? post.platform}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {post.scheduledAt
                          ? format(parseISO(post.scheduledAt), "MMM d, yyyy")
                          : "—"}
                      </span>
                      {post.engagement && (
                        <span>{post.engagement} impressions</span>
                      )}
                      {post.aiGenerated && (
                        <span className="text-violet-500">AI ✦</span>
                      )}
                      {post.recycledFrom && (
                        <span
                          className="text-emerald-600"
                          title={`Recycled from: ${posts.find((p) => p.id === post.recycledFrom)?.title ?? "deleted post"}`}
                        >
                          recycled ♻
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hookFlash[post.id] && (
                    <span className="text-xs text-fuchsia-500">
                      {hookFlash[post.id]}
                    </span>
                  )}
                  {metricsFlash[post.id] && (
                    <span className="text-xs text-emerald-500">{metricsFlash[post.id]}</span>
                  )}
                  {post.status === "published" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setMetricsFor((cur) => (cur === post.id ? null : post.id))
                      }
                      title="Log engagement metrics (feeds the Analytics dashboard)"
                    >
                      <BarChart3 className="h-4 w-4 text-muted-foreground hover:text-cyan-500" />
                    </Button>
                  )}
                  {recycleFlash[post.id] !== undefined && (
                    <span className="text-xs text-emerald-500">
                      +{recycleFlash[post.id]} variants drafted
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => critiquePost(post)}
                    disabled={critiquing === post.id}
                    title="AI critique: score + fixes before you publish"
                  >
                    {critiquing === post.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-fuchsia-500" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-muted-foreground hover:text-fuchsia-500" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => recyclePost(post)}
                    disabled={recycling === post.id}
                    title="AI-recycle: mint 3 fresh angles as drafts"
                  >
                    {recycling === post.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-violet-500" />
                    ) : (
                      <Recycle className="h-4 w-4 text-muted-foreground hover:text-violet-500" />
                    )}
                  </Button>
                  <button
                    onClick={() => advanceStatus(post)}
                    title="Click to move: draft → scheduled → published"
                    className="cursor-pointer"
                  >
                    <Badge variant={statusVariant[post.status]}>
                      {post.status}
                    </Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePost(post.id)}
                    title="Delete post"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {post.content && (
              <CardContent className="pt-0">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {post.content}
                </p>
              </CardContent>
            )}
            {critiqueFor === post.id && (
              <CardContent className="border-t pt-4">
                {critiquing === post.id && (
                  <p className="text-sm text-muted-foreground">
                    ✨ Critiquing with the local model…
                  </p>
                )}
                {critiques[post.id] && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg font-bold ${scoreColor(critiques[post.id].score)}`}
                      >
                        {critiques[post.id].score}
                      </span>
                      <p className="text-sm italic text-muted-foreground">
                        {critiques[post.id].verdict}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {critiques[post.id].strengths.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-500">
                            What works
                          </p>
                          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            {critiques[post.id].strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {critiques[post.id].fixes.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-500">
                            Fix before publishing
                          </p>
                          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            {critiques[post.id].fixes.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {critiques[post.id].hookRewrite && (
                      <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fuchsia-500">
                          Stronger hook
                        </p>
                        <p className="text-sm">{critiques[post.id].hookRewrite}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 border-fuchsia-500/40 text-fuchsia-500 hover:bg-fuchsia-500/10"
                          disabled={applyingHook === post.id}
                          onClick={() => applyHook(post)}
                          title="Replace this post's opening line with the stronger hook"
                        >
                          {applyingHook === post.id ? (
                            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          {applyingHook === post.id
                            ? "Applying…"
                            : "Apply as opening line"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
            {metricsFor === post.id && (
              <CardContent className="border-t pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  {(
                    [
                      ["likes", "Likes"],
                      ["replies", "Replies"],
                      ["reposts", "Reposts"],
                      ["impressions", "Impressions"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">{label}</label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        className="w-28"
                        value={metrics[`${post.id}:${key}`] ?? ""}
                        onChange={(e) =>
                          setMetrics((m) => ({
                            ...m,
                            [`${post.id}:${key}`]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    onClick={() => saveMetrics(post)}
                    className="bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-600 hover:to-violet-700"
                  >
                    <Check className="mr-1 h-3 w-3" /> Save snapshot
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Snapshots stack over time — Analytics charts the trend.
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
