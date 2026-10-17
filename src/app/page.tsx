import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Zap,
  BarChart3,
  Sparkles,
  AtSign,
  Briefcase,
  Video,
  Camera,
} from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI Content Generation",
    description:
      "Generate posts, threads, and articles with local AI. No API keys, no per-token billing.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description:
      "Plan a month of content in an afternoon. Drag, drop, done.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description:
      "Track what resonates across every platform from one command center.",
  },
];

const platforms = [
  { icon: AtSign, name: "Twitter / X" },
  { icon: Briefcase, name: "LinkedIn" },
  { icon: Video, name: "YouTube" },
  { icon: Camera, name: "Instagram" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Nav */}
      <header className="border-b border-zinc-800/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Content Engine
            </span>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-50"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-4 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Open App
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-zinc-950 to-zinc-950" />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-xs font-medium text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            Powered by local AI — your content never leaves your machine
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            Ship a month of content{" "}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              in an afternoon
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            Generate, schedule, and analyze content across every platform.
            One command center for creators who ship.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-transform hover:scale-[1.02]"
            >
              Launch Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="rounded-full border border-zinc-800 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              See features
            </a>
          </div>

          {/* Platform badges */}
          <div className="mt-16 flex items-center justify-center gap-8 text-zinc-500">
            {platforms.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <p.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-zinc-800/50 bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything you need to grow
            </h2>
            <p className="mt-4 text-zinc-400">
              Built for indie creators, solo founders, and small teams.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 transition-colors hover:border-violet-500/50"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
                  <f.icon className="h-5 w-5 text-violet-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 text-sm text-zinc-500">
          <span>Content Engine — built by Dani</span>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" />
            <span>25-day build sprint</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
