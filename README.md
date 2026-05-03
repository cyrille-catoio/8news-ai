# 8news.ai

AI-powered **tech / AI / crypto** intelligence: hundreds of RSS feeds across dynamic topics, AI-scored articles, daily SEO summaries, YouTube transcriptions, and structured video briefings.

**Live:** [8news.ai](https://8news.ai) · **Repo:** [github.com/cyrille-catoio/8news-ai](https://github.com/cyrille-catoio/8news-ai)

## Stack (short)

- **Next.js 16** (App Router) + React 19 + TypeScript  
- **Supabase** (PostgreSQL, Auth)  
- **OpenAI** (scoring, summaries, transcripts, roundups — model split documented in [`SPEC.md`](SPEC.md))  
- **Netlify** (hosting, cron background functions)  
- **ElevenLabs** (TTS), **TranscriptAPI** + optional **YouTube Data API** (video pipeline)

## Prerequisites

- **Node.js 20+**
- Accounts / keys for Supabase, OpenAI, and the services listed under environment variables (full matrix in **SPEC § Environment Variables**).

## Setup

```bash
npm install
```

Copy the example env file and edit:

```bash
cp .env.example .env
```

Minimum variables you typically need locally (details in **SPEC.md** § Environment Variables):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser + API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase access |
| `ELEVENLABS_API_KEY` | Text-to-speech |
| `TRANSCRIPT_API_KEY` | YouTube transcripts |
| `CRON_SECRET` | Bearer for cron-protected routes (if you hit those locally) |

Optional: `YOUTUBE_API_KEY` for reliable Shorts / duration backfill. See [`SPEC.md`](SPEC.md) for the authoritative table and descriptions.

Apply SQL migrations under `migrations/` to your Supabase project when bootstrapping a new database.

## Run locally

```bash
npm run dev
```

Open **http://127.0.0.1:3000** in the browser (Next is configured for `127.0.0.1`).

### If the page does not load

1. Stop any existing dev server (Ctrl+C in that terminal).  
2. Run `npm run dev` again and use the URL printed in the terminal.  
3. If port **3000** is busy, Next.js may choose another port (e.g. **3001**) — follow the terminal output.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server (after `build`) |
| `npm run lint` | ESLint |
| `npm run release:patch` | Version bump + sync `public/version.json` / app strings (see `scripts/release.mjs`) |

## Documentation

| File | Contents |
|------|----------|
| [`SPEC.md`](SPEC.md) | Technical specification — routes, cron, DB, env vars, SEO |
| [`ROADMAP.md`](ROADMAP.md) | Planned work |
| [`src/lib/changelog-entries.ts`](src/lib/changelog-entries.ts) | Release history shown in the app |

For architecture detail, behavior of pipelines, and deployment notes, **`SPEC.md` is the source of truth** — avoid duplicating long sections in this README.
