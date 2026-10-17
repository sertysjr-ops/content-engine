"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileText, Calendar, Plus, MoreHorizontal } from "lucide-react";

type Post = {
  id: number;
  title: string;
  platform: string;
  status: "published" | "scheduled" | "draft";
  date: string;
  engagement?: string;
};

const initialPosts: Post[] = [
  { id: 1, title: "10 AI Tools That Will 10x Your Productivity", platform: "Twitter", status: "published", date: "Jun 12, 2026", engagement: "1.2k" },
  { id: 2, title: "How I Built a $10K MRR SaaS in 30 Days", platform: "LinkedIn", status: "scheduled", date: "Jun 15, 2026" },
  { id: 3, title: "The Future of No-Code Development", platform: "Blog", status: "draft", date: "—" },
  { id: 4, title: "5 Landing Page Mistakes (and fixes)", platform: "Twitter", status: "published", date: "Jun 9, 2026", engagement: "3.4k" },
  { id: 5, title: "Weekly Wins #3", platform: "Twitter", status: "published", date: "Jun 6, 2026", engagement: "890" },
  { id: 6, title: "Launch teaser video", platform: "YouTube", status: "scheduled", date: "Jun 24, 2026" },
];

const statusVariant = {
  published: "default",
  scheduled: "secondary",
  draft: "outline",
} as const;

export default function ContentPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [posts] = useState(initialPosts);

  const filtered = posts.filter((p) => {
    const matchesQuery = p.title.toLowerCase().includes(query.toLowerCase());
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
        <Button className="bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700">
          <Plus className="mr-2 h-4 w-4" />
          New post
        </Button>
      </div>

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
      </div>

      <div className="grid gap-4">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No posts match your filters.
            </CardContent>
          </Card>
        )}
        {filtered.map((post) => (
          <Card key={post.id} className="transition-colors hover:border-violet-500/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{post.title}</CardTitle>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{post.platform}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {post.date}
                      </span>
                      {post.engagement && (
                        <span>{post.engagement} impressions</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[post.status]}>
                    {post.status}
                  </Badge>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
