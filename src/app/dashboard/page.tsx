"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import {
  BarChart3,
  Calendar,
  FileText,
  Mail,
  Rocket,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type Stats = {
  total: number;
  draft: number;
  scheduled: number;
  published: number;
  aiGenerated: number;
  scheduledUpcoming: number;
};

type Post = {
  id: string;
  title: string;
  platform: string;
  status: "published" | "scheduled" | "draft";
  scheduledAt: string | null;
  engagement: string | null;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Post[]>([]);
  const [due, setDue] = useState<Post[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState<number | null>(null);

  async function refresh() {
    const [s, p, d] = await Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/posts").then((r) => r.json()),
      fetch("/api/publish/due").then((r) => r.json()),
    ]);
    setStats(s);
    setRecent((p.posts ?? []).slice(0, 5));
    setDue(d.due ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function publishNow() {
    setPublishing(true);
    try {
      const r = await fetch("/api/publish/due", { method: "POST" }).then((r) =>
        r.json()
      );
      setJustPublished(r.count ?? 0);
      await refresh();
      setTimeout(() => setJustPublished(null), 4000);
    } finally {
      setPublishing(false);
    }
  }

  const cards = [
    { title: "Total Posts", value: String(stats?.total ?? "—"), icon: FileText },
    {
      title: "Scheduled",
      value: String(stats?.scheduledUpcoming ?? "—"),
      icon: Calendar,
    },
    { title: "Published", value: String(stats?.published ?? "—"), icon: TrendingUp },
    { title: "AI Generated", value: String(stats?.aiGenerated ?? "—"), icon: Zap },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your content, track performance, and grow your audience.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                live from local store
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(due.length > 0 || justPublished !== null) && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Publish queue — {due.length} post{due.length === 1 ? "" : "s"} due
            </CardTitle>
            {due.length > 0 && (
              <button
                onClick={publishNow}
                disabled={publishing}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish now"}
              </button>
            )}
          </CardHeader>
          <CardContent>
            {justPublished !== null && (
              <p className="text-sm text-green-500 mb-2">
                🚀 Published {justPublished} post{justPublished === 1 ? "" : "s"}!
              </p>
            )}
            {due.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {due.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Badge variant="secondary">{p.platform}</Badge>
                    <span className="truncate">{p.title}</span>
                    <span className="ml-auto shrink-0 text-xs">
                      due{" "}
                      {p.scheduledAt
                        ? format(parseISO(p.scheduledAt), "MMM d, HH:mm")
                        : "—"}
                    </span>
                  </li>
                ))}
                {due.length > 3 && (
                  <li className="text-xs">…and {due.length - 3} more</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Weekly digest
          </CardTitle>
          <a
            href="/api/digest"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Open email-ready digest
          </a>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Recycle radar picks, publish queue, and the week ahead — rendered
            as paste-ready email HTML. Cron-friendly:{" "}
            <code className="text-xs">curl localhost:3000/api/digest</code>
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Recent Posts</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="space-y-4">
          {recent.length === 0 && (
            <Card>
              <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                No posts yet — generate one in AI Studio.
              </CardContent>
            </Card>
          )}
          {recent.map((post) => (
            <Card key={post.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{post.title}</CardTitle>
                  <Badge
                    variant={
                      post.status === "published"
                        ? "default"
                        : post.status === "scheduled"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {post.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{post.platform}</span>
                  <span>
                    {post.scheduledAt
                      ? format(parseISO(post.scheduledAt), "MMM d, yyyy")
                      : "unscheduled"}
                  </span>
                  {post.engagement && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {post.engagement}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>Content Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Calendar view coming soon...
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <BarChart3 className="h-16 w-16 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
