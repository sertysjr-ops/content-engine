"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ScheduledPost = {
  id: string;
  title: string;
  platform: string;
  date: Date;
  status: "scheduled" | "draft" | "published";
};

const statusVariant = {
  published: "default",
  scheduled: "secondary",
  draft: "outline",
} as const;

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/posts");
        const data = await res.json();
        setPosts(
          (data.posts ?? [])
            .filter((p: { scheduledAt: string | null }) => p.scheduledAt)
            .map((p: { id: string; title: string; platform: string; scheduledAt: string; status: ScheduledPost["status"] }) => ({
              id: p.id,
              title: p.title,
              platform: p.platform,
              date: parseISO(p.scheduledAt),
              status: p.status,
            }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            Plan and schedule content across platforms.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading schedule…</p>
      )}

      <Card>
        <CardContent className="p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dayPosts = posts.filter((p) => isSameDay(p.date, day));
              const inMonth = isSameMonth(day, currentMonth);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[110px] rounded-lg border p-2 transition-colors ${
                    inMonth
                      ? "border-border bg-card"
                      : "border-transparent bg-muted/30 text-muted-foreground/50"
                  } ${isToday(day) ? "ring-2 ring-violet-500" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        isToday(day) ? "text-violet-500" : ""
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayPosts.map((post) => (
                      <div
                        key={post.id}
                        className="cursor-pointer rounded-md bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
                        title={`${post.title} — ${post.platform} ${format(post.date, "HH:mm")}`}
                      >
                        <div className="truncate">{post.title}</div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{format(post.date, "HH:mm")}</span>
                          <Badge
                            variant={statusVariant[post.status]}
                            className="h-3.5 px-1 text-[9px]"
                          >
                            {post.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
