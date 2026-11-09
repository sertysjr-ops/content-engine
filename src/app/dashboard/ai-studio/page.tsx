"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Copy, Check, RefreshCw, AlertCircle, Save, CalendarPlus, Lightbulb, ArrowRight, X } from "lucide-react";

const platforms = [
  { value: "twitter", label: "Twitter / X post" },
  { value: "thread", label: "Twitter thread" },
  { value: "linkedin", label: "LinkedIn post" },
  { value: "blog", label: "Blog intro" },
  { value: "youtube", label: "YouTube description" },
];

const tones = ["casual", "professional", "funny", "bold", "educational"];

export default function AiStudioPage() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("twitter");
  const [tone, setTone] = useState("casual");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- Fill my week state ---
  const [weekTopic, setWeekTopic] = useState("");
  const [weekTone, setWeekTone] = useState("casual");
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekPosts, setWeekPosts] = useState<
    { id: string; title: string; platform: string; scheduledAt: string }[]
  >([]);
  const [weekError, setWeekError] = useState<string | null>(null);

  // --- Ideas inbox state ---
  type Idea = {
    id: string;
    text: string;
    platform: string;
    topic: string;
    usedBy: string | null;
  };
  const [ideaTopic, setIdeaTopic] = useState("");
  const [ideaCount, setIdeaCount] = useState("5");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [planFlash, setPlanFlash] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    try {
      const res = await fetch("/api/ideas");
      const data = await res.json();
      if (res.ok) setIdeas(data.ideas ?? []);
    } catch {
      /* inbox is best-effort */
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  async function brainstorm() {
    if (!ideaTopic.trim()) return;
    setIdeasLoading(true);
    setIdeasError(null);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: ideaTopic,
          count: Number(ideaCount),
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIdeasError(data.error + (data.hint ? ` — ${data.hint}` : ""));
        return;
      }
      await loadIdeas();
    } catch (err) {
      setIdeasError(String(err));
    } finally {
      setIdeasLoading(false);
    }
  }

  async function ideaToDraft(id: string) {
    setDraftingId(id);
    try {
      const res = await fetch(`/api/ideas/${id}/draft`, { method: "POST" });
      if (res.ok) await loadIdeas();
    } finally {
      setDraftingId(null);
    }
  }

  async function dismissIdea(id: string) {
    await fetch(`/api/ideas/${id}`, { method: "DELETE" });
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  async function ideaToWeek(id: string) {
    setPlanningId(id);
    setPlanFlash(null);
    setIdeasError(null);
    try {
      const res = await fetch(`/api/ideas/${id}/week`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: weekTone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIdeasError(data.error + (data.hint ? ` — ${data.hint}` : ""));
        return;
      }
      setPlanFlash(
        `📅 ${data.posts.length} posts scheduled across ${data.days} days from that idea — see the calendar`
      );
      await loadIdeas();
    } catch (err) {
      setIdeasError(String(err));
    } finally {
      setPlanningId(null);
    }
  }

  async function fillWeek() {
    if (!weekTopic.trim()) return;
    setWeekLoading(true);
    setWeekError(null);
    setWeekPosts([]);
    try {
      const res = await fetch("/api/generate-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: weekTopic, tone: weekTone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWeekError(data.error + (data.hint ? ` — ${data.hint}` : ""));
        return;
      }
      setWeekPosts(
        data.posts.map((p: { id: string; title: string; platform: string; scheduledAt: string }) => ({
          id: p.id,
          title: p.title,
          platform: p.platform,
          scheduledAt: p.scheduledAt,
        }))
      );
    } catch (err) {
      setWeekError(String(err));
    } finally {
      setWeekLoading(false);
    }
  }

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setResult("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, platform, tone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error + (data.hint ? ` — ${data.hint}` : ""));
        return;
      }
      setResult(data.content);
      setModel(data.model);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveToLibrary() {
    if (!result.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            result.split("\n")[0].slice(0, 80) ||
            topic.slice(0, 80) ||
            "AI draft",
          content: result,
          platform,
          tone,
          status: "draft",
          aiGenerated: true,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Studio</h1>
        <p className="text-muted-foreground">
          Generate platform-ready content with local AI. No API keys.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              Prompt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic or idea</label>
              <Textarea
                placeholder='e.g. "5 mistakes new founders make with their landing page"'
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Platform</label>
                <Select value={platform} onValueChange={(v) => setPlatform(v ?? "twitter")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tone</label>
                <Select value={tone} onValueChange={(v) => setTone(v ?? "casual")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tones.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={generate}
              disabled={loading || !topic.trim()}
              className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Output */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Result</CardTitle>
              {model && <Badge variant="secondary">{model}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Generation failed</p>
                  <p className="mt-1 text-red-300/80">{error}</p>
                </div>
              </div>
            )}
            {!error && !result && !loading && (
              <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Your generated content will appear here
              </div>
            )}
            {loading && (
              <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
                Local model is thinking…
              </div>
            )}
            {result && !loading && (
              <div className="space-y-4">
                <div className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">
                  {result}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copy}>
                    {copied ? (
                      <>
                        <Check className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={saveToLibrary} disabled={saving}>
                    {saved ? (
                      <>
                        <Check className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-3.5 w-3.5" />
                        {saving ? "Saving…" : "Save to library"}
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={generate}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Regenerate
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fill my week */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-fuchsia-500" />
            Fill my week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Give it one niche topic — it generates 5 varied posts (hook, thread,
            LinkedIn take, hot take, blog teaser) and schedules them across the
            next 7 days. All saved to your calendar automatically.
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px_auto]">
            <Input
              placeholder='e.g. "building apps with local AI"'
              value={weekTopic}
              onChange={(e) => setWeekTopic(e.target.value)}
            />
            <Select value={weekTone} onValueChange={(v) => setWeekTone(v ?? "casual")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tones.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={fillWeek}
              disabled={weekLoading || !weekTopic.trim()}
              variant="secondary"
              className="bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20"
            >
              {weekLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating 5 posts…
                </>
              ) : (
                <>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Generate week
                </>
              )}
            </Button>
          </div>

          {weekError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Week generation failed</p>
                <p className="mt-1 text-red-300/80">{weekError}</p>
              </div>
            </div>
          )}

          {weekPosts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-400">
                ✅ {weekPosts.length} posts scheduled — see them on the calendar
              </p>
              <ul className="divide-y divide-border rounded-lg border">
                {weekPosts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                  >
                    <span className="truncate">{p.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{p.platform}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(p.scheduledAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ideas inbox */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            Ideas inbox
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Brainstorm a batch of content ideas from one topic. They wait here
            until you turn them into drafts — no pressure, no blank page.
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px_auto]">
            <Input
              placeholder='e.g. "offline AI tools for creators"'
              value={ideaTopic}
              onChange={(e) => setIdeaTopic(e.target.value)}
            />
            <Select value={ideaCount} onValueChange={(v) => setIdeaCount(v ?? "5")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["3", "5", "8", "10"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n} ideas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={brainstorm}
              disabled={ideasLoading || !ideaTopic.trim()}
              variant="secondary"
              className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            >
              {ideasLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Brainstorming…
                </>
              ) : (
                <>
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Brainstorm
                </>
              )}
            </Button>
          </div>

          {ideasError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Brainstorm failed</p>
                <p className="mt-1 text-red-300/80">{ideasError}</p>
              </div>
            </div>
          )}

          {planFlash && (
            <p className="mb-3 text-sm text-emerald-400">{planFlash}</p>
          )}

          {ideas.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border">
              {ideas.map((idea) => (
                <li
                  key={idea.id}
                  className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${
                    idea.usedBy ? "opacity-45" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{idea.text}</span>
                    <span className="text-xs text-muted-foreground">
                      from “{idea.topic}”
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{idea.platform}</Badge>
                    {idea.usedBy ? (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">
                        drafted
                      </Badge>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => ideaToDraft(idea.id)}
                          disabled={draftingId === idea.id}
                        >
                          {draftingId === idea.id ? (
                            <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ArrowRight className="mr-1 h-3.5 w-3.5" />
                          )}
                          draft
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => ideaToWeek(idea.id)}
                          disabled={planningId === idea.id}
                          title={`Generate a full week (${weekTone} tone) from this idea`}
                        >
                          {planningId === idea.id ? (
                            <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                          )}
                          plan week
                        </Button>
                        <button
                          onClick={() => dismissIdea(idea.id)}
                          className="text-muted-foreground hover:text-red-400"
                          title="Dismiss idea"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
