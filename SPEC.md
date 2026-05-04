# 8news.ai — Technical Specification

**Version**: v2.5.4
**Last updated**: 25 April 2026

---

## 1. Overview

**8news.ai** is an AI-powered tech / AI / crypto intelligence platform built around two complementary content pipelines:

1. **RSS articles** — fetched from 400+ curated feeds across **dynamic, database-driven topics**, pre-scored 1-10 with AI via scheduled Netlify cron jobs, stored in Supabase, and surfaced as a daily Top 50 (homepage feed) and per-topic SEO daily summary pages.
2. **YouTube transcriptions** — for a curated set of channels, the cron pre-transcribes every "today's" video (≥ 120 s) in EN+FR, GPT-summarises each one into a Markdown article, and aggregates them per topic per day into structured 8-bullet "video roundup" briefings.

Both pipelines feed into a hybrid rendering model: a black-and-gold **client-side SPA at `/app`** for the authenticated / power-user surface, plus a **server-rendered SEO surface** at `/`, `/briefings`, `/summaries`, `/[topic]`, `/[topic]/[date]/[slug]`, `/[topic]/v/[date]/[slug]` and `/[topic]/r/[date]/[slug]` for indexability.

**OpenAI models in use**:
- `gpt-4.1-nano` — per-article scoring (1-10) and per-topic Relevant-articles summary (`/api/news` flow).
- `gpt-4.1-mini` — daily SEO summaries (`/api/summaries`), synchronous on-demand video transcription (`/api/youtube-channels/transcribe`, fallback path < 30 s).
- `gpt-5.3-chat-latest` — homepage Top 50 grouped summary (`/api/news/top-summary`), per-topic-per-day video roundups (`generate-video-roundup.ts`), and **v2.5.4+** the background pre-warm video transcription cron (`cron-video-transcribe-background`).

**Tagline**: "Tech / AI / Crypto" (same EN + FR — sub on the landing varies per surface).

**Live URL**: https://8news.ai
**Repository**: https://github.com/cyrille-catoio/8news-ai

### 1.1 Surfaces — quick map

| URL | Rendering | Purpose |
|---|---|---|
| `/` | SSR | Marketing landing (hero, ticker, stats, YT, how-it-works, topics, pricing, FAQ, CTA, footer) |
| `/app` and `/app/<page>` | Client SPA (rewritten via `next.config.ts`) | Briefing homepage + Top 50 / Videos / Stats / Crons / Topics / Settings / etc. |
| `/briefings` | SSR | Public hub: every video roundup grouped by date desc |
| `/summaries` | SSR + client | Public hub: daily SEO summaries explorer |
| `/[topic]` | SSR | Per-topic hub (paginated daily summaries + recent video pages) |
| `/[topic]/[date]/[slug]` | SSR | Daily SEO summary page (bullets + articles + JSON-LD + hreflang) |
| `/[topic]/v/[date]/[slug]` | SSR | Per-video transcribed-summary page |
| `/[topic]/r/[date]/[slug]` | SSR | Per-topic-per-day **video roundup** (8-bullet briefing) |
| `/sitemap.xml` | SSR | Dynamic sitemap covering all SSR pages |

### 1.2 Auth + roles

**Optional Supabase Auth** (email + password). All public surfaces (landing, briefings, summaries, SSR pages, the `/app` Briefing homepage / Top 50 / Daily Summaries / Videos) are usable without signing in.

`user_metadata` carries:
- `first_name`, `last_name` — editable in Settings → My Account.
- `user_type` — `member` (default at sign-up) or `owner`. Only `owner` may use Topics, Feed management, Categories, Daily Summaries (admin), YouTube Channels, and Users.
- **v2.5.3+** `preferred_lang` — `en` | `fr`. Persisted on every language toggle (cookie + `auth.users.raw_user_meta_data`) so signed-in users keep their language across SSR navigation. Resolution priority on SSR pages: `?lang=` query param → `preferred_lang` → cookie `lang` → page default. Anonymous users use the cookie only.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | ^5 |
| Frontend | React | 19.2.3 |
| CSS | `globals.css` (tables, grids, keyframes) + `landing.css` (SSR landing only) + `theme.ts` tokens + inline styles | — |
| RSS Parsing | rss-parser | ^3.13.0 |
| AI (text analysis) | OpenAI API — `gpt-4.1-nano` (scoring + per-topic relevant summary), `gpt-4.1-mini` (daily SEO summaries + sync video transcription fallback), `gpt-5.3-chat-latest` (Top-50 grouped summary, video roundups, **v2.5.4+** pre-warm video transcription cron) | via `openai` ^6.25.0 |
| AI (text-to-speech) | ElevenLabs API — `eleven_flash_v2_5` model | via REST API |
| YouTube transcription | TranscriptAPI — `/channel/latest` (free), `/channel/resolve` (free), `/transcript` (1 credit) | via REST API |
| YouTube metadata | YouTube Data API v3 — `/videos?part=contentDetails` to backfill `youtube_videos.duration_sec` (Shorts filter) | via REST API |
| Markdown rendering | `react-markdown` (dynamic import, SSR disabled in SPA / inline in SSR pages) | ^9 |
| Database | Supabase (PostgreSQL) | via `@supabase/supabase-js` ^2.99.2 |
| Auth (session cookies) | Supabase Auth + `@supabase/ssr` ^0.10.2 — browser anon client + `middleware.ts` refresh + `resolveServerLang()` SSR helper | — |
| Hosting | Netlify | via `@netlify/plugin-nextjs` ^5.15.8 |
| Cron Jobs | Netlify Background Functions (15 min budget) triggered every minute for fetching or every 15 min for scoring/transcribe/summary/roundup/video-summary-score by **cron-job.org** | `@netlify/functions` ^5.1.4 |
| Domain | 8news.ai (redirect from 8news.netlify.app) | |

---

## 3. Project Structure

```
8news/
├── middleware.ts                       # Supabase session cookie refresh on each matched request
├── next.config.ts                      # Rewrites every /app/* SPA route to /app (otherwise hard refreshes 404)
├── public/
│   ├── logo-8news.png                  # App logo (PNG, "8" gold / "news" light grey)
│   ├── favicon.svg                     # Browser favicon — gold "8" on black, 512×512
│   ├── apple-touch-icon.svg            # iOS home screen icon — gold "8" on black, 180×180
│   ├── version.json                    # {"version":"2.5.4"} — kept in sync by `scripts/release.mjs`
│   └── landing/                        # Landing assets (yt-summary-preview.png, etc.)
├── scripts/
│   └── release.mjs                     # Single-source-of-truth version sync — bumps version.json, APP_VERSION, landing copy, footer
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout, metadata, favicons, AuthProvider, Google Analytics, SSR footer hook
│   │   ├── providers.tsx               # AuthProvider / useAuth (Supabase session, exposes user + session)
│   │   ├── globals.css                 # Global CSS reset + base styles
│   │   ├── landing.css                 # Landing-only stylesheet (loaded only by `/`)
│   │   ├── page.tsx                    # SSR landing page (composed of LandingNav/Hero/Ticker/Stats/YT/How/Topics/Pricing/FAQ/CTA/Footer)
│   │   ├── sitemap.ts                  # Dynamic sitemap.xml — every active topic hub, every daily summary, every roundup, every per-video page
│   │   ├── app/
│   │   │   └── page.tsx                # **The SPA**: client shell with currentPage router (Briefing → Top 50 → Videos → Stats → Crons → Topics → Settings → …). Default landing page is the **Briefing** (BriefingPage) since v2.x.
│   │   ├── briefings/
│   │   │   └── page.tsx                # SSR `/briefings` hub — every video roundup grouped by date desc, EN+FR
│   │   ├── summaries/
│   │   │   └── page.tsx                # SSR `/summaries` hub — daily SEO summaries explorer (SSR section + client SummaryExplorer)
│   │   ├── [topic]/
│   │   │   ├── layout.tsx              # Minimal passthrough layout
│   │   │   ├── page.tsx                # Topic hub: paginated daily summaries + recent video pages list
│   │   │   ├── [date]/[slug]/page.tsx  # Daily summary page (bullets + articles + JSON-LD + hreflang + prev/next)
│   │   │   ├── v/[date]/[slug]/page.tsx  # SSR per-video transcribed-summary page (with related videos block)
│   │   │   └── r/[date]/[slug]/page.tsx  # SSR per-topic-per-day **video roundup** (8-bullet briefing + ItemList of covered videos)
│   │   ├── components/                 # Shared feature UI — see §3.1
│   │   └── api/                        # API routes — see §3.2
│   ├── hooks/
│   │   ├── useTopFeed.ts               # Top 50 hook (`/api/news/top?limit=50&days=1&lang=`), poll on Briefing-with-no-topic, lastUpdatedAt
│   │   ├── useUserTopics.ts            # Per-user topic personalization (8/36 topics)
│   │   ├── useFavorites.ts             # Article favorites (Set of URLs, optimistic toggle, auth-gated)
│   │   └── useCryptoPrices.ts          # **v2.5.17+**: Live BTC/ETH/SOL/XRP prices for the AppHeader CryptoTicker (60 s poll, visibility-aware, single CoinGecko call/min shared across all users)
│   └── lib/
│       ├── types.ts                    # TypeScript interfaces (TopicItem, TopicDetail, SummaryResponse, ArticleSummary, …)
│       ├── theme.ts                    # Design tokens (colors, fonts, shared styles)
│       ├── i18n.ts                     # EN/FR translation strings (1000+ lines)
│       ├── constants.ts                # Cross-cutting constants
│       ├── supabase.ts                 # Service-role client + caching + article/topic/feed/video queries (server only)
│       ├── supabase-browser.ts         # `createBrowserSupabaseClient()` — anon key for browser auth
│       ├── auth-api.ts                 # `getSessionUser()`, `requireOwnerSession()` (cookie session helpers)
│       ├── server-lang.ts              # **v2.5.3+**: `resolveServerLang()` — query > user_metadata.preferred_lang > cookie > default
│       ├── user-type.ts                # `user_type` metadata — `member` | `owner`; `isOwnerUser()`
│       ├── html.ts                     # HTML entity decoder
│       ├── slug.ts                     # `slugifyVideoTitle`, `uniquifyVideoSlug` (SEO slug generation)
│       ├── summary-headings.ts         # `normalizeSummaryHeadings()` — KEY POINTS / INTRO renaming per lang
│       ├── cookies.ts                  # getCookie / setCookie (client prefs: lang, maxArticles, TTS)
│       ├── topics.ts                   # Topic list helpers (active topics, sort)
│       ├── fetch-topic-dynamic.ts      # RSS fetch + upsert (used by API + cron)
│       ├── score-topic-dynamic.ts      # AI scoring batches → Supabase (used by API + cron)
│       ├── ai-analyze.ts               # Shared OpenAI analysis helpers (analyzeWithAI, prompts/messages)
│       ├── generate-daily-summary.ts   # Daily SEO summary generation (`gpt-4.1-mini`, AI + DB insert + bullets mirror)
│       ├── generate-video-roundup.ts   # **v2.4+**: Per-topic-per-day video roundup (`gpt-5.3-chat-latest`, 8 bullets, 48 h source window)
│       ├── transcribe-video.ts         # **v2.5+**: Core video transcription pipeline — extracted from /api/youtube-channels/transcribe so it's shared between the sync route (`gpt-4.1-mini`, 25 s timeout) and the cron pre-warm (**v2.5.4+** `gpt-5.3-chat-latest`, 180 s timeout)
│       ├── transcript-api.ts           # TranscriptAPI client (resolve, latest, transcript)
│       ├── youtube-duration.ts         # `enrichDurations()` — YouTube Data API v3 backfill of `youtube_videos.duration_sec` (Shorts filter)
│       ├── landing-content.ts          # Static content for the SSR landing page (EN+FR copy, pricing plans)
│       └── changelog-entries.ts        # Release entries (auto-synced to DB on first /api/changelog after deploy)
├── netlify/
│   └── functions/
│       ├── shared/
│       │   ├── fetch-topic.ts                  # Re-exports `@/lib/fetch-topic-dynamic` for cron bundling
│       │   ├── score-topic.ts                  # Re-exports `@/lib/score-topic-dynamic` for cron bundling
│       │   └── transcribe-video.ts             # **v2.5+**: Re-exports `@/lib/transcribe-video` for cron bundling
│       ├── cron-fetching-background.ts         # Multi-pass RSS fetch (15 min wall budget, external cadence)
│       ├── cron-scoring-background.ts          # Multi-pass AI scoring (15 min wall budget, every 15 min)
│       ├── cron-daily-summary-background.ts    # Daily SEO summary generation (every 15 min, all topics × EN+FR, skip-if-exists)
│       ├── cron-video-roundup-background.ts    # **v2.4+**: Per-topic-per-day roundups, **v2.4.1+** 48 h source window
│       └── cron-video-transcribe-background.ts # **v2.5+**: Pre-warm transcribe of every "today's" video, EN+FR; **v2.5.4+** uses `gpt-5.3-chat-latest` with a 180 s OpenAI timeout
├── migrations/
│   ├── 001-topics-feeds.sql                # topics + feeds tables, seed 8 topics + ~160 feeds
│   ├── 002-prompts.sql                     # prompt_en/prompt_fr columns, seed prompts
│   ├── 003-topic-anthropic.sql             # Anthropic topic with scoring + prompts
│   ├── 004-feeds-anthropic.sql             # 20 RSS feeds for Anthropic
│   ├── 005-changelog.sql                   # changelog table + seed
│   ├── 006-topic-display.sql               # topics.is_displayed
│   ├── 007-user-topic-preferences.sql      # Per-user topic personalization table
│   ├── 008-categories.sql                  # Topic categories table + FK on topics
│   ├── 009-fix-sort-order.sql              # Re-sequence sort_order values
│   ├── 010-user-favorites.sql              # Per-user article favorites table
│   ├── 011-daily-summaries.sql             # daily_summaries + summary_bullets tables (SEO)
│   ├── 012-enable-rls-all-tables.sql       # RLS on all public tables
│   ├── 013-youtube-channels.sql            # YouTube channels table
│   ├── 014-video-transcriptions.sql        # youtube_videos cache, video_transcriptions, summary_bullets.source_type + video_transcription_id
│   ├── 015-daily-summaries-slug-guard.sql  # CHECK on daily_summaries.slug_keywords (kebab-case, NOT VALID)
│   ├── 016-video-pages.sql                 # **v2.x+**: video_transcriptions.slug_keywords + published_date + idx_vt_route + idx_vt_topic_recent
│   ├── 017-video-roundups.sql              # **v2.4+**: video_roundups table (per-topic-per-day briefings)
│   ├── 018-roundup-bullets.sql             # **v2.4+**: summary_bullets.video_roundup_id + idx_bullets_video_roundup
│   ├── 019-articles-title-ai.sql           # **v2.5.x**: articles.title_ai_en / title_ai_fr (AI-translated titles for the Top story hero)
│   ├── 020-crypto-cache.sql                # **v2.5.17+**: crypto_prices cache (BTC/ETH/SOL/XRP) for the AppHeader live ticker
│   └── 021-video-summary-score.sql         # video_transcriptions.summary_score + summary_scored_at (AI recap quality 1-10)
├── .gitignore
├── .env                                    # API keys (not committed)
├── netlify.toml                            # Netlify build + redirect config
├── package.json                            # version is the source of truth (synced by scripts/release.mjs)
├── tsconfig.json
└── SPEC.md                                 # This file
```

### 3.1 `src/app/components/` — feature UI

**SPA + shared**: `AppHeader` (**v2.5.17+** mounts the `CryptoTicker` on every page except `currentPage === "landing"`), `CryptoTicker` (**v2.5.17+** live BTC/ETH/SOL/XRP — see §19), `GeneralMenu` (+ `SeoGeneralMenu`), `SeoNavBar` (**v2.5.3+** intercepts language toggle to persist `preferred_lang`), `AuthModal`, `BriefingPage` (the SPA's default landing — composed of Top 50 + recent transcribed videos pagination), `TopFeedSection`, `SummaryBox`, `AllArticlesTab`, `StatsPage`, `CronMonitorPage`, `TopicsPage/`, `FeedsAdminPage`, `CategoriesPage`, `FavoritesPage`, `FavoriteButton`, `CopyLinkButton`, `ScoreMeter`, `ChangelogPage`, `SettingsPage` (`MyAccountSection`, `UsersSection`, `VoiceAccordion`), `AudioPlayer`, `TopicPersonalizationBar`, `TopicOnboardingModal`, `SummariesBrowsePage`.

**Video surface**: `VideosPage` (today / day-by-day video list with Shorts toggle), `VideoCard` (iframe embed with **v2.x+** localhost-aware `youtube-nocookie` swap to fix black-screen), `VideoPageAudio`, `DownloadTranscriptButton`.

**SSR-page-specific**: `DailySummariesPage` (admin generator), `DailySummaryArticles`, `DailySummaryAudio`, `SummaryExplorer` (client-side embed inside `/summaries`), `YouTubeChannelsPage` (admin).

**Landing only** (under `landing/`): `LandingNav`, `LandingHero`, `LandingTicker`, `LandingStats`, `LandingHow`, `LandingTopics`, `LandingYT`, `LandingPricing` (**v2.5.4+** monthly + annual price side-by-side via `.price-row` flex), `LandingFAQ`, `LandingCTA`, `LandingFooter`, `LandingConsole`.

### 3.2 `src/app/api/` — route handlers

```
api/
├── news/
│   ├── route.ts                  # GET /api/news — Supabase read + AI analysis (per-topic relevant articles)
│   ├── all/route.ts              # GET /api/news/all — All articles (lazy load, up to 1000)
│   ├── top/route.ts              # GET /api/news/top — Top scored articles (Top 50)
│   └── top-summary/route.ts      # POST /api/news/top-summary — Top 50 grouped summary (gpt-5.3-chat-latest)
├── summaries/
│   ├── generate/route.ts         # POST — generate daily SEO summary (owner or CRON_SECRET)
│   ├── routes/route.ts           # GET — all generated summary routes (used by SPA + sitemap)
│   └── [topic]/[date]/route.ts   # GET — public read of a daily summary
├── roundups/
│   └── generate/route.ts         # **v2.4+**: POST — generate one video roundup (owner or CRON_SECRET)
├── video-pages/
│   └── recent/route.ts           # **v2.3+**: GET — paginated list of recent transcribed video pages (1 day per page since v2.5.2)
├── video-transcription/
│   └── route.ts                  # GET — public read of a single transcribed video
├── youtube-channels/
│   ├── route.ts                  # GET/POST/PATCH — channels CRUD + metadata refresh (owner)
│   ├── [id]/route.ts             # DELETE channel (owner)
│   ├── videos/route.ts           # GET — videos by date (RSS fetch + DB cache + duration backfill)
│   ├── transcribe/route.ts       # POST — synchronous transcribe (gpt-4.1-mini, 25 s timeout)
│   └── transcript/route.ts       # **v2.5+**: GET — raw transcript download (.txt)
├── topics/                       # see §6.2
├── users/                        # owner-only user list / patch
├── user/
│   ├── topics/route.ts           # GET/PUT user topic preferences
│   └── favorites/route.ts        # GET/POST/DELETE article favorites
├── categories/                   # GET/POST/PATCH/DELETE — category CRUD (owner)
├── feeds-admin/route.ts          # GET — feeds + per-source stats (owner)
├── fetch-feeds/route.ts          # GET — manual RSS fetch (CRON_SECRET)
├── test-score/route.ts           # GET — manual scoring run (CRON_SECRET)
├── stats/route.ts                # GET — dashboard statistics
├── cron-stats/route.ts           # GET — cron monitoring KPIs + timeline
├── tts/route.ts                  # POST — ElevenLabs Text-to-Speech
├── crypto/route.ts               # **v2.5.17+**: GET — BTC/ETH/SOL/XRP prices for the AppHeader ticker (60 s Supabase + edge cache, ≤ 1 CoinGecko call/min shared across all users) — see §19
└── changelog/route.ts            # GET — release notes (auto-syncs `changelog-entries.ts` to DB on first call)
```

---

## 4. Topics (Database-Driven)

Topics are stored in the **`topics` table** in Supabase and managed dynamically from the UI. There are no hardcoded topic lists in the codebase.

### 4.1 Default topics (seeded via migrations)

| # | Topic ID | Label (EN) | Label (FR) | Focus |
|---|---|---|---|---|
| 1 | `conflict` | Iran War | Iran War | USA/Israel vs Iran conflict, Hezbollah, Houthis, militias |
| 2 | `ai` | AI | IA | AI models, breakthroughs, products, regulation, industry news |
| 3 | `aiengineering` | AI Eng. | AI Eng. | Production AI systems, coding agents, LLM engineering, infra |
| 4 | `robotics` | Robotics | Robotique | Humanoid robots, Unitree, Tesla Optimus, Boston Dynamics |
| 5 | `crypto` | Crypto | Crypto | Cryptocurrency, blockchain, DeFi, regulation, markets |
| 6 | `bitcoin` | Bitcoin | Bitcoin | BTC-only: price, ETFs, mining, Lightning, on-chain |
| 7 | `videogames` | Video Games | Jeux Vidéo | Game releases, studios, consoles, esports |
| 8 | `elon` | Elon Musk | Elon Musk | Tesla, SpaceX, xAI, X/Twitter, Neuralink |
| 9 | `anthropic` | Anthropic | Anthropic | Claude AI models, AI safety research, constitutional AI |

### 4.2 Custom topics

Users can create new topics from the Topics page. Each topic includes:
- Slug ID, EN/FR labels
- Scoring domain description + 5 tier criteria (can be AI-generated)
- EN/FR analysis prompts (auto-generated if left empty)
- RSS feeds (can be auto-discovered by AI)

---

## 5. Supabase Database

### 5.1 Tables

| Table | Purpose |
|---|---|
| `topics` | Topic definitions, scoring criteria, prompts, round-robin timestamps |
| `feeds` | RSS feed URLs per topic |
| `articles` | All fetched articles with scores, AI summaries |
| `categories` | Topic categories (Technology, Health, Sport, ...) |
| `changelog` | In-app release notes (version, bilingual title/body, `created_at`) |
| `news_cache` | Cached API responses (TTL-based) |
| `user_topic_preferences` | Per-user topic selection (array of topic IDs, max 8) |
| `user_favorites` | Per-user article bookmarks (URL, title, source, date) |
| `daily_summaries` | SEO daily summary pages (bullets, articles, SEO metadata) — `slug_keywords` is CHECK-guarded since migration 015 |
| `summary_bullets` | Individual bullets with AI-extracted named entities (GIN-indexed). **`source_type`** column = `article` \| `video` \| `video_roundup`. Optional FKs: `daily_summary_id`, `video_transcription_id`, **v2.4+ `video_roundup_id`** (migration 018). Used as a uniform queryable mirror across all bullet sources. |
| `youtube_channels` | YouTube channel registry (channel_id, handle, title, thumbnail). Auto-refreshed when title/thumbnail are missing. |
| `youtube_videos` | Cached video metadata from RSS (persists past-date lookups). **Includes `duration_sec`** (backfilled by `enrichDurations()` via YouTube Data API v3 — drives Shorts filtering in both the SPA and the cron) and **`topic_id`** (set when the parent channel belongs to a topic — required for `/v/` SSR slug). |
| `video_transcriptions` | Full transcript text + AI Markdown summary per (video, lang). **v2.x+** `slug_keywords` + `published_date` columns + `idx_vt_route` (route resolution by `(topic_id, published_date, lang, slug_keywords)`) and `idx_vt_topic_recent` (recent-videos block) — migration 016. **Migration 021** adds `summary_score` (1-10) + `summary_scored_at` (filled by `cron-video-summary-score-background`). |
| `video_roundups` | **v2.4+** Per-topic-per-day **video roundup** briefings (8-bullet structured Markdown). Columns: `topic_id`, `roundup_date`, `lang`, `slug_keywords`, `seo_title`, `seo_description`, `intro_md`, `video_ids TEXT[]` (ordered list of `video_transcriptions.video_id`). `UNIQUE(topic_id, roundup_date, lang)`. Drives `/{topic}/r/{date}/{slug}` and `/briefings`. Migration 017. |

### 5.2 `topics` table

| Column | Type | Description |
|---|---|---|
| `id` | text PK | Slug (e.g. `"conflict"`, `"my-topic"`) |
| `label_en` | text | Display name in English |
| `label_fr` | text | Display name in French |
| `scoring_domain` | text | Domain description for scoring prompt |
| `scoring_tier1..5` | text | Scoring criteria for tiers 9-10, 7-8, 5-6, 3-4, 1-2 |
| `prompt_en` | text | Full AI analysis prompt (English) |
| `prompt_fr` | text | Full AI analysis prompt (French) |
| `is_active` | boolean | Active in UI and crons |
| `is_displayed` | boolean | Visible on homepage topic grid and eligible for Top feed display |
| `sort_order` | integer | Display order |
| `category_id` | integer FK | **v1.89+**: References categories(id), default 1 (Technology) |
| `last_fetched_at` | timestamptz | Last RSS fetch (for round-robin) |
| `last_scored_at` | timestamptz | Last scoring run (for round-robin) |
| `created_at` | timestamptz | Creation date |

### 5.3 `feeds` table

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | Auto-incremented ID |
| `topic_id` | text FK → topics(id) | Parent topic (CASCADE delete) |
| `name` | text | Human-readable source name |
| `url` | text | RSS feed URL |
| `is_active` | boolean | Feed enabled |
| `created_at` | timestamptz | Date added |

**Constraint**: `UNIQUE(topic_id, url)`

### 5.4 `articles` table

**Columns**: `id`, `topic`, `source`, `title`, `link`, `pub_date`, `fetched_at`, `content`, `snippet`, `snippet_ai_en`, `snippet_ai_fr`, `relevance_score`, `score_reason`, `scored_at`

### 5.5 `changelog` table

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | Row id |
| `version` | text | Release label (e.g. `1.81`) |
| `title_en` / `title_fr` | text | Short headline |
| `body_en` / `body_fr` | text | Detail text |
| `created_at` | timestamptz | Display order / metadata |

Entries are defined in **`src/lib/changelog-entries.ts`** and auto-synced to the DB on first `GET /api/changelog` call after deploy. Legacy seed data lives in `migrations/005-changelog.sql`. No manual SQL needed for new releases.

### 5.6 Cache TTL (based on time window)

| Hours | Cache duration |
|---|---|
| ≤1h | 5 min |
| ≤6h | 10 min |
| ≤24h | 10 min |
| >24h | 30 min |

---

## 6. Backend Architecture

### 6.1 Netlify Background Functions (Cron Jobs)

All cron functions run as **Netlify background functions** (15 min wall budget). Triggers come from **cron-job.org** (POST every minute or every 15 min depending on the function — Netlify's own scheduling is not used so the cadence stays decoupled from the deploy). Background functions return 202 immediately; cron-job.org accepts that as success.

Canonical implementations live in `src/lib/`:
- `fetch-topic-dynamic.ts` (`fetchAndStoreTopicDynamic`, returns `FetchResult`)
- `score-topic-dynamic.ts` (`scoreAndStoreTopicDynamic`, `scoreTopicForCron`)
- `generate-daily-summary.ts` (`generateDailySummary`)
- `generate-video-roundup.ts` (`generateVideoRoundup`) — **v2.4+**
- `transcribe-video.ts` (`transcribeVideo`) — **v2.5+**, shared between the synchronous API route and the pre-warm cron

`netlify/functions/shared/*.ts` re-export those modules for the cron bundle. `GET /api/fetch-feeds`, `GET /api/test-score`, `POST /api/summaries/generate`, `POST /api/roundups/generate` and `POST /api/youtube-channels/transcribe` call the same libraries (auth via cookie session and/or `CRON_SECRET`).

#### `cron-fetching-background.ts` — RSS fetching

- Triggered every minute by cron-job.org
- `CRON_WALL_MS = 840_000` (14 min), default internal `CRON_BUDGET_MS = 810_000` (13.5 min), `CRON_SAFETY_RESERVE_MS = 10_000`
- Loads active topics ordered by oldest `last_fetched_at` (nulls first)
- Multi-pass: keeps fetching topics until the budget guard fires
- For each selected topic: updates `last_fetched_at` **before** fetching, then fetches all active RSS feeds, parses, upserts into `articles`
- Adaptive post-fetch mini-score runs when budget allows
- Emits structured run metrics (elapsed, inserted, mini_scored, deadline stops)

#### `cron-scoring-background.ts` — AI scoring

- Triggered every 15 min by cron-job.org
- Default cadence/timeout model: `CRON_BACKGROUND_SCORE_INTERVAL_MS = 900_000`, `CRON_BACKGROUND_SCORE_TIMEOUT_MS = 900_000`, `CRON_BACKGROUND_SCORE_OVERLAP_RESERVE_MS = 60_000`; effective budget defaults to 840 s and is capped by interval + timeout
- `CRON_BACKGROUND_SCORE_SAFETY_RESERVE_MS = 30_000` by default (falls back to shared `CRON_BACKGROUND_SAFETY_RESERVE_MS` when set)
- Per-run: `SCORE_MIN_ARTICLES_PER_RUN = 10`, `SCORE_MAX_ARTICLES_PER_RUN = 80`, hard cap `SCORE_HARD_ARTICLE_CAP = 120`
- Loads **all active topics**, counts unscored articles (`relevance_score IS NULL`, no `pub_date` cutoff)
- **Sort order**: largest unscored backlog first, then never-scored / oldest `last_scored_at`
- **Adaptive per-topic quota** with per-topic elapsed budget derived from the remaining run budget
- Each scored article stores: relevance score (1-10), reason, AI EN/FR summaries and translated titles (score ≥ 5)
- Uses **`gpt-4.1-nano`** by default (`SCORE_OPENAI_MODEL` override), `SCORE_OPENAI_TIMEOUT_MS = 8_000`, `SCORE_OPENAI_MAX_RETRIES = 0`, `SCORE_BATCH_SIZE = 10`

#### `cron-daily-summary-background.ts` — Daily SEO summaries

- Triggered every 15 min by cron-job.org
- `WALL_MS = 840_000`, `BUDGET_MS = 810_000`, `SAFETY_MS = 15_000`, `MAX_TOPICS_PER_RUN = 5`
- For each active topic × `(en, fr)` × yesterday's date, calls `generateDailySummary` (skip-if-exists via SELECT on `daily_summaries`)
- Uses **`gpt-4.1-mini`** with up to 50 articles fed in, top 10 displayed on the page
- Mirrors bullets to `summary_bullets` with `source_type = 'article'` and `daily_summary_id` FK

#### `cron-video-roundup-background.ts` — **v2.4+** Per-topic-per-day video roundups

- Triggered every 15 min by cron-job.org (typically a single nightly tick produces yesterday's roundups; subsequent ticks are no-ops)
- `WALL_MS = 840_000`, `BUDGET_MS = 810_000`, `SAFETY_MS = 15_000`, `MAX_TOPICS_PER_RUN = 5`
- For each active topic × `(en, fr)` × yesterday's `roundup_date`, calls `generateVideoRoundup`:
  - **v2.4.1+** Source window: 48 h ending at end-of-yesterday (covers `published_date IN [day-before-yesterday, yesterday]` so the briefing is dense even on slow news days)
  - Pulls the matching `video_transcriptions` rows for `(topic, lang)`
  - **`gpt-5.3-chat-latest`** generates a structured 8-bullet briefing (each: bold journalistic title 3-8 words + 3-5 sentence body), plus `seo_title` (no generic phrasing), 5-7 specific kebab-case `slug_keywords` (forbidden: `news`, `briefing`, `daily`, `ai`, `tech`, `video`, `today`), and a `seo_description` with ≥ 3 specific terms
  - Persists in `video_roundups` (`UNIQUE(topic_id, roundup_date, lang)` — re-runs update in place)
  - **v2.4+ Mirrors the 8 bullets** into `summary_bullets` with `source_type = 'video_roundup'`, `bullet_index = 0..7`, `text = '**Title**\\n\\nBody'`, `video_roundup_id` FK (migration 018; if the migration hasn't been applied, the mirror logs a single `WARN` with the actionable line `run migration 018-roundup-bullets.sql in Supabase…` and does not fail the roundup itself)

#### `cron-video-transcribe-background.ts` — **v2.5+** Pre-warm video transcription cache

- Triggered every 15 min by cron-job.org
- `WALL_MS = 840_000`, `BUDGET_MS = 810_000`, **v2.5.4+ `SAFETY_MS = 200_000`** (must be > the per-call OpenAI timeout so the budget guard never starts a transcribe it can't finish), `MAX_BUCKETS_PER_RUN = 40`
- Source pool: `youtube_videos` published in the last 24 h, with `topic_id` set (so the `/v/` SSR page can be generated downstream)
- Backfills missing `duration_sec` via `enrichDurations()` (YouTube Data API v3) before filtering
- **Skip Shorts**: any video with `duration_sec < 120` is excluded (matches the SPA's default toggle)
- Single bulk SELECT on `video_transcriptions(video_id, lang)` builds a `Set<videoId|lang>` of already-done buckets — fast-skip pattern, no per-bucket cache check
- For each candidate × `(en, fr)`: full pipeline on the first lang (~25-90 s on `gpt-5.3-chat-latest`), then translate path on the second lang (~15-25 s) since the alt-lang cache row now exists
- **v2.5.4+** Calls `transcribeVideo()` with `model: "gpt-5.3-chat-latest"` and `openaiTimeoutMs: 180_000` (vs the synchronous route's `gpt-4.1-mini` + 25 s budget). Result: ~95 % of summaries a real visitor sees come from this higher-quality background pre-warm path; the synchronous on-demand button is now only a fallback for very-fresh videos not yet picked up by a tick

**Scoring criteria** (stored in `topics` table, used by `gpt-4.1-nano` scoring runs):
- **9-10**: Major breaking news
- **7-8**: Significant development
- **5-6**: Interesting content
- **3-4**: Low value (opinion without facts)
- **1-2**: Off-topic or spam

### 6.2 API Routes

#### User authentication (v1.80+)

- **Supabase Auth** with email + password; sign-up stores **`first_name`**, **`last_name`**, and **`user_type: "member"`** in **`user_metadata`** (**v1.81+** explicit default; earlier accounts without **`user_type`** are treated as **`member`**).
- **User type** (`src/lib/user-type.ts`): **`member`** (default) or **`owner`**. Only **`owner`** may use **Topics** and **Feed management** (UI + admin APIs). Promote a user to **`owner`** in **Supabase Dashboard → Authentication → Users →** select user → **User Metadata**: set **`user_type`** to **`owner`** (string). The user must **sign out and sign in again** (or refresh the session) so the JWT includes the new claim.
- **`middleware.ts`** refreshes the auth cookie on each matched request.
- **Route Handlers** use **`requireOwnerSession()`** (`src/lib/auth-api.ts`): **`401`** if not signed in, **`403`** if signed in as **`member`**, success only for **`owner`**.
- **Public without session**: `GET /api/topics` **without** `all=1` (homepage topic list), plus existing public endpoints (news, stats, changelog, cron-stats, etc.).
- **Owner session required**: `GET /api/topics?all=1`, `POST /api/topics`, all **`/api/topics/[id]`** methods, **`/api/topics/reorder`**, **`generate-scoring`**, **`discover-feeds`**, all **`/api/topics/[id]/feeds/...`**, **`GET /api/feeds-admin`**.

#### `GET /api/news`

Main data endpoint. Reads pre-scored articles from Supabase, analyses with AI, returns structured summary.

| Param | Type | Default | Description |
|---|---|---|---|
| `hours` | float | 24 | Time window (0.25 to 168) |
| `lang` | `"en"` \| `"fr"` | `"en"` | Language for AI output |
| `topic` | string | — | Topic ID (validated against DB) |
| `count` | int | 20 | Number of articles sent to AI (3–100) |

Analysis prompt is fetched dynamically from the `topics` table (`prompt_en` or `prompt_fr`), with `{{max}}` replaced by the article count.

The `count` parameter directly controls how many articles the AI analyses — there is no hidden multiplier. Articles are pre-filtered by minimum score, sorted by `relevance_score DESC` then `pub_date DESC`, and the top N are sent to the AI.

**Minimum score by time window:**

| Hours | Min score |
|---|---|
| ≤1h | 3 |
| ≤6h | 4 |
| ≤12h | 5 |
| ≤48h | 6 |
| >48h | 7 |

**Response includes `meta` field:**

```json
{
  "meta": {
    "totalArticles": 1200,
    "scoredArticles": 980,
    "analyzedArticles": 20
  }
}
```

#### `GET /api/news/all`

Lazy-loaded endpoint for the "All Articles" tab. Returns up to **1000** articles sorted by `relevance_score DESC NULLS LAST, pub_date DESC`.

| Param | Type | Description |
|---|---|---|
| `topic` | string | Topic ID |
| `since` | string | ISO date string (start of period) |
| `lang` | `"en"` \| `"fr"` | Language for AI snippets |

#### `GET /api/news/top`

Homepage default feed. Returns top-scored articles across all topics (by `relevance_score`, then `pub_date`).

**v1.76+**: the query selects **`snippet`**, **`content`**, **`snippet_ai_en`**, **`snippet_ai_fr`** from `articles`, accepts **`lang`**, and returns a localized **`snippet`** per row (same selection logic as `GET /api/news`). Earlier versions returned RSS **`title`** only.

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 50 | Max articles (1–50) |
| `days` | float | 1 | Time window in days |
| `lang` | `"en"` \| `"fr"` | `en` | **v1.76+**. Chooses AI snippet (`snippet_ai_fr` / `snippet_ai_en`), else RSS `snippet` / `content` (truncated ~600 chars) |

**Response** (`articles[]`): `title`, `link`, `source`, `topic`, `pubDate`, `score`, **`snippet`** (**v1.76+**; empty string if nothing to show).

#### `POST /api/news/top-summary`

Homepage-only AI summary endpoint. Accepts `{ articles, lang }` from the Top feed and returns `SummaryResponse` with grouped bullet points (`globalSummary`) and source references (`refs`) rendered by `SummaryBox`. Uses dedicated homepage prompt rules (homogeneous grouping + mandatory refs) and OpenAI **`gpt-5.3-chat-latest`**.

#### Daily Summaries API

| Route | Method | Description |
|---|---|---|
| `/api/summaries/generate` | POST | Generate (or regenerate) one daily SEO summary for `(topic, date, lang)`. Auth: cookie session **owner** OR header `Authorization: Bearer ${CRON_SECRET}` (used by the cron). Skip-if-exists guard unless `?force=1`. |
| `/api/summaries/routes` | GET | All `daily_summaries` route triplets `(topic, date, slug)` × langs — used by the SPA's `SummariesBrowsePage` and by `sitemap.ts`. |
| `/api/summaries/[topic]/[date]` | GET | Public read of one daily summary (bullets + articles + SEO metadata) — `?lang=` selects the variant. |

#### Video Roundups API — v2.4+

| Route | Method | Description |
|---|---|---|
| `/api/roundups/generate` | POST | Generate (or regenerate) one **video roundup** for `(topic, date, lang)`. Auth: cookie session **owner** OR header `Authorization: Bearer ${CRON_SECRET}`. Body: `{ topicId, date, lang, force? }`. Mirrors the 8 bullets into `summary_bullets` (silent best-effort if migration 018 is missing). |

The matching SSR pages (`/briefings`, `/[topic]/r/[date]/[slug]`) read `video_roundups` directly via the service-role client in `lib/supabase.ts` (`getAllVideoRoundupRoutes`, `getVideoRoundupByRoute`) — no client API call required.

#### Video transcription / video pages API

| Route | Method | Description |
|---|---|---|
| `/api/youtube-channels/videos` | GET | Day-by-day video list per channel (RSS fetch + DB cache + `enrichDurations()` backfill). Drives the SPA `VideosPage`. |
| `/api/youtube-channels/transcribe` | POST | **Synchronous** on-demand transcribe — calls `transcribeVideo()` with `model = "gpt-4.1-mini"` and a 25 s OpenAI timeout (Netlify cap is 30 s on serverless functions). Cross-language optimization: if a transcription exists in the other language, translates the existing summary instead of re-transcribing (saves 1 TranscriptAPI credit + ~80 % tokens). |
| `/api/youtube-channels/transcript` | GET | **v2.5+** Returns the raw transcript text for one `(video_id, lang)` as `text/plain` so the user can download a `.txt` from the SPA (`DownloadTranscriptButton`). |
| `/api/video-transcription` | GET | Public read of a single transcribed video (used by SSR `/[topic]/v/[date]/[slug]`). |
| `/api/video-pages/recent` | GET | **v2.3+** Paginated list of recent transcribed videos for the SPA's Briefing homepage. Params: `?lang=` (en/fr), `?page=` (0 = today, 1 = yesterday, …). **v2.5.2+**: page size = **1 day** so the default view shows only today's transcribed videos and the prev/next buttons walk one day at a time; `MAX_PAGE = 60`. The "Toutes les vidéos transcrites" section stays visible even when today is empty as long as older content exists. |

#### `GET /api/cron-stats`

Cron monitoring endpoint. Returns real-time statistics about fetch and scoring jobs.

**Response** (`CronStatsResponse`):
- `global`: backlog (7d unscored), fetched24h, scored24h, coverage24h %, avgDelayMinutes (mean of `scored_at − fetched_at` in minutes, only articles with `pub_date` in the last 24h and with `relevance_score`, `scored_at`, and `fetched_at` all set)
- `topics[]`: per-topic status (id, label, lastFetchedAt, lastScoredAt, backlog, status: ok/slow/high, optional **statusReason**: `"backlog"` \| `"fetch"` \| `"score"` for slow/high — used in the Topic Status table **Reason** column)
- `timeline[]`: hourly buckets (hour, fetched, scored) for the last 24h

**Status rules**: `high` if backlog >200, fetch age >30min, or (backlog >0 **and** score age >30min); `slow` if backlog ≥50, fetch age >15min, or (backlog >0 **and** score age >15min); `ok` otherwise. **v1.82+**: score age is only penalized when there are unscored articles to process.

Uses **pagination in 1000-row batches** (PostgREST max rows per response) so counts and timelines include all matching rows, not only the first page.

#### `GET /api/stats`

Dashboard statistics endpoint with optional topic and period filtering.

| Param | Type | Default | Description |
|---|---|---|---|
| `topic` | string | `"all"` | Topic ID or `"all"` |
| `days` | number | 0 | Period filter (0 = all time, -1 = today, 1/24 = 1h, 3/24 = 3h, 6/24 = 6h, 1 = yesterday, 3, 7, 30) |
| `kpi_only` | `"1"` | — | If set, returns only global KPIs via lightweight COUNT queries (no full dataset scan) |

Returns: `global` KPIs, `scoreDistribution`, `feedRanking`, `topArticles` (up to 500), `topicComparison`. When `kpi_only=1`, only `global` is populated; other arrays are empty.

#### `POST /api/tts`

Text-to-Speech via ElevenLabs `eleven_flash_v2_5`. Returns `audio/mpeg` (MP3).

#### Topics API

**v1.80+**: Unless noted **public**, routes below require a signed-in **`owner`** (`403` for **`member`**, `401` if unsigned — see §6.2).

| Route | Method | Description |
|---|---|---|
| `/api/topics` | GET | **Public** without `?all=1`: active topics + feed counts for homepage. **`?all=1`**: includes inactive topics (**owner** only). |
| `/api/topics` | POST | Create topic (auto-generates prompts if empty) (**owner**) |
| `/api/topics/[id]` | GET | Topic detail with feeds, scoring, prompts |
| `/api/topics/[id]` | PATCH | Update topic (labels, scoring, prompts) |
| `/api/topics/[id]` | DELETE | Soft-delete topic (`is_active = false`) |
| `/api/topics/[id]/feeds` | POST | Add feed to topic |
| `/api/topics/[id]/feeds/[feedId]` | PATCH | Update feed |
| `/api/topics/[id]/feeds/[feedId]` | DELETE | Remove feed |
| `/api/topics/[id]/feeds/[feedId]/articles` | DELETE | Delete all `articles` rows for this topic + feed `name` (source) |
| `/api/topics/[id]/feeds/[feedId]/score` | POST | Score up to **50** unscored articles (`topic` + **`source` = trimmed `feeds.name`**). Route is capped to Netlify constraints: **`maxDuration` 13**, global elapsed budget (~12s), sequential batches (**12**) with per-call timeout (~6.5s). Returns **`partial: true`** if budget stops remaining batches; may include **`errors`** / **`error`** when scoring fails. **Feeds admin** shows partial-success toast and error details. |
| `/api/topics/generate-scoring` | POST | AI-generate 5 scoring tiers from domain |
| `/api/topics/generate-labels` | POST | **v1.82+**: AI-generate slug, label FR, and domain from label EN |
| `/api/topics/reorder` | POST | Swap **`sort_order`** between two topic IDs (`topicA`, `topicB` in JSON body) |
| `/api/topics/[id]/discover-feeds` | POST | AI-discover + validate + insert 10 RSS feeds |

#### `POST /api/topics/generate-scoring`

Uses GPT-4.1-nano to generate 5 scoring tier descriptions from a domain description. Returns `{ tier1, tier2, tier3, tier4, tier5 }`.

#### `POST /api/topics/[id]/discover-feeds`

1. Reads topic domain from DB
2. Asks GPT-4.1-nano for 10 RSS feed URLs
3. Validates each in parallel (HTTP fetch, XML check, ≥1 `<item>`/`<entry>`, 8s timeout)
4. Inserts valid feeds into DB, deduplicates against existing
5. Returns `{ added: [...], rejected: [...] }`

#### `GET /api/feeds-admin`

**v1.80+**: **`owner` only** (`401` unsigned, `403` member).

| Param | Type | Description |
|---|---|---|
| `topic` | string | `all` or a topic id — filters which `feeds` rows are returned |

Returns `{ feeds: [...] }`: each row includes `id`, `topicId`, `source`, `url`, `isActive`, `createdAt`, and aggregates from **`articles`** (`totalArticles`, `scoredArticles`, `avgScore`, `hitRateGte7`) keyed by `topic` + `source` (same scan pattern as stats: paginated article read). Used by **Feed management** UI.

#### Users API (v1.82+)

**`owner`-only** — uses Supabase **service role** to access `auth.admin`.

| Route | Method | Description |
|---|---|---|
| `/api/users` | GET | List all registered users (id, email, firstName, lastName, userType, createdAt) |
| `/api/users/[id]` | PATCH | Update user `first_name`, `last_name`, and/or `user_type` in user_metadata |

#### `GET /api/changelog`

Returns `{ entries: [...] }` — **all** `changelog` rows, `created_at` DESC, fetched in **1000-row pages** (PostgREST limit) so every version appears on the in-app Changelog page.

---

## 7. AI Prompts (Database-Driven)

Prompts are stored in the `topics` table (`prompt_en`, `prompt_fr`), not in code files.

### 7.1 Prompt structure (common to all topics)

Every prompt instructs the AI to:

1. **FILTER** — Select only articles relevant to the topic
2. **SUMMARIZE EACH** — Write a 2-3 sentence factual summary per article. In FR mode, also translate the title
3. **GLOBAL SUMMARY** — Write up to 8 bullet points with specific facts/numbers

The `{{max}}` placeholder is replaced at runtime by the user's selected article count.

### 7.2 JSON response format expected from AI

```json
{
  "relevant": [
    { "index": 0, "snippet": "Summary text", "title": "Translated title (FR only)" }
  ],
  "globalSummary": [
    { "text": "Bullet point with facts", "refs": [0, 3] }
  ]
}
```

### 7.3 Default prompt generation

When creating a topic without custom prompts, defaults are auto-generated based on the topic label and scoring domain (see `generateDefaultPromptEn` / `generateDefaultPromptFr` in `/api/topics/route.ts`).

---

## 8. Frontend — UI Components

The app root is `src/app/page.tsx` (`"use client"`): **home** topic/period flow, global state (lang, TTS cookies, `currentPage`), and composition of feature components. **Header + nav** live in **`AppHeader`**; **Top 50** list UI in **`TopFeedSection`** with data from **`useTopFeed`** (`src/hooks/useTopFeed.ts`). **v1.76+**: **`useTopFeed({ poll, lang })`** passes UI language to **`/api/news/top`** and refetches when **`lang`** changes. Other screens are separate modules under **`src/app/components/`** (e.g. **`TopicsPage/`** = `index.tsx` + `TopicsPageListView` / `TopicsPageCreateView` / `TopicsPageDetailView`).

### 8.1 Layout

- **Background**: Pure black (`#000000`)
- **Max width**: **916px**, centered (~5% wider than 872px; legacy was 830px on large viewports)
- **Font**: System UI stack
- **Theme**: Black & gold (`#c9a227`)

### 8.2 Navigation

The SPA at `/app` has 15+ pseudo-pages managed by `currentPage` state (`"briefing"` | `"home"` (= Top 50) | `"stats"` | `"crons"` | `"topics"` | `"feeds"` | `"categories"` | `"dailySummaries"` | `"favorites"` | `"topArticles"` | `"summaries"` | `"videos"` | `"youtubeChannels"` | `"changelog"` | `"settings"`). Route-mapped via `next.config.ts` rewrites for hard-refresh resilience. `topics`, `feeds`, `categories`, `dailySummaries`, `youtubeChannels` are owner-only. `favorites` requires any authenticated user.

**General Menu** (`GeneralMenu`, visible on all SPA pages):
- Persistent navigation bar: **Briefing** (default), **Top 50**, **Daily Summaries**, **Videos**, **My Favorites** (authenticated only)
- Active button highlighted with gold border/background
- SSR variant (`SeoGeneralMenu`) used on every SSR page (landing, briefings, summaries, `/[topic]/...`) with `<a>` links

**Header** (`AppHeader`, shared across all SPA pages):
- **Logo**: PNG image (`/logo-8news.png`), responsive height — **clicking logo resets to Briefing**
- **Subtitle**: "Tech / AI / Crypto" — same EN/FR
- **Top-right controls**:
  - **Icon row** (left to right): **Home** (house, → Briefing); **Stats** (bars), **Cron Monitor** (pulse), **Changelog** (clock), **Settings** (gear); **User menu** (user icon with crown for owners — dropdown contains admin items: Topics, Categories, Feed management, Daily Summaries, YouTube Channels; plus sign-in/sign-out)
  - **Row below icons**: **Sign in** button (if not authenticated) **to the left of** the **language toggle** (EN/FR), right-aligned. **v2.5.3+**: Toggling the language persists to **both** the cookie and `auth.users.raw_user_meta_data.preferred_lang` (for authenticated users) before navigating.

**SSR `SeoNavBar`** (top of every SSR page): same logo + subtitle pattern, with a `LangToggle` that intercepts the click, sets the cookie synchronously, asynchronously updates `preferred_lang` for authenticated users, then navigates.

### 8.3 Landing page `/` — v2.x

A pure SSR marketing page composed of `LandingNav` → `LandingHero` → `LandingTicker` → `LandingStats` → `LandingHow` → `LandingTopics` → `LandingYT` → `LandingPricing` → `LandingFAQ` → `LandingCTA` → `LandingFooter`. Defaults to **FR** (overridable by `?lang=`, `preferred_lang`, or cookie). Static copy lives in `src/lib/landing-content.ts`.

**Pricing — v2.5.4 state**:
- **Free** plan: "Choose 8 topics out of 36 available, powered by 400+ RSS feeds" + "Top 50 daily with AI summary + sources, favorites and daily summaries archive" + the rest. ElevenLabs TTS line removed.
- **Pro** plan: monthly + **annual** price displayed side-by-side via `.price-row` flex (e.g. `9€/mo · 88€/year · -8%`). "Webhooks & API access" line removed. "Morning email digest covering all your topics" replaces the prior wording. "Priority scoring queue" line removed.

### 8.4 The SPA `/app` (default landing: Briefing)

Lives at `src/app/app/page.tsx`. The whole `/app/*` namespace is routed to a single client component via the `next.config.ts` rewrite list — pseudo-routes (`/app/articles`, `/app/videos`, `/app/stats`, …) are managed by `pushState`. Cold-loading e.g. `/app/videos` rewrites to `/app` and the SPA reads the path on mount to set `currentPage`.

**Default page**: `BriefingPage` — a composite landing inside the SPA that shows:
1. The Top 50 feed (`TopFeedSection` + opt-in AI grouped summary via `/api/news/top-summary`)
2. The "All transcribed videos" pagination block driven by `/api/video-pages/recent` — **v2.5.2+** one day per page, default = today, prev/next walks one day at a time, section stays visible if today is empty but older content exists

**Language sync** (v2.5.3+): on session load, the SPA reads `authUser.user_metadata.preferred_lang` and reconciles `lang` state. If `preferred_lang` is unset for an authenticated user, it's initialised from the current cookie. `handleLangChange()` writes to **both** the cookie and `auth.users.raw_user_meta_data.preferred_lang` via `supabase.auth.updateUser`.

#### Top 50 Feed (default sub-view of Briefing)

On launch (no topic or period selected), the homepage displays the **Top 50 best-scored articles from the last 24 hours** across displayed topics, fetched from **`/api/news/top`** ( **`v1.83+`**: `?limit=50&days=1&lang={ui lang}` ). UI: **`TopFeedSection`** (caption, sorted rows, NEW badge, topic pill, copy link, **v1.82+** last-updated timestamp `— Mise à jour HH:MM` / `— Updated HH:MM`). Data + polling: **`useTopFeed`** with `poll === true` only when **`currentPage === "home"`** and **`topic === null`** (initial fetch on mount, silent 5 min refresh, `refresh()` after logo/home reset, `clear()` when user picks a topic). **`v1.76+`**: hook shape **`useTopFeed({ poll, lang })`** — **language change refetches** the Top 50. **v1.82+**: hook also exposes **`lastUpdatedAt`** (`Date | null`), updated on every successful fetch. (`cache: "no-store"` on fetches.)

Each Top 50 row shows a small **topic ID badge** (gold outline) next to the source line when `topic` is present. Items with `pubDate` in the **last hour** show a **NEW** badge. **`v1.76+` — French UI**: when a non-empty **`snippet`** is returned (typically **`snippet_ai_fr`**), the **main line** is that French text and the **RSS `title`** appears below in muted style; **English** keeps **title** first and **snippet** under it (like **ArticleCard**). If no AI snippet exists, only the RSS title is shown.

When a topic is selected but no period chosen, the Top 50 disappears and a message prompts the user: "Select a time period to start the analysis."

#### Action Bar (`TopicPersonalizationBar`)

**v1.96+**: Positioned **above** the topic grid. Contains:
- **Customize my topics** / **Edit my topics** (personalization mode toggle)
- **Analyze top 50 articles** (launches Top 50 AI analysis)
- **Daily Summaries** (link to `/summaries` public page)
- When in personalization mode: **Done** button, **+ New topic** button, save status

#### Topic Selector (`TopicToggle`)

- **Layout**: CSS grid, **max 8 topics per line**
  - Desktop (>640px): `repeat(min(N, 8), 1fr)` — wraps to next line if >8 topics
  - Mobile (≤640px): 4 columns → wraps
- **Data**: Topics loaded dynamically from `/api/topics` on mount and when returning from other pages
- **Style**: Individual rounded buttons with gold border, gold fill when active
- **Loading spinner**: Displayed while topics are loading from API, preventing empty state flash
- **Default**: No topic selected on launch

#### Period Selector

11 buttons: 30m, 1h, 3h, 6h, 12h, 24h, 48h, 3d, 7d, 14d, 30d

#### Loading State

- Progress bar with simulated two-phase animation
- Dynamic loading message (`homeLoadingReading` → `homeLoadingAi` in `i18n.ts`)
- Notification double beep on completion (880Hz + 1050Hz)

#### Summary Box (`SummaryBox`)

- **Title**: "Summary | {Topic Name}" — displays selected topic name next to Summary, separated by a pipe
- Up to 8 bullet points with gold "•" prefix and source reference links
- **Article stats metadata** (when `meta` is present): one compact line — e.g. FR: `55 articles, 55 score, 13 analysés par IA` (analyzed count in **gold**); EN: `55 articles, 55 scored, 13 analyzed by AI`. On **viewports ≤640px**, slightly smaller typography for readability
- Audio player for TTS playback
- Period display

#### Result Tabs

- **"Relevant articles"** — AI-filtered with generated summaries; **copy-link** control on each card (writes article URL to clipboard)
- **"All articles"** — Up to **1000** articles from Supabase, **lazy-loaded** (fetched only when tab is clicked or preloaded in background). Progressive display: 50 articles shown initially with "Show more" button. Sorted by `relevance_score DESC NULLS LAST, pub_date DESC`. Each article displays its individual score and copy-link control

#### Scroll-to-Top Button

A floating button appears after scrolling down 400px, allowing quick return to the top of the page.

### 8.5 Stats Page

Three-state dashboard: **home** (no selection), **topic chosen** (waiting for period), **full view** (topic + period).

**Home state** (initial load): Lightweight KPIs fetched via `/api/stats?kpi_only=1` (11 parallel COUNT queries, no full dataset scan). Shows 5 KPI boxes + prompt message. No topic or period button is highlighted.

**Topic selected, no period**: KPIs hidden, no API call, message "Select a period to start the analysis."

**Topic + period selected**: Full `/api/stats` call with filtered dataset.

**Topic Selector**: Tabs for "All" and each active topic (loaded from DB)

**Period Filter**: All time, 1h, 3h, 6h, Today, Yesterday, 3 days, 7 days, 30 days

**KPIs** (5 boxes, single compact line):
- Total articles, Scored, Coverage %, Avg score, Score ≥ 7

**Sections** (visible only when topic + period are both selected):
- **Score distribution**: Horizontal bar chart by tier (1-2 through 9-10)
- **Feed ranking**: Sortable table (source, total, scored, avg, Score ≥ 7, tier distribution). Source names are clickable links; **full source name** on hover (`title` on truncated cells)
- **Article ranking**: Up to **500** best-scored articles with score, reason, link. Displayed **50 at a time** with a "Show 50 more" lazy-load button
- **Topic comparison**: Table comparing all topics (articles, coverage, avg score, Score ≥ 7, active feeds (7d/7j))

### 8.6 Cron Monitor Page (`CronMonitorPage`)

Real-time monitoring dashboard for fetch and scoring cron jobs. Auto-refreshes every **60 seconds**.

**Global KPIs** (5 boxes):
- Backlog (7d unscored articles)
- Fetched 24h
- Scored 24h
- Coverage 24h (%)
- **Avg delay** — mean of **`scored_at − fetched_at`**, displayed as **`Xm XXs`** (e.g. `3m25s`), only for articles with **`pub_date` in the last 24h** (same cohort as Fetched 24h) **and** `relevance_score`, `scored_at`, and `fetched_at` all set

**Topic Status**: Table with per-topic status:
- Topic name, last fetched, last scored, backlog count, **Reason** (for slow/high: `backlog`, `fetch`, or `score`)
- Color-coded status indicator: 🟢 OK, 🟡 Slow, 🔴 High

**Activity Last 24 Hours**: Hourly timeline showing fetched and scored article counts per hour. Displayed in **user's local timezone** (via `Intl.DateTimeFormat`). Future hours are filtered out to avoid displaying erroneous data.

### 8.7 Topics Page (`TopicsPage/`)

Full CRUD management for topics and feeds. **`index.tsx`** holds state and API handlers; **three view components**: `TopicsPageListView`, `TopicsPageCreateView`, `TopicsPageDetailView`.

**List view**: Table of all topics with #, name, **category** (inline `<select>` — **v1.105+**: `PATCH /api/topics/:id` with `{ categoryId }` only; per-row disabled state while saving; rollback + `topicCategorySaveError` on failure), feed count, status, click to detail. **Reorder** via ↑/↓ buttons calling `/api/topics/reorder` with optimistic UI updates.

**Create view** (**v1.93+ refactored**): Form with:
- **Identity box**: Label EN, Label FR, Slug (3-column row); "Generate with AI" button; Domain textarea
- **Category** selector (default: Technology)
- **Scoring criteria**: 5 tiers with "Generate with AI" button
- **Analysis Prompt**: EN/FR tabs with "Generate with AI" button, monospace textarea, `{{max}}` info
- **RSS Feeds box** (**v1.93+**): dedicated section with two sub-panels:
  - **AI discovery**: "Find 10 RSS feeds with AI" button — auto-creates a hidden draft topic on first use
  - **Manual addition**: name + URL inputs + add button
  - Draft topic is created once (anti-doublon) and reused for all feed operations
- **Create button**: saves topic, redirects to topic list (owner) or home (member) with 24h validation toast

**Detail view**:
- Topic info (labels, domain, scoring criteria displayed in read mode with "Scoring" section header, edit toggle)
- Analysis prompt (EN/FR tabs, read/edit modes, `{{max}}` validation warning)
- Feeds list (name, domain link, delete button) + add feed form
- **"🔍 Discover feeds by AI"** button: discovers and adds 10 new feeds to an existing topic

### 8.8 Feed management (`FeedsAdminPage`)

Dedicated **RSS / feed operations** view (not the same as Topics CRUD):

- **Topic filter**: pill buttons — **All** or one topic (labels from homepage topic list)
- **Table**: source (link to RSS URL), topic, **created at** (`feeds.created_at`), total articles, scored, avg score, Score ≥ 7 % — all numeric/topic columns **sortable** (asc/desc)
- **Actions** (per row):
  - **Score** (star icon): `POST /api/topics/:id/feeds/:feedId/score` — up to 50 unscored articles, **all** unscored for the feed (newest `pub_date` first; no day window)
  - **Delete articles** (document‑X): `DELETE .../articles` — removes stored articles for that topic + source
  - **Delete feed** (trash): `DELETE .../feeds/:feedId`
- **Toasts** (fixed bottom center): loading spinner + message while waiting; success / info / error with auto-dismiss (replaces `alert` for these actions)

### 8.9 Favorites Page (`FavoritesPage`) — v1.94+

Accessible via star icon in the header (authenticated users only).
- Lists all bookmarked articles sorted by most recently added
- Each entry shows title (external link), source, date, filled star (click to remove)
- Empty state with star icon and hint text
- Data from `GET /api/user/favorites`
- `FavoriteButton` component appears on every article across all views (ArticleCard, TopFeedSection, AllArticlesTab, StatsPage) with optimistic toggle and auth guard

### 8.10 Categories Page (`CategoriesPage`) — v1.89+

Admin page (owner-only) for managing topic categories. CRUD via `/api/categories`.

### 8.11 Daily Summaries Generator (`DailySummariesPage`) — v1.95+

Admin page (owner-only) for generating SEO daily summaries:
- Topic selector + date picker → generate single topic summary (EN+FR)
- Date picker + "Generate all topics" batch button
- Anti-doublon: skips already-generated summaries
- Results display: generated/skipped/no_articles/error with links to SEO pages

### 8.12 Daily Summaries Explorer (`/summaries`) — v1.96+

Public page at `/summaries`:
- **SSR section** (crawlable by Google): grid of all active topics with links to hubs and recent summaries
- **Client section** (`SummaryExplorer`): topic selector + date picker, fetches and displays summary inline
- Link to full SEO page for each summary

### 8.13 SEO Daily Summary Pages — v1.95+

Server-rendered public pages for search engine indexing:
- **Topic hub** (`/[topic]`): paginated list of all daily summaries for a topic + a "recent transcribed videos" sidebar
- **Daily summary** (`/[topic]/[date]/[slug]`): full AI summary with bullets, articles, JSON-LD, hreflang, OG metadata, prev/next navigation
- **Sitemap** (`/sitemap.xml`): dynamic, covers every active topic hub, every daily summary, every video roundup, every per-video page
- URL format: `8news.ai/{topic}/{YYYY-MM-DD}/{keyword1-keyword2-keyword3}`
- Generated via `gpt-4.1-mini` with 50 articles, top 10 displayed, enriched prompts for detailed bullets

### 8.14 SEO Per-Video Pages — v2.x

`/{topic}/v/{date}/{slug}` (e.g. `/ai/v/2026-04-25/sora-3-realtime-preview`). Server-rendered from `video_transcriptions` rows joined with `youtube_videos`, with the AI-generated Markdown summary, the embedded video, JSON-LD `VideoObject`, hreflang, and a "Latest videos transcribed in this topic" block driven by `idx_vt_topic_recent`.

### 8.15 SEO Per-Topic-Per-Day Video Roundups — v2.4+

`/{topic}/r/{date}/{slug}` (e.g. `/ai/r/2026-04-24/foundation-models-launch-week`). Server-rendered from `video_roundups` rows. Renders:
- `seo_title` (h1)
- The structured 8-bullet `intro_md` Markdown (each bullet = bold journalistic title 3-8 words + 3-5 sentence body)
- An `ItemList` of the underlying videos (`video_ids`) with thumbnails, titles, channels, durations, links to their `/v/` pages
- JSON-LD `Article` + `ItemList`, hreflang to the EN/FR variant, OG metadata

### 8.16 Briefings Hub `/briefings` — v2.x

Public SSR hub at `/briefings`. Lists every `video_roundups` row grouped by `roundup_date DESC` (filtered by resolved language). Each card links to the matching `/{topic}/r/{date}/{slug}`. Aligned with `/summaries` in pattern. URL is intentionally `/briefings` (no "video") so future briefing types can land here too.

### 8.17 Videos Page (`VideosPage`) — v1.99+, evolved through v2.x

Accessible via the General Menu "Videos" button (all users).

- **Date navigation**: prev/next day arrows with MiniCalendar picker between them, plus "Today" shortcut
- **Shorts toggle**: on/off switch on the same line as the date picker, right-aligned. **Default: off** — Shorts (`duration_sec < 120`, i.e. < 2 min) are hidden until the user flips the switch
- **Transcribed badge**: when a `(video_id, lang)` has an existing `video_transcriptions` row, the action button renders a check icon (instead of the "T" text icon). Same color / no panel expansion — clicking still toggles the summary panel.
- **Video cards**: horizontal layout (320 px thumbnail + title, truncated description with "See more", channel, time, views, duration)
- **Transcription button**: triggers AI transcription flow per video (TranscriptAPI + GPT-4.1-mini sync). **v2.x+** Inline spinner inside the button while loading.
- **AI summary display**: Markdown rendered via `react-markdown` (dynamic import, SSR disabled), collapsible. The "Key Points" / "INTRO" headings are normalized via `summary-headings.ts` (FR uses `INTRO`; both langs put a blank line between bold title and body).
- **YouTube embed**: `<iframe>` with `enablejsapi=1`, `playsinline=1`, `origin`, and `referrerPolicy="strict-origin-when-cross-origin"`. **v2.x+ localhost fix**: when `window.location.host` starts with `localhost`, swap the embed host to `youtube-nocookie.com` to bypass the strict-origin black-screen.
- **Pre-warmed by cron**: most "today's" non-Shorts videos already have a `video_transcriptions` row by the time a visitor arrives, thanks to `cron-video-transcribe-background` (every 15 min). The button is the fallback for very-fresh videos.
- **Cross-language optimization**: if a transcription exists in the other language, translates the existing summary instead of re-transcribing (saves 1 TranscriptAPI credit + ~80 % tokens)
- **Video caching**: `youtube_videos` table persists metadata from RSS on each fetch, enabling past-date lookups; `enrichDurations()` backfills `duration_sec` (retry with @handle fallback)

### 8.18 YouTube Channels Admin (`YouTubeChannelsPage`) — v1.99+

Owner-only page accessible via the user dropdown menu.

- **Add channel**: input @handle or URL, resolves via TranscriptAPI `/channel/resolve` (free), fetches title + thumbnail via `/channel/latest` (free)
- **Channel list**: table with thumbnail (or fallback icon), title, handle, channel ID, delete button
- **Auto-refresh**: on page load, channels with missing title or thumbnail are automatically refreshed from TranscriptAPI with retry logic (channel_id → @handle fallback, 2 attempts each)

### 8.19 Changelog page (`ChangelogPage`)

- Loads **`GET /api/changelog`**
- Lists version badge, date, bilingual title/body from **`changelog`** table

### 8.20 Settings Page (`SettingsPage`)

Up to four sections depending on auth status:

**1. My Account** (**v1.82+**, any authenticated user — `MyAccountSection`)
- Displays first name, last name (editable), email (read-only), user type badge (read-only)
- Edit/Save/Cancel inline; uses `supabase.auth.updateUser()` to persist name changes in `user_metadata`

**2. Preferences**
- **Max relevant articles** slider: 3–**100**, default **20**, persisted in cookie. This is the exact number of articles sent to the AI for analysis (no hidden multiplier).

**3. Voice**
- **Speed** slider: 0.7x–1.2x, default 1.05x
- **Voice EN** (6 voices), **Voice FR** (6 voices)

**4. Users** (**v1.82+**, `owner` only — `UsersSection`)
- Table of all registered users: last name, first name, email, type (badge), created at
- Inline editing per row (first name, last name, user type dropdown) via `PATCH /api/users/[id]`
- Data fetched from `GET /api/users` (service role)

### 8.21 Audio Player (`AudioPlayer`)

Text-to-Speech player for the global summary, using ElevenLabs API.

**Controls**: Play/Pause, Stop, -15s/+15s skip, seekable progress bar, time display

**TTS text composition**: Intro → summary text → outro

**Voice IDs** (ElevenLabs):

| Internal ID | Display Name | Language | ElevenLabs Voice ID |
|---|---|---|---|
| `sarah` | Jade | EN | `Xb7hH8MSUJpSbSDYk0k2` |
| `alice` | Alice | EN | `NDTYOmYEjbDIVCKB35i3` |
| `rachel` | Rachel | EN | `21m00Tcm4TlvDq8ikWAM` |
| `daniel` | Nicolas | EN | `dtSEyYGNJqjrtBArPCVZ` |
| `drew` | Drew | EN | `29vD33N1CtxCmqQRPOHJ` |
| `josh` | Josh | EN | `TxGEqnHWrfWFTfGW9XjX` |
| `george` | Tristan | FR | `AmMsHJaCw4BtwV3KoUXF` |
| `charlotte` | Charlotte | FR | `XB0fDUnXU5powFXDhCwa` |
| `lily` | Lily | FR | `pFZP5JQG7iQjIQuC4Bku` |
| `nicole` | Nicole | FR | `piTKgcLEGmPE4e6mEKli` |
| `thomas` | Thomas | FR | `GBv7mTt0atIp3Br8iCZE` |
| `callum` | Callum | FR | `N2lVS1w4EtoT3dr4eOWO` |

### 8.22 Auto-Update Banner

The SPA checks `public/version.json` every **5 minutes**. If the version string **differs** from the bundled `APP_VERSION` constant, a gold banner appears at the **top-right** (copy: `homeNewVersionBanner` in `i18n.ts`). Clicking reloads the page. No auto-reload.

**Release workflow** — single-source-of-truth via `scripts/release.mjs`:
1. `npm run release:patch` (or `:minor` / `:major`) — bumps `package.json`, then runs `release.mjs` which propagates the new version to `public/version.json`, the SPA's `APP_VERSION`, the footer, and any other tracked spot in one atomic edit
2. Add an entry to `src/lib/changelog-entries.ts` (auto-synced to the `changelog` DB table on first `/api/changelog` after deploy)
3. Commit + push

### 8.23 Version Footer

Fixed bottom-right: `v{APP_VERSION}`, kept in sync by `scripts/release.mjs` so it always matches `version.json`.

---

## 9. Internationalisation (i18n)

Defined in `src/lib/i18n.ts` — 1000+ lines of EN/FR keys covering all SPA, SSR, admin, toasts, error messages, video / briefing / roundup labels, and ARIA strings.

- **Languages**: English (`en`), French (`fr`)
- **Resolution priority** (SSR pages, via `lib/server-lang.ts → resolveServerLang()`):
  1. `?lang=en` / `?lang=fr` query param (explicit override)
  2. `auth.users.raw_user_meta_data.preferred_lang` (authenticated users — **v2.5.3+**)
  3. `lang` cookie (anonymous users)
  4. Page default (typically `en`, `fr` for the landing)
- **Toggle**: Segmented control in `AppHeader` (SPA) or `SeoNavBar` (SSR). On click: synchronously writes the `lang` cookie, asynchronously persists `preferred_lang` for authenticated users via `supabase.auth.updateUser`, then reloads / navigates. The SPA also reconciles `lang` state on session load (`useEffect` listening on `authUser`).
- **Scope**: All UI text, error messages, loading messages, topic management, stats labels, briefings, video roundups, landing copy
- **AI output**: Language-specific prompts from DB (`prompt_en` / `prompt_fr`); video roundups generated with FR or EN system prompt depending on `lang` column
- **TTS voice**: Auto-selects from EN or FR voice pool
- **Date formatting**: `en-US` or `fr-FR` locale via `dateLocale(lang)` helper

---

## 10. Design System (`theme.ts`)

### Colors

| Token | Value | Usage |
|---|---|---|
| `bg` | `#000000` | Page background |
| `surface` | `#111` | Card/section background |
| `border` | `#2a2a2a` | Default borders |
| `borderLight` | `#333` | Lighter borders |
| `gold` | `#c9a227` | Primary accent |
| `goldLight` | `#e6c84e` | Hover state |
| `text` | `#f5f5f5` | Primary text |
| `textSecondary` | `#ddd` | Summary text |
| `textMuted` | `#999` | Secondary UI text |
| `textDim` | `#666` | Tertiary/metadata |
| `errorText` | `#ff8888` | Error text |

### Shared layout & form styles

Re-exported from `theme.ts` for **Stats**, **Cron Monitor**, and **Topics** admin UIs:

| Export | Role |
|---|---|
| `sectionCard` | Bordered panel (`surface` bg, padding, radius) — replaces per-file `secStyle` |
| `formSectionTitle` | Uppercase gold heading inside panels |
| `formInputStyle` / `formTextareaStyle` | Full-width topic create/edit inputs |
| `primaryButtonStyle` / `dangerButtonStyle` | Primary / destructive actions |

Also: `sectionHeading`, `card`, `ghostBtn`, `ghostOutlineBtn`, `spinnerStyle`, and score/coverage colour helpers (`scoreClr`, `hitClr`, `covClr`).

---

## 11. State Management

All state is managed with React hooks (`useState`, `useRef`, `useCallback`) in the `Home` component. No external state library.

| State | Type | Default | Persistence |
|---|---|---|---|
| `lang` | `"en"` \| `"fr"` | `"en"` | Cookie |
| `topic` | string \| null | null | None |
| `topics` | TopicItem[] | [] | Fetched from `/api/topics` |
| `maxArticles` | number | 20 | Cookie |
| `ttsSpeed` | number | 1.05 | Cookie |
| `ttsVoice` | string | `"sarah"` | Cookie |
| `ttsVoiceFr` | string | `"george"` | Cookie |
| `currentPage` | `AppNavPage` (`"home"` \| `"stats"` \| `"crons"` \| `"topics"` \| `"feeds"` \| `"categories"` \| `"dailySummaries"` \| `"favorites"` \| `"topArticles"` \| `"summaries"` \| `"videos"` \| `"youtubeChannels"` \| `"changelog"` \| `"settings"`) | `"home"` | None |
| `data` | SummaryResponse \| null | null | None |
| `loading` | boolean | false | None |
| Top 50 articles / loading | from **`useTopFeed({ poll, lang })`** (`/api/news/top?limit=50&days=1&lang=`) | — | In-memory; **clear** on topic select; **refresh** on home reset; refetch when `lang` changes |
| `allArticles` | ArticleSummary[] | [] | None (lazy-loaded) |
| `allArticlesLoading` | boolean | false | None |
| `topicsLoading` | boolean | true | None |

---

## 12. TypeScript Interfaces

```typescript
interface TopicItem {
  id: string;
  labelEn: string;
  labelFr: string;
  feedCount: number;
  isActive: boolean;
  sortOrder: number;
}

interface TopicDetail extends TopicItem {
  scoringDomain: string;
  scoringTier1..5: string;
  promptEn: string;
  promptFr: string;
  feeds: FeedItem[];
}

interface FeedItem {
  id: number;
  name: string;
  url: string;
  isActive: boolean;
}

interface ScoreResult {
  index: number;
  score: number;
  reason: string;
  summary_en?: string;
  summary_fr?: string;
}

interface SummaryResponse {
  summary: string;
  bullets: SummaryBullet[];
  articles: ArticleSummary[];
  allArticles: ArticleSummary[];
  period: { from: string; to: string };
  meta?: {
    totalArticles: number;
    scoredArticles: number;
    analyzedArticles: number;
  };
}

interface StatsResponse {
  global: { totalArticles, scoredArticles, pctScored, avgScore, new24h, new7d, scored24h };
  scoreDistribution: Array<{ tier, count, pct }>;
  feedRanking: Array<{ source, topic, total, scored, avgScore, hitRate, pct9_10..pct1_2 }>;
  topArticles: Array<{ title, link, source, topic, pubDate, score, reason }>;
  topicComparison: Array<{ topic, total, scored, pctScored, avgScore, hitRate, activeSources, totalFeeds }>;
}

interface CronStatsResponse {
  global: {
    backlog: number;
    fetched24h: number;
    scored24h: number;
    coverage24h: number;
    avgDelayMinutes: number;
  };
  topics: Array<{
    id: string;
    label: string;
    lastFetchedAt: string | null;
    lastScoredAt: string | null;
    backlog: number;
    status: "ok" | "slow" | "high";
    statusReason?: "backlog" | "fetch" | "score";
  }>;
  timeline: Array<{
    hour: string;
    fetched: number;
    scored: number;
  }>;
}
```

---

## 13. Data Flow

```
          ┌────────────────────────────────────────────────────────────┐
          │  BACKGROUND (Netlify Background Functions, cron-job.org)   │
          │                                                            │
          │  cron-fetching-background.ts        (every 1 min)          │
          │  - Multi-pass over active topics (oldest last_fetched_at)  │
          │  - RSS → parse → upsert `articles`                         │
          │  - Adaptive post-fetch mini-score                          │
          │                                                            │
          │  cron-scoring-background.ts         (every 15 min)         │
          │  - Backlog-first, oldest last_scored_at tie-break          │
          │  - gpt-4.1-mini → relevance + EN/FR snippets               │
          │                                                            │
          │  cron-daily-summary-background.ts   (every 15 min)         │
          │  - For each (topic × {en,fr}) yesterday: generate summary  │
          │  - gpt-4.1-mini → daily_summaries + summary_bullets        │
          │                                                            │
          │  cron-video-transcribe-background.ts (every 15 min)        │
          │  - Today's videos with topic_id, duration_sec >= 120 s     │
          │  - First lang: full pipeline (transcript + summary)        │
          │  - Second lang: translate path (reuses transcript)         │
          │  - gpt-5.3-chat-latest, 180 s OpenAI timeout (v2.5.4+)     │
          │                                                            │
          │  cron-video-roundup-background.ts   (every 15 min)         │
          │  - For each (topic × {en,fr}) yesterday's roundup_date:    │
          │    pull last 48 h transcribed videos for the topic         │
          │  - gpt-5.3-chat-latest → 8 structured bullets + SEO meta   │
          │  - Persist video_roundups + mirror to summary_bullets      │
          └────────────────────────────────────────────────────────────┘

User opens / (landing) → SSR landing
User opens /app       → client SPA → BriefingPage (default)
                              ├─ Top 50 via /api/news/top  (poll 5 min)
                              ├─ Opt-in /api/news/top-summary  (gpt-5.3-chat-latest)
                              └─ /api/video-pages/recent  (1 day per page, default = today)

User opens /briefings, /summaries, /[topic], /[topic]/[date]/[slug],
           /[topic]/v/[date]/[slug], /[topic]/r/[date]/[slug]
       → SSR via lib/supabase.ts (service-role read), no AI call at request time
```

---

## 14. Deployment

### Netlify

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Plugin**: `@netlify/plugin-nextjs`
- **Background functions**: 6 cron jobs — `cron-fetching-background`, `cron-scoring-background`, `cron-daily-summary-background`, `cron-video-roundup-background`, `cron-video-transcribe-background`, `cron-video-summary-score-background` (batched 1-10 quality score for `video_transcriptions.summary_md`; same 15 min wall as other long crons; trigger on your cadence, e.g. every 15 min — no auth, URL-obscurity like the other background crons)
- **Rewrites**: every `/app/*` SPA pseudo-route is rewritten to `/app` via `next.config.ts.beforeFiles` (hard-refresh resilience for the SPA)
- **Domain**: `8news.ai`
- **Redirect**: `8news.netlify.app/*` → `8news.ai/:splat` (301)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key (gpt-4.1-nano + gpt-4.1-mini + gpt-5.3-chat-latest) |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for TTS |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key — browser auth + session validation in API routes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only — never expose) |
| `TRANSCRIPT_API_KEY` | Yes | TranscriptAPI key for YouTube video transcription |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key — only used to backfill `youtube_videos.duration_sec` so the Shorts filter is reliable. When unset, `enrichDurations()` is a silent no-op (videos display as-is and Shorts filtering falls back to RSS metadata only). |
| `CRON_SECRET` | Yes | Bearer token used by cron-job.org for `/api/fetch-feeds`, `/api/test-score`, `/api/summaries/generate`, `/api/roundups/generate`, and the Netlify cron function URLs (pass as `?secret=`). |
| `VIDEO_SUMMARY_SCORE_MODEL` | No | OpenAI model for video recap scoring (`cron-video-summary-score-background`). Default `gpt-4.1-nano`. |
| `VIDEO_SUMMARY_SCORE_BATCH_SIZE` | No | Recaps per OpenAI JSON call. Default `8` (capped by `VIDEO_SUMMARY_SCORE_BATCH_CAP`). |
| `VIDEO_SUMMARY_SCORE_BATCH_CAP` | No | Hard max recaps per request. Default `12` (safety for context size). |
| `VIDEO_SUMMARY_SCORE_MAX_CHARS` | No | Truncate each `summary_md` in the prompt. Default `3500`. |
| `VIDEO_SUMMARY_SCORE_OPENAI_TIMEOUT_MS` | No | Per-batch OpenAI timeout. Default `20000`. |
| `VIDEO_SUMMARY_SCORE_OPENAI_MAX_RETRIES` | No | SDK retries. Default `0` (fail fast; next cron tick retries backlog). |
| `CRON_VIDEO_SUMMARY_SCORE_WALL_MS` | No | Hard wall for the function. Default `840000` (14 min). |
| `CRON_VIDEO_SUMMARY_SCORE_BUDGET_MS` | No | Effective run budget. Default `810000`. |
| `CRON_VIDEO_SUMMARY_SCORE_SAFETY_MS` | No | Reserve before deadline — stop launching new batches. Default `45000`. |

---

## 15. Error Handling

| Scenario | Behaviour |
|---|---|
| RSS feed timeout (>5s) | Feed silently skipped, others continue |
| All feeds fail | "No articles found" message |
| No scored articles in time window | "No relevant articles found for this time period" |
| Missing/invalid OpenAI key | Returns raw articles without AI, with explanatory message |
| OpenAI API error | "Error calling OpenAI" message |
| ElevenLabs API error | 502 with error details |
| Cron timeout on a topic | Round-robin advances to next topic (timestamp updated before processing) |
| Network error (client) | "Unable to connect to the server" |
| Supabase errors | Graceful fallback (empty arrays) |
| Feed discovery fails | Topic is created successfully, feeds are optional |

---

## 16. Adding a New Topic

From the **Topics page** in the UI:

1. Click **"+ New Topic"**
2. Enter the **Label EN**
3. Click **"✨ Generate with AI"** (identity box) to auto-fill slug, label FR, and domain — or fill them manually
4. Click **"✨ Generate with AI"** (scoring criteria) to auto-fill the 5 scoring tiers from domain (optional)
5. Optionally customize the analysis prompt (EN/FR)
6. Leave **"🔍 Find 10 RSS feeds automatically"** checked (or uncheck to add feeds manually later)
7. Click **"Create"**

The topic immediately appears in the homepage topic selector, stats page, and cron rotation. No code changes or deployment required.

---

## 17. Changelog

Release history is maintained in **`src/lib/changelog-entries.ts`** and auto-synced to the `changelog` DB table on first `GET /api/changelog` call after deploy. The in-app Changelog page displays all entries. This SPEC does not duplicate the changelog — see the source file or the in-app page for the full history.

**Recent (v2.x highlights)**:
- **v2.5.4** — Hybrid OpenAI strategy: synchronous video transcription stays on `gpt-4.1-mini` (sub-30 s budget), pre-warm cron upgraded to `gpt-5.3-chat-latest` with a 180 s OpenAI timeout (cron `SAFETY_MS = 200_000`). Landing pricing: annual price for Pro displayed side-by-side with monthly via `.price-row`; "Choose 8 topics out of 36 available, powered by 400+ RSS feeds"; merged Top 50 + favorites + archive lines for Free; removed ElevenLabs / Webhooks-API / Priority-scoring lines; "Morning email digest covering all your topics".
- **v2.5.3** — Language persistence: SSR pages now resolve via `resolveServerLang()` (query → `preferred_lang` → cookie → default); SPA + `SeoNavBar` write `preferred_lang` to `user_metadata` on every toggle; introduced `src/lib/server-lang.ts`.
- **v2.5.2** — Briefing's "All transcribed videos" pagination = 1 day per page, default = today, section stays visible if today is empty; PostgREST `PGRST204` on missing `summary_bullets.video_roundup_id` logged as a single WARN (run migration 018).
- **v2.5** — `cron-video-transcribe-background` (every 15 min): pre-transcribe today's videos in EN+FR (skip Shorts < 120 s) so the SPA shows instant summaries.
- **v2.4 / v2.4.1** — Video roundups rebuilt: 8 structured bullets (3-8 word bold title + 3-5 sentence body), `gpt-5.3-chat-latest`, mirrored to `summary_bullets` (migration 018), 48 h source window in the cron.
- **v2.3 / v2.3.1** — Long videos transcribe reliably (3-tier sampling); recent transcribed videos block on the Briefing.
- **v2.2** — SSR per-topic-per-day video roundups (`/{topic}/r/{date}/{slug}`) + per-video pages (`/{topic}/v/{date}/{slug}`) + `/briefings` hub (migrations 016 + 017).
- **v2.x base** — Landing extracted to `/`, SPA moved to `/app/*` with `next.config.ts` rewrites, default landing page inside the SPA is the **Briefing**, tagline updated to **Tech / AI / Crypto**, dynamic sitemap covers everything.

---

## 18. Known Limitations

- **Partial authentication / role-based admin** — Supabase Auth with `member` (default) vs `owner`. Topics, Feed management, Categories, Daily Summaries (admin), YouTube Channels and Users are owner-only. Guests and members still use the Briefing, Top 50, Daily Summaries, Videos, Favorites (signed-in only), stats, crons, changelog, settings, plus every public SSR page. No per-user data partitioning in the database; `owner` is an admin role for those screens.
- **Synchronous video transcription budget** — `/api/youtube-channels/transcribe` runs on a regular Netlify route (30 s cap) and uses `gpt-4.1-mini` with a 25 s OpenAI timeout. For very long videos (> 1 h 30 min) it relies on a 3-tier transcript-sampling strategy in `lib/transcribe-video.ts`. Higher-quality summaries come from the cron pre-warm path (`gpt-5.3-chat-latest`, 180 s budget) — by the time most visitors arrive, the cache row is already populated.
- **Cron pre-warm coverage** — `cron-video-transcribe-background` only picks up videos with `topic_id` set on the parent channel and `duration_sec ≥ 120`. Shorts and channels not yet linked to a topic stay on the on-demand sync path.
- **Migrations are not auto-applied** — Migrations under `migrations/` must be run manually in the Supabase SQL Editor. Code is defensive when a migration is missing (e.g. `summary_bullets.video_roundup_id` from migration 018 — the mirror logs a single WARN and skips). Always run pending migrations before promoting a release that depends on them.
- **Serverless wall-time** — Netlify background functions cap at 15 min wall-time. Internal budgets (~13.5 min) + safety reserves (10-200 s depending on the cron) keep us inside that envelope. `POST /api/topics/[id]/feeds/[feedId]/score` is capped at `maxDuration 13` (synchronous route) and may return `partial: true` when its budget is exhausted.
- **RSS availability** — Some feeds go offline; AI feed discovery validates upfront but feeds can break later.
- **YouTube embed on localhost** — Strict-origin policies cause some channels to render a black `<iframe>` on `http://localhost`. Worked around by swapping the embed host to `youtube-nocookie.com` when the page is on localhost (production keeps `youtube.com` and a strict `referrerPolicy`).
- **AI cost** — Each request consumes OpenAI tokens; each TTS request consumes ElevenLabs credits; each video transcription costs 1 TranscriptAPI credit (cross-language translation reuses the existing summary to save credits — only one `/transcript` call per `(video_id, lang0)`, the second lang only pays the LLM bill).
- **TranscriptAPI reliability** — The `/channel/latest` RSS endpoint can time out (408) for some channels; retry logic with @handle fallback mitigates most failures.
- **Hybrid rendering** — The SPA (`/app`) is client-only; landing, briefings hub, summaries hub, per-topic hubs, daily summaries, per-video pages and per-roundup pages are server-rendered (SEO-first).
- **Cookie-based UI prefs** — Most UI prefs (`maxArticles`, TTS speed/voice, etc.) are persisted in cookies; topic and period selection reset on reload. `lang` is the exception — also written to `preferred_lang` in `user_metadata` for authenticated users (v2.5.3+).
- **AI feed discovery accuracy** — GPT may suggest invalid URLs; validation catches most but not all edge cases.
- **Crypto ticker upstream** — `/api/crypto` depends on the public CoinGecko free tier (no API key, ≤ 30 calls/min). Our cache strategy keeps us at exactly 1 call/min so we sit 30× under the limit, but a CoinGecko-side outage surfaces as a `stale: true` flag in the response and a small grey dot next to the ticker — prices keep showing the last cached values from `crypto_prices` until upstream recovers. See §19.

---

## 19. Crypto Ticker (v2.5.17+)

A persistent **BTC / ETH / SOL / XRP** live ticker rendered as a full-width strip at the top of the AppHeader (above the « 8NEWS » brand zone and the icon cluster), right-aligned within the strip. Visible on every SPA page except `currentPage === "landing"`. Updates every 60 seconds, single source of truth across all visitors (no per-user fetch).

### 19.1 Data flow

```
CoinGecko /simple/price ──► /api/crypto (server) ──► Supabase crypto_prices
                                  │                          │
                                  └────► module memo ◄───────┘
                                                │
                                                ▼
                                       Cache-Control: s-maxage=60
                                                │
                                                ▼
                                          Netlify edge
                                                │
                                                ▼
                                  useCryptoPrices (client)
                                                │
                                                ▼
                                          CryptoTicker
```

### 19.2 Components

| File | Role |
|---|---|
| `migrations/020-crypto-cache.sql` | `crypto_prices(symbol PK, price_usd, change_24h, updated_at)` + service-role RLS |
| `src/app/api/crypto/route.ts` | Public GET endpoint. Reads DB, refreshes from CoinGecko when any row is older than 60 s, returns `{ prices: [{ symbol, price, change24h, updatedAt }], stale: boolean }` |
| `src/hooks/useCryptoPrices.ts` | Client hook. `{ poll }` flag, 60 s `setInterval`, paused on `document.visibilityState === "hidden"`, immediate refresh on `visibilitychange → visible` |
| `src/app/components/CryptoTicker.tsx` | Compact horizontal row in the AppHeader. Symbol in gold, price in text, 24h % green/red. Click → CoinGecko coin page. Mounted by AppHeader only when `currentPage !== "landing"` |
| `src/app/globals.css` | Adds `@keyframes cryptoFlash` (price update glow) + `.crypto-ticker`, `.crypto-ticker-change`, `.crypto-ticker-coin-extra` responsive classes |
| `src/lib/i18n.ts` | `cryptoTickerStale` (« Stale data / Données obsolètes »), `cryptoTickerError` (« Prices unavailable / Cours indisponibles ») |

### 19.3 Cache strategy & rate limit math

- **Tier 1 — module memo.** Inside the warm Function instance, the latest payload is kept in `let memo: { payload, cachedAt }`. Same-instance requests within 60 s return immediately, no DB round-trip.
- **Tier 2 — Supabase row cache.** When the memo is cold or expired, the route reads `crypto_prices`. If every tracked symbol has `updated_at >= now - 60s`, those rows ARE the response — no upstream call.
- **Tier 3 — CoinGecko refresh.** Only when at least one row is older than 60 s do we hit `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true` with a 5 s `AbortController` timeout. The response is upserted back into `crypto_prices` (fire-and-forget — the response payload uses the freshly-fetched values directly so users don't wait on the DB write).
- **Tier 4 — CDN cache.** The route returns `Cache-Control: public, max-age=0, s-maxage=60, must-revalidate`. Netlify's edge serves the same payload to every visitor for up to 60 s; browsers always revalidate so a manual refresh picks up a freshly-flipped tick.

**Net rate**: with N concurrent users, at most 1 CoinGecko call per minute = **1,440 calls/day**, well within CoinGecko's free tier (30 calls/min, no API key required).

### 19.4 Failure modes

| Failure | Behavior |
|---|---|
| CoinGecko returns 5xx / timeout (> 5 s) | Endpoint returns last DB rows + `stale: true`. UI shows a grey dot tooltip « Stale data ». |
| CoinGecko returns 200 with no usable entries | Same as above (falls back to DB). |
| DB read error AND CoinGecko down | Endpoint returns `{ prices: [], stale: true }`. Component renders `—` with tooltip « Prices unavailable ». |
| Supabase env vars missing (preview build, local without `.env`) | Endpoint returns `{ prices: [], stale: true }`. Ticker hides itself gracefully. |
| Tab hidden (background) | Hook pauses the `setInterval` (saves CoinGecko credits beyond what the cache already does). On `visibilitychange → visible` the hook fires one immediate refresh and resumes the cadence. |
| Landing route (`currentPage === "landing"`) | AppHeader fully unmounts the component — no DOM, no hook, no polling. |

### 19.5 Mobile responsiveness

| Viewport | Behavior |
|---|---|
| Default | All four coins (BTC ETH SOL XRP), each shows symbol + price + 24h % |
| ≤ 640 px | All four coins, but the 24h % column hides (`.crypto-ticker-change { display: none }`) |
| ≤ 480 px | Only BTC + ETH visible (SOL/XRP coins carry `.crypto-ticker-coin-extra` which hides at this breakpoint), still no 24h % |

### 19.6 Validation

Manual smoke-test (`next dev`):

```bash
# Cold instance: first hit triggers CoinGecko fetch + DB upsert
curl -s "http://127.0.0.1:3000/api/crypto" | jq

# Warm instance: subsequent hit served from module memo, sub-ms latency
curl -s "http://127.0.0.1:3000/api/crypto" -o /dev/null -w "%{time_total}\n"

# Inspect cache headers — should report `s-maxage=60`
curl -sI "http://127.0.0.1:3000/api/crypto" | grep -i cache

# Force stale path — block CoinGecko from your hosts file or unplug
# network: response keeps coming with stale: true and the last cached
# values from the DB.
```

In the browser:
- Open `/app`, the ticker shows in the top-right; observe a brief gold flash (`cryptoFlash` keyframe) when a price changes.
- DevTools → Application → Throttling → Offline → tab still serves the last payload (browser cache).
- Switch tabs for > 1 minute then return: hook fires an immediate refresh on `visibilitychange`.
- Open multiple tabs: all share the same edge entry; only one origin call per minute (verify in Netlify logs / dev console: « `[crypto] coingecko fetch` » should fire ≤ 1×/min).
- Resize to 480 px: SOL/XRP collapse, only BTC + ETH visible.
