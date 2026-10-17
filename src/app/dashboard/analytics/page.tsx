"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Users,
  Heart,
  MessageSquare,
  Share2,
  Eye,
} from "lucide-react";

const kpis = [
  { title: "Total Impressions", value: "48.2k", change: "+18%", icon: Eye },
  { title: "Engagements", value: "3,914", change: "+9%", icon: Heart },
  { title: "New Followers", value: "+412", change: "+22%", icon: Users },
  { title: "Click-throughs", value: "1,208", change: "+14%", icon: Share2 },
];

const topPosts = [
  { title: "5 Landing Page Mistakes (and fixes)", platform: "Twitter", impressions: "3.4k", engagement: "12.4%", comments: 34 },
  { title: "10 AI Tools That Will 10x Your Productivity", platform: "Twitter", impressions: "1.2k", engagement: "9.1%", comments: 12 },
  { title: "How I Built a $10K MRR SaaS in 30 Days", platform: "LinkedIn", impressions: "890", engagement: "7.8%", comments: 28 },
  { title: "Weekly Wins #3", platform: "Twitter", impressions: "890", engagement: "6.2%", comments: 8 },
];

// Simple sparkline bars (pure CSS, no chart lib needed yet)
const weeklyBars = [42, 58, 35, 71, 66, 89, 54];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Performance across all platforms, last 30 days.
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
                <span className="text-emerald-500">{kpi.change}</span> vs
                previous period
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly activity sparkline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-500" />
              Weekly Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-[200px] items-end justify-between gap-3">
              {weeklyBars.map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-violet-600 to-fuchsia-500 transition-all hover:opacity-80"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top posts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              Top Performing Posts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topPosts.map((post, i) => (
                <div
                  key={post.title}
                  className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-sm font-bold text-violet-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {post.platform} · {post.impressions} impressions
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <Badge variant="secondary">{post.engagement}</Badge>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {post.comments}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
