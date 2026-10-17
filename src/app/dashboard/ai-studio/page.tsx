"use client";

import { useState } from "react";
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
import { Sparkles, Copy, Check, RefreshCw, AlertCircle } from "lucide-react";

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
    </div>
  );
}
