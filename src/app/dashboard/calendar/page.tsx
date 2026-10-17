"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

type ScheduledPost = {
  id: number;
  title: string;
  platform: string;
  date: Date;
  status: "scheduled" | "draft" | "published";
};

const scheduledPosts: ScheduledPost[] = [
  { id: 1, title: "10 AI tools thread", platform: "Twitter", date: new Date(2026, 5, 12, 10, 0), status: "published" },
  { id: 2, title: "$10K MRR case study", platform: "LinkedIn", date: new Date(2026, 5, 15, 9, 0), status: "published" },
  { id: 3, title: "No-code future post", platform: "Blog", date: new Date(2026, 5, 18, 14, 0), status: "scheduled" },
  { id: 4, title: "Launch teaser", platform: "Twitter", date: new Date(2026, 5, 21, 12, 0), status: "scheduled" },
  { id: 5, title: "Behind the build vlog", platform: "YouTube", date: new Date(2026, 5, 24, 17, 0), status: "draft" },
  { id: 6, title: "Weekly wins #4", platform: "Twitter", date: new Date(2026, 5, 27, 10, 0), status: "scheduled" },
];

const statusVariant = {
  published: "default",
  scheduled: "secondary",
  draft: "outline",
} as const;

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 5, 1));

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
          <Button className="ml-2 bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700">
            <Plus className="mr-2 h-4 w-4" />
            New post
          </Button>
        </div>
      </div>

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
              const dayPosts = scheduledPosts.filter((p) =>
                isSameDay(p.date, day)
              );
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
