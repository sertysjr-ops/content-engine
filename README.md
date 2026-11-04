# Content Engine

AI-powered content operations dashboard for creators: generate, schedule,
recycle, and measure posts across X, LinkedIn, threads, and blog — all
from one place. Local-first (Ollama for generation, JSON file store for
persistence), deployable as a single Docker container.

## Features

- **AI Studio** — generate platform-native posts (5 platforms × 5 tones)
  via a local Ollama model; one-click "save to library"
- **Fill my week** — turn one niche topic into 5 varied, deduplicated
  posts auto-scheduled across the next 7 days
- **Content recycling** — mint 3 fresh-angle drafts from any post
  (contrarian / how-to / story / listicle / myth-bust rotation), with
  `recycledFrom` lineage; variants can be recycled again
- **Recycle Radar** — engagement-driven ranking of what to refresh next
  (declining impressions + high reach + age scoring)
- **Auto-publish queue** — `GET /api/publish/due` previews overdue
  scheduled posts, `POST` drains them (scheduled → published); cron-friendly
- **Analytics** — real engagement snapshots per post (manual capture or
  CSV import), KPIs, sparklines with metric switcher, growth badges
- **Calendar** — month grid with scheduled-post chips

## Stack

Next.js (App Router) · React 19 · Tailwind · Base UI · zero-dep JSON file
store (`data/`, atomic writes, Supabase-swappable interface) · Ollama
(`qwen3.5:4b`, `think: false`) for all generation.

## Local dev

```bash
npm install
npm run dev          # http://localhost:3000
```

AI features need [Ollama](https://ollama.com) running locally with a model
pulled (`ollama pull qwen3.5:4b`). Without it the UI still works; only the
generation endpoints fail.

## Test

```bash
npm run build
node test/api.test.mjs   # boots `next start`, runs 44 API/UI checks
```

## Deploy (Docker / Railway / Render / Fly)

The JSON store needs a writable filesystem, so Vercel serverless is out —
use a container host. The repo ships a multi-stage `Dockerfile`
(Next.js standalone output, runs as non-root):

```bash
docker build -t content-engine .
docker run -p 3000:3000 -v content-data:/app/data content-engine
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `/app/data` (Docker) / `./data` (dev) | Where `posts.json` + `engagements.json` live — **mount a volume here** |
| `PORT` | `3000` | Listen port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama host for AI generation (optional in prod) |
| `OLLAMA_MODEL` | `qwen3.5:4b` | Generation model |
| `PUBLISH_WEBHOOK_URLS` | _(none)_ | Comma-separated URLs — every published post is POSTed here as `{event:"post.published", post}` (point at n8n/Make/Zapier to reach real platforms without API keys in this repo) |
| `PUBLISH_WEBHOOK_SECRET` | _(none)_ | If set, deliveries carry `X-Content-Engine-Signature: sha256=<hmac of body>` |

**Railway:** new project → deploy from repo (Dockerfile auto-detected) →
add a volume mounted at `/app/data` → done. Optionally add a cron job
hitting `POST /api/publish/due` every 15 min to auto-publish.

## API sketch

```
GET/POST   /api/posts              list (filters: q, status, platform) / create
PATCH/DELETE /api/posts/[id]       update (e.g. status advance) / delete
GET        /api/stats              dashboard KPIs
POST       /api/generate           single-post generation
POST       /api/generate-week      5 varied posts, auto-scheduled
POST       /api/recycle            {postId} → 3 fresh-angle drafts
GET        /api/recycle-suggest    ranked refresh candidates
GET/POST   /api/engagement         capture snapshots (single + batch)
POST       /api/engagement/import  CSV metrics import
GET/POST   /api/publish/due        preview / drain the publish queue
```
