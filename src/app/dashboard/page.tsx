"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Calendar,
  FileText,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const stats = [
  { title: "Total Posts", value: "124", change: "+12%", icon: FileText },
  { title: "Scheduled", value: "23", change: "+5", icon: Calendar },
  { title: "Engagement", value: "8.4%", change: "+2.1%", icon: TrendingUp },
  { title: "AI Generated", value: "89", change: "+34", icon: Zap },
];

const recentPosts = [
  {
    id: 1,
    title: "10 AI Tools That Will 10x Your Productivity",
    platform: "Twitter",
    status: "published",
    date: "2h ago",
    engagement: "1.2k",
  },
  {
    id: 2,
    title: "How I Built a $10K MRR SaaS in 30 Days",
    platform: "LinkedIn",
    status: "scheduled",
    date: "Tomorrow",
    engagement: "—",
  },
  {
    id: 3,
    title: "The Future of No-Code Development",
    platform: "Blog",
    status: "draft",
    date: "Just now",
    engagement: "—",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your content, track performance, and grow your audience.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
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
                <span className="text-emerald-500">{stat.change}</span> from
                last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Recent Posts</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="space-y-4">
          {recentPosts.map((post) => (
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
                  <span>{post.date}</span>
                  {post.engagement !== "—" && (
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
