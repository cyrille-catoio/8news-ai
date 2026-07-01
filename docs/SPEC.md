# 8news.ai — Technical Specification

**Version**: v2.18
**Last updated**: 1 July 2026

> **Note**: sections of this spec are historical — they describe the system as of the version tagged inline (`**vX.Y+**` markers). The mechanical parts (header version, file tree, migration list, cron list, API route list) are kept current and **enforced by `npm run spec:check`** (also run by `npm test`, hence by the Netlify build — drift blocks the deploy). The spec is updated automatically as part of the release ritual (see `AGENTS.md` § 3 and § 11 for the content contract). For feature-level details, the changelog (`src/data/changelog-entries.json`) is the most up-to-date reference.

---

## 1. Overview

**8news.ai** is an AI-powered tech / AI / crypto intelligence platform built around two complementary content pipelines:

1. **RSS articles** — fetched from 400+ curated feeds across **dynamic, database-driven topics**, pre-scored 1-10 with AI via scheduled Netlify cron jobs, stored in Supabase, and surfaced as a daily Top 50 (homepage feed) and per-topic SEO daily summary pages.
2. **YouTube transcriptions** — for a curated set of channels, the cron pre-transcribes every "today's" video (≥ 180 s) in EN+FR, GPT-summarises each one into a Markdown article, and aggregates them per topic per day into structured 8-bullet "video roundup" briefings.

Both pipelines feed into a hybrid rendering model: a black-and-gold **client-side SPA at `/app`** for the authenticated / power-user surface, plus a **server-rendered SEO surface** at `/`, `/archives` (**v2.6.11+** unified hub, supersedes the previously parallel `/summaries` + `/briefings` which now 308-redirect here), `/[topic]`, `/[topic]/[date]/[slug]` (legacy article daily summary, redirects to `/en|fr/[topic]/[date]/[slug]`), `/[topic]/v/[date]/[slug]`, `/[topic]/r/[date]/[slug]` and `/[topic]/videos/[date]` (**v2.6.11+** drill-down from /archives) for indexability.

**OpenAI models in use**:
- `gpt-4.1-nano` — per-article scoring (1-10) and **v2.6.6+** per-topic AI analysis on `/app` (`/api/news` flow, swapped from `gpt-4.1-mini`).
- `gpt-4.1-mini` — daily SEO summaries (`/api/summaries`), synchronous on-demand video transcription (`/api/youtube-channels/transcribe`, fallback path < 30 s).
- `gpt-5.3-chat-latest` — per-topic-per-day video roundups (`generate-video-roundup.ts`) and **v2.5.4+** the background pre-warm video transcription cron (`cron-video-transcribe-background`).
- **v2.6.5+** `gpt-5.5` — daily Top articles AI summary cron (`generate-top-summary.ts` → `cron-top-summary-background`). Editorial flagship model; the snapshot is read by /top-articles and the home `Top24hHero` accordion via `GET /api/news/top-summary/latest` (no on-demand LLM call from any user-facing surface).

**Tagline**: "Tech / AI / Crypto" (same EN + FR — sub on the landing varies per surface).

**Live URL**: https://8news.ai
**Repository**: https://github.com/cyrille-catoio/8news-ai

### 1.1 Surfaces — quick map

| URL | Rendering | Purpose |
|---|---|---|
| `/` | SSR | Marketing landing (hero, ticker, stats, YT, how-it-works, topics, pricing, FAQ, CTA, footer) |
| `/app` and `/app/<page>` | Client SPA (rewritten via `next.config.ts`) | Briefing homepage + Top 50 / Videos / Stats / Crons / Topics / Settings / etc. |
| `/archives` | SSR + client | **v2.6.11+** Unified public hub: timeline by date desc, one row per (topic) per day with three slots — daily article summary, video roundup, count of transcribed videos. Filters: topic / type (all / articles / videos). 7-day pagination. |
| `/briefings` | SSR | **v2.6.11+** 308-redirects to `/archives?type=videos`. URL kept for backlink preservation. |
| `/summaries` | SSR | **v2.6.11+** 308-redirects to `/archives`. URL kept for backlink preservation. |
| `/[topic]/videos/[date]` | SSR | **v2.6.11+** Drill-down list of every transcribed video for one (topic, date, lang) tuple, reached from the `/archives` timeline « N transcribed videos » counter. |
| `/{YYYY-MM-DD}` | SSR | **v2.6.11+** Cross-topic Top 24h archive page for one specific date (e.g. `/2026-05-10`). Mounted via a date-fork in `/[topic]/page.tsx` because Next.js can't have two `/[seg]/` dynamic routes at the same level. Renders the full `Top24hHero` accordion (defaultOpen) + the 50-article frozen source list + adjacent-day links. Reached from the gold « ALL TOPICS » box on `/archives`. Topic ids matching `^\d{4}-\d{2}-\d{2}$` are rejected at create time. |
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
- **v2.6+** `home_min_score_article` — integer 1..10 (default 9). Per-user threshold applied by `/api/news/top-story` to filter the `home_surface_queue` rotation. Persisted on every change (cookie `homeMinScoreArticle` + `user_metadata`) and configurable from the SettingsPage. `home_min_score_video` / `homeMinScoreVideo` may exist as a legacy preference, but `/api/videos/top` now uses a fixed product threshold of **8/10** so over-strict stale cookies cannot blank the TOP VIDEO card.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | ^5 |
| Frontend | React | 19.2.3 |
| CSS | `globals.css` (tables, grids, keyframes) + `landing.css` (SSR landing only) + `theme.ts` tokens + inline styles | — |
| RSS Parsing | rss-parser | ^3.13.0 |
| AI (text analysis) | OpenAI API — `gpt-4.1-nano` (scoring + **v2.6.6+** per-topic AI analysis on `/app`), `gpt-4.1-mini` (daily SEO summaries + sync video transcription fallback), `gpt-5.3-chat-latest` (video roundups, **v2.5.4+** pre-warm video transcription cron), **v2.6.5+** `gpt-5.5` (daily Top articles snapshot cron) | via `openai` ^6.25.0 |
| AI (text-to-speech) | ElevenLabs API — `eleven_flash_v2_5` model | via REST API |
| YouTube transcription | TranscriptAPI — `/channel/latest` (free), `/channel/resolve` (free), `/transcript` (1 credit) | via REST API |
| YouTube metadata | YouTube Data API v3 — `/videos?part=contentDetails` to backfill `youtube_videos.duration_sec` (Shorts filter) | via REST API |
| Markdown rendering | `react-markdown` (dynamic import, SSR disabled in SPA / inline in SSR pages — **v2.13.4+** shared component maps in `video-markdown.tsx`, no inline maps) | ^10 |
| Unit tests | vitest — **v2.13.4+** colocated `__tests__/` suites over pure helpers (71 tests as of v2.13.5), run by `npm test` and by the Netlify build (`npm test && npm run build`) | ^3.2 |
| Database | Supabase (PostgreSQL) | via `@supabase/supabase-js` ^2.99.2 |
| Auth (session cookies) | Supabase Auth + `@supabase/ssr` ^0.10.2 — browser anon client + `middleware.ts` refresh + `resolveServerLang()` SSR helper | — |
| Hosting | Netlify | via `@netlify/plugin-nextjs` ^5.15.8 |
| Cron Jobs | Netlify Background Functions (15 min budget) triggered every 15 min for fetching/scoring/transcribe/summary/roundup/video-summary-score, and **once a day** for `cron-top-summary-background` + `cron-newsletter-daily-background` by **cron-job.org** (**v2.13.4+** unused `@netlify/functions` dependency dropped — plain handler signatures) | — |
| Domain | 8news.ai (redirect from 8news.netlify.app) | |

---

## 3. Project Structure

```
8news/
├── AGENTS.md                           # **v2.13.5+** Working conventions for AI agents (release ritual, git, validation, code/DB/UI rules)
├── docs/
│   ├── SPEC.md                         # This file
│   ├── ROADMAP.md                      # Product roadmap (Now / Next / Later)
│   └── COMMITS.md                      # Conventional Commits conventions (types, scopes)
├── middleware.ts                       # Supabase session cookie refresh on each matched request
├── next.config.ts                      # Rewrites every /app/* SPA route to /app (otherwise hard refreshes 404)
├── vitest.config.ts                    # **v2.13.4+** vitest config — collects src/**/*.test.ts (`npm test`)
├── public/
│   ├── logo-8news.png                  # App logo (PNG, "8" gold / "news" light grey)
│   ├── favicon.svg                     # Browser favicon — gold "8" on black, 512×512
│   ├── apple-touch-icon.svg            # iOS home screen icon — gold "8" on black, 180×180
│   ├── version.json                    # {"version":"2.13.5"} — kept in sync by `scripts/release.mjs`
│   └── landing/                        # Landing assets (yt-summary-preview.png, etc.)
├── scripts/
│   └── release.mjs                     # Single-source-of-truth version sync — bumps version.json, APP_VERSION, footer + checks changelog coverage
├── src/
│   ├── data/
│   │   └── changelog-entries.json      # **v2.13.4+** Release notes data (580 KB moved out of TS; typed re-export in src/lib/changelog-entries.ts)
│   ├── app/
│   │   ├── layout.tsx                  # Root layout, metadata, favicons, AuthProvider, Google Analytics, SSR footer hook
│   │   ├── providers.tsx               # AuthProvider / useAuth (Supabase session, exposes user + session)
│   │   ├── globals.css                 # Global CSS reset + base styles
│   │   ├── landing.css                 # Landing-only stylesheet (loaded only by `/`)
│   │   ├── page.tsx                    # SSR landing page (composed of LandingNav/Hero/Ticker/Stats/YT/How/Topics/Pricing/FAQ/CTA/Footer)
│   │   ├── sitemap.ts                  # Dynamic sitemap.xml — every active topic hub, every daily summary, every roundup, every per-video page
│   │   ├── app/
│   │   │   └── page.tsx                # **The SPA**: client shell with currentPage router (Briefing → Top 50 → Videos → Stats → Crons → Topics → Settings → …). Default landing page is the **Briefing** (BriefingPage) since v2.x.
│   │   ├── archives/
│   │   │   └── page.tsx                # **v2.6.11+** SSR `/archives` unified hub (timeline by date desc, daily summary + video roundup + transcribed-videos count per topic per day). Replaces /briefings + /summaries which now 308-redirect here.
│   │   ├── briefings/
│   │   │   └── page.tsx                # **v2.6.11+** 308 redirect to `/archives?type=videos`
│   │   ├── summaries/
│   │   │   └── page.tsx                # **v2.6.11+** 308 redirect to `/archives`
│   │   ├── [topic]/
│   │   │   ├── layout.tsx              # Minimal passthrough layout
│   │   │   ├── page.tsx                # Topic hub: paginated daily summaries + recent video pages list
│   │   │   ├── [date]/[slug]/page.tsx  # Daily summary page (legacy 308 → /en|fr/[topic]/[date]/[slug])
│   │   │   ├── v/[date]/[slug]/page.tsx  # SSR per-video transcribed-summary page (with related videos block)
│   │   │   ├── r/[date]/[slug]/page.tsx  # SSR per-topic-per-day **video roundup** (8-bullet briefing + ItemList of covered videos)
│   │   │   └── videos/[date]/page.tsx  # **v2.6.11+** Drill-down list of every transcribed video for one (topic, date) — reached from /archives « N transcribed videos » counter
│   │   ├── /[topic]/page.tsx            # **v2.6.11+** Date fork: when params.topic matches `^\d{4}-\d{2}-\d{2}$` → renders the cross-topic Top 24h archive via `<TopDayPage>`. Otherwise the topic hub.
│   │   ├── components/                 # Shared feature UI — see §3.1
│   │   └── api/                        # API routes — see §3.2
│   ├── hooks/
│   │   ├── useTopFeed.ts               # Top 50 hook (`/api/news/top?limit=50&days=1&lang=`), poll on Briefing-with-no-topic, lastUpdatedAt
│   │   ├── useUserTopics.ts            # Per-user topic personalization (8/36 topics)
│   │   ├── useFavorites.ts             # Article favorites (Set of URLs, optimistic toggle, auth-gated)
│   │   └── useCryptoPrices.ts          # **v2.5.17+**: Live top-50 CoinGecko prices for the AppHeader CryptoTicker (selected 12 symbols max, 60 s poll, visibility-aware)
│   └── lib/
│       ├── __tests__/                  # **v2.13.4+** vitest suites for the pure helpers below (dates-utc, slug, cookies, video-bullets, generate-top-summary)
│       ├── types.ts                    # TypeScript interfaces (TopicItem, TopicDetail, SummaryResponse, ArticleSummary, …)
│       ├── theme.ts                    # Design tokens (colors, fonts, shared styles — **v2.13.4+** also sectionStyle/sectionTitle + kpiCard/kpiLbl)
│       ├── i18n.ts                     # EN/FR translation strings (1500+ lines)
│       ├── constants.ts                # Cross-cutting constants
│       ├── api-helpers.ts              # **v2.13.4+** NO_STORE_HEADERS, parseLang, parsePositiveInt, parseOffset — shared by ~18 API routes
│       ├── dates-utc.ts                # UTC date helpers (todayUtc, previousUtcDay, toUtcDateString) — crons work in UTC only
│       ├── topic-strips.ts             # **v2.13.8+** groupArticlesByTopic() — pure per-topic regroup/cap + localized titles for GET /api/news/strips
│       ├── supabase.ts                 # Barrel re-export of src/lib/supabase/* (server-only queries)
│       ├── supabase/                   # **v2.13.4-structured** server data layer — every read/write logs its errors (no silent catch)
│       │   ├── client.ts               #   `getServerClient()` — the ONLY service-role client factory (returns null if env vars missing)
│       │   ├── cache.ts                #   news_cache TTL helpers
│       │   ├── articles.ts / topics.ts / summaries.ts / videos.ts / bullets.ts / top-summaries.ts / archives.ts / stats.ts / home-surface.ts / podcast-chat.ts / user-chat.ts / user-activity.ts / user-event.ts
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
│       ├── score-video-summary-batch.ts # Batched 1-10 quality scoring of video recaps (cron-video-summary-score)
│       ├── score-format.ts             # Score display helpers (e.g. one-decimal 9-10 band — v2.12+)
│       ├── ai-analyze.ts               # Shared OpenAI analysis helpers (analyzeWithAI, prompts/messages)
│       ├── openai-models.ts            # `OPENAI_MODELS` — single registry of the per-task OpenAI model ids (env overrides for score/moderation/podcast-chat)
│       ├── generate-daily-summary.ts   # Daily SEO summary generation (`gpt-4.1-mini`, AI + DB insert + bullets mirror)
│       ├── generate-top-summary.ts     # Daily Top 24h snapshot (`gpt-5.5`) — **v2.13.5+** `selectTopArticleBullets()` caps persisted bullets at 8 (2 pinned videos + 6 articles)
│       ├── generate-video-roundup.ts   # **v2.4+**: Per-topic-per-day video roundup (`gpt-5.3-chat-latest`, 8 bullets, 48 h source window)
│       ├── video-bullets.ts            # `extractBulletsFromMarkdown`, `buildVideoBulletRows` (per-video bullet mirror)
│       ├── transcribe-video.ts         # **v2.5+**: Core video transcription pipeline — extracted from /api/youtube-channels/transcribe so it's shared between the sync route (`gpt-4.1-mini`, 25 s timeout) and the cron pre-warm (**v2.5.4+** `gpt-5.3-chat-latest`, 180 s timeout)
│       ├── transcript-api.ts           # TranscriptAPI client (resolve, latest, transcript)
│       ├── refresh-youtube-videos.ts   # RSS refresh of youtube_videos (shared by API + transcribe cron step 0)
│       ├── youtube-duration.ts         # `enrichDurations()` — YouTube Data API v3 backfill of `youtube_videos.duration_sec` (Shorts filter)
│       ├── newsletter-snapshot.ts      # **v2.6.12+** `getNewsletterSnapshotForLang()` — snapshot + bullets read for the newsletter cron
│       ├── email/render-daily-newsletter.ts # **v2.6.12+** Pure renderer { subject, html, text } (inline styles, 600px table, Gmail/Outlook safe)
│       ├── email/render-share-email.ts # Pure renderer for the « share by email » message (HTML-escaped user strings, same email constraints)
│       ├── watchdog-checks.ts          # Pure freshness-watchdog evaluation (thresholds + problem strings, zero I/O) — consumed by cron-watchdog
│       ├── podcast-chat-context.ts     # **v2.13+** Server-side system-prompt builder for the Daily Podcast chat (grounded in the day's snapshot)
│       ├── user-chat.ts                # **v2.14+** Pure Community-chat helpers (display-name resolution, avatar colour/initial, message grouping, URL split) — shared by route + panel + tests
│       ├── user-chat-moderation.ts     # **v2.14+** Community-chat moderation gate (single cheap LLM verdict: respect + tech-only-but-lenient; trivial-allow fast-path; fail-open)
│       ├── news-fetch.ts / summary-routes.ts / spa-navigation.ts / track.ts / tts.ts / text-artifacts.ts / notification-sound.ts / crypto-cache.ts / crypto-preferences.ts / crypto-tradingview.ts / crypto-indicators.ts # Misc client/server helpers
│       ├── landing-content.ts          # Static content for the SSR landing page (EN+FR copy, pricing plans)
│       └── changelog-entries.ts        # Type + re-export of src/data/changelog-entries.json (auto-synced to DB on first /api/changelog after deploy)
├── netlify/
│   └── functions/
│       ├── shared/
│       │   ├── cron-log.ts                     # **v2.13.4+** `startCronRun()` → log/elog/elapsedMs/remaining — immediate (non-buffered) logging used by all 8 crons
│       │   ├── fetch-topic.ts                  # Re-exports `@/lib/fetch-topic-dynamic` for cron bundling
│       │   ├── score-topic.ts                  # Re-exports `@/lib/score-topic-dynamic` for cron bundling
│       │   ├── generate-daily-summary.ts       # Re-exports `@/lib/generate-daily-summary`
│       │   ├── generate-video-roundup.ts       # Re-exports `@/lib/generate-video-roundup`
│       │   ├── topic-date-cron.ts              # Shared topic × date × lang loop driver (daily-summary + roundup crons)
│       │   ├── cron-alert.ts                   # Operator alerting via Resend (`ALERT_EMAIL_TO`; unset = disabled; never throws, ≤ 10 s)
│       │   ├── cron-auth.ts                     # `checkCronSecret(req)` — shared `CRON_SECRET` guard for the public Netlify cron endpoints (`?secret=` or `x-cron-secret`); warn-only until `CRON_ENFORCE_SECRET=true`
│       │   └── transcribe-video.ts             # **v2.5+**: Re-exports `@/lib/transcribe-video` for cron bundling
│       ├── cron-fetching-background.ts         # Claimed RSS fetch (15 min wall budget, every 15 min)
│       ├── cron-scoring-background.ts          # Multi-pass AI scoring (15 min wall budget, every 15 min)
│       ├── cron-daily-summary-background.ts    # Daily SEO summary generation (every 15 min, all topics × EN+FR, skip-if-exists)
│       ├── cron-video-roundup-background.ts    # **v2.4+**: Per-topic-per-day roundups, **v2.4.1+** 48 h source window
│       ├── cron-video-transcribe-background.ts # **v2.5+**: Pre-warm transcribe of every "today's" video, EN+FR; **v2.5.4+** uses `gpt-5.3-chat-latest` with a 180 s OpenAI timeout
│       ├── cron-video-summary-score-background.ts # Batched 1-10 quality score for video recaps (`VIDEO_SUMMARY_SCORE_*` tunables)
│       ├── cron-top-summary-background.ts      # Daily Top 50 AI summary snapshot (gpt-5.5, EN+FR), persisted into `top_summaries`. Reads served by GET /api/news/top-summary/latest — no on-demand LLM call from /top-articles anymore.
│       ├── cron-newsletter-daily-background.ts # **v2.6.12+** Daily Top 24h newsletter via Resend (reads today's snapshot, 100-recipient batches)
│       └── cron-watchdog.ts                    # Hourly synchronous freshness watchdog — checks OUTPUT data (today's snapshot, fetch/score staleness, transcriptions) and emails the operator via shared/cron-alert.ts
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
│   ├── 021-video-summary-score.sql         # video_transcriptions.summary_score + summary_scored_at (AI recap quality 1-10)
│   ├── 022-home-surface-queue.sql          # **v2.6+** home_surface_queue (article + video round-robin queue) + pick_home_surface() RPC + backfill
│   ├── 023-video-title-localized.sql       # **v2.5.x+** video_transcriptions.title_localized (per-lang AI title)
│   ├── 024-summary-bullets-title.sql       # summary_bullets.title (short journalistic title per Top articles bullet)
│   ├── 025-top-summaries.sql               # top_summaries snapshot for the daily Top articles cron (gpt-5.5)
│   ├── 026-summary-bullets-importance.sql  # **v2.6.9+**: summary_bullets.importance_score 1-10 (Top 24h group-level editorial importance, propagated by analyzeWithAI flatten)
│   ├── 027-articles-image-url.sql          # articles.image_url (RSS thumbnail backfill for Top 50 cards)
│   ├── 028-articles-stats-indexes.sql      # composite indexes for the per-topic Stats query push-down
│   ├── 029-user-activity.sql               # **v2.9+**: per-user UI toggle state (e.g. home Top 24h « Lu » per snapshot date)
│   ├── 030-user-event.sql                  # **v2.10+**: append-only event log (anonymous + authenticated visitors, owner-only User Activity dashboard)
│   ├── 031-summary-bullets-uniqueness.sql  # **v2.10.3+**: UNIQUE DEFERRABLE on (daily_summary_id|video_roundup_id|video_transcription_id, bullet_index) — must run AFTER 032
│   ├── 032-summary-bullets-cleanup.sql     # **v2.10.3+**: normalize legacy source_type 'article'→'daily_summary'; dedup historical doubles per business key
│   ├── 033-podcast-chat-messages.sql       # **v2.11+**: podcast_chat_messages — per-user Daily Podcast chat threads keyed (user_id, summary_date)
│   ├── 034-video-summary-score-decimal.sql # **v2.12+**: video_transcriptions.summary_score SMALLINT → NUMERIC(3,1) (decimal AI quality scores)
│   ├── 035-global-article-kpis-rpc.sql     # **v2.12+**: global_article_kpis() RPC — single-query KPI rollup for the Stats page
│   ├── 036-summary-bullets-importance-decimal.sql # summary_bullets.importance_score SMALLINT → NUMERIC(3,1) (decimal score for Daily Podcast video bullets)
│   ├── 037-home-surface-queue-score-decimal.sql # home_surface_queue.score SMALLINT → NUMERIC(3,1) + video-score backfill + pick_home_surface NUMERIC threshold
│   ├── 038-crypto-top50-metadata.sql # crypto_prices CoinGecko metadata (coin_id, name, market_cap_rank) for customizable top-50 ticker
│   ├── 039-user-chat-messages.sql # **v2.14+**: user_chat_messages — single global public Community chat room (public SELECT RLS + Realtime; writes via /api/user-chat service role)
│   └── 040-user-chat-delete-realtime.sql # **v2.14+**: user_chat_messages REPLICA IDENTITY FULL so Realtime DELETE payloads include the deleted row id
├── .gitignore
├── .env                                    # API keys (not committed)
├── netlify.toml                            # Netlify build + redirect config — **v2.13.5+** build command is `npm test && npm run build` (a red test blocks the deploy)
├── package.json                            # version is the source of truth (synced by scripts/release.mjs)
└── tsconfig.json
```

### 3.1 `src/app/components/` — feature UI

**SPA + shared**: `AppHeader` (**v2.5.17+** mounts the `CryptoTicker` on every page except `currentPage === "landing"`), `CryptoTicker` (**v2.5.17+** live top-50 CoinGecko ticker — see §19), `CryptoTickerSettingsPage` (settings-page section, search + max-12 checkbox selection), `GeneralMenu` (+ `SeoGeneralMenu`), `SeoNavBar` (**v2.5.3+** intercepts language toggle to persist `preferred_lang`), `AuthModal`, `BriefingPage` (the SPA's default landing — **v2.6.6** order: `Top24hHero` → TOP VIDEO → Top story → All transcribed videos → Trending strip → daily summary teaser → Top 5 → Your topics → Footer CTAs), **`Top24hHero`** (v2.6.6 — gold accordion card pinned at the top of the home, reads `GET /api/news/top-summary/latest`, shows group titles only and expands sub-bullets on click), `TopFeedSection`, `SummaryBox` (v2.6.5+ renders an optional `bullet.title` in gold above each bullet body, groups consecutive same-title rows), `AllArticlesTab`, `StatsPage`, `CronMonitorPage`, `TopicsPage/`, `FeedsAdminPage`, `CategoriesPage`, `FavoritesPage`, `FavoriteButton`, `CopyLinkButton`, `ScoreMeter`, `ChangelogPage`, `SettingsPage` (`MyAccountSection`, `UsersSection`, `VoiceAccordion`, crypto ticker top-50 selector), `AudioPlayer`, `TopicPersonalizationBar`, `TopicOnboardingModal`, `SummariesBrowsePage`.

**Video surface**: `VideosPage` (today / day-by-day video list with Shorts toggle), `VideoCard` (iframe embed with **v2.x+** localhost-aware `youtube-nocookie` swap to fix black-screen; **v2.13.5+** every displayed title/description/aria-label/TTS intro goes through `stripEmojis()` from `video-card/VideoCardHelpers.ts` — raw titles stay untouched in DB and API payloads), `VideoPageAudio`, `DownloadTranscriptButton`.

**Helper subfolders (v2.13.4 dedup)**: `briefing/` (home sections + `styles.kicker()` + the single `HistoryArrows` component shared by TOP STORY / TOP VIDEO / Top 24h chevrons), `top24h/` (`Top24hHeroHelpers.ts` — `groupBullets`/`countGroups`, `top24h-cache.ts`), `video-card/` (`VideoCardHelpers.ts` — `stripEmojis`, `extractVideoBulletText`), `app-shell/`, `podcast-chat/` (**v2.13+** `DailyPodcastChatPanel` + `PodcastChatMarkdown`), and `video-markdown.tsx` (**v2.13.4+** single react-markdown component map with a `card`/`page` size variant — replaces the former `VideoCardMarkdown.tsx` + `video-page-markdown.tsx` duplicates). Pure helpers in these folders carry colocated `__tests__/` vitest suites.

**SSR-page-specific**: `DailySummariesPage` (admin generator), `DailySummaryArticles`, `DailySummaryAudio`, `SummaryExplorer` (legacy quick-jump component; no longer mounted on `/archives` since v2.6.13 — kept in the tree for potential reuse but currently orphaned), `YouTubeChannelsPage` (admin), **`ArchivesPage`** + **`ArchivesTimeline`** + **`ArchivesBrowsePage`** (**v2.6.11+** unified hub on `/archives` — SSR shell renders initial 7-day snapshot, the client hydrates filters + pagination; SPA mirror at `/app/archives`), **`TopDayPage`** (**v2.6.11+** cross-topic Top 24h archive at `/{YYYY-MM-DD}`, reuses `Top24hHero` with `defaultOpen + showSeeAllLink=false` and lists the 50 frozen sources with score / topic chip).

**Landing only** (under `landing/`): `LandingNav`, `LandingHero`, `LandingTicker`, `LandingStats`, `LandingHow`, `LandingTopics`, `LandingYT`, `LandingPricing` (**v2.5.4+** monthly + annual price side-by-side via `.price-row` flex), `LandingFAQ`, `LandingCTA`, `LandingFooter`, `LandingConsole`.

### 3.2 `src/app/api/` — route handlers

```
api/
├── news/
│   ├── route.ts                  # GET /api/news — Supabase read + AI analysis (per-topic relevant articles, v2.6.6+ gpt-4.1-nano)
│   ├── all/route.ts              # GET /api/news/all — All articles (lazy load, up to 1000)
│   ├── top/route.ts              # GET /api/news/top — Top scored articles (Top 50)
│   ├── strips/route.ts           # **v2.13.8+** GET /api/news/strips — batch per-topic mini-feeds for the home « Vos topics » section (single Supabase read, no LLM)
│   ├── top-story/route.ts        # **v2.6+** GET — home TOP STORY hero pick from `home_surface_queue` (10-min buckets, `?offset=` history)
│   ├── top-summary/route.ts            # POST — manual replay/debug for the Top articles snapshot. Delegates to `generateTopSummary` (gpt-5.5). UI no longer calls it.
│   └── top-summary/latest/route.ts     # **v2.6.5+** GET — read latest pre-computed `top_summaries` snapshot (used by /top-articles + the home `Top24hHero` accordion).
├── videos/
│   └── top/route.ts              # **v2.6+** GET — home TOP VIDEO hero pick from `home_surface_queue` (kind=video)
├── archives/
│   └── route.ts                  # **v2.6.11+** GET — paginated archives timeline data (topic/type filters, 7-day pages)
├── podcast-chat/
│   └── route.ts                  # **v2.13+** GET/POST/DELETE — Daily Podcast chat (requireSession; POST streams the answer, persists the turn; 409 when no snapshot)
├── user-chat/
│   └── route.ts                  # **v2.14+** GET (public history) / POST (requireSession, validated, service-role insert) / DELETE (owner-only moderation) — global Community chat room; live INSERTs/DELETEs via Supabase Realtime
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
├── video-transcript/
│   └── route.ts                  # GET — raw transcript download (.txt)
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
│   ├── favorites/route.ts        # GET/POST/DELETE article favorites
│   ├── activity/route.ts         # **v2.9+** GET/PUT per-user UI toggle state (e.g. Top 24h « Lu » per snapshot date)
│   └── event/route.ts            # **v2.10+** POST append-only event log (anonymous + authenticated)
├── categories/                   # GET/POST/PATCH/DELETE — category CRUD (owner)
├── feeds-admin/route.ts          # GET — feeds + per-source stats (owner)
├── fetch-feeds/route.ts          # GET — manual RSS fetch (CRON_SECRET)
├── stats/route.ts                # GET — dashboard statistics
├── cron-stats/route.ts           # GET — cron monitoring KPIs + timeline
├── tts/route.ts                  # POST — ElevenLabs Text-to-Speech
├── crypto/route.ts               # **v2.5.17+**: GET — BTC/ETH/SOL/XRP prices for the AppHeader ticker (60 s Supabase + edge cache, ≤ 1 CoinGecko call/min shared across all users) — see §19
└── changelog/route.ts            # GET — release notes (auto-syncs `src/data/changelog-entries.json` to DB on first call)
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
| `summary_bullets` | Individual bullets with AI-extracted named entities (GIN-indexed). **`source_type`** column = `daily_summary` \| `top50` \| `video` \| `video_roundup` (since **v2.10.3+** — legacy default was `'article'`, normalized to `'daily_summary'` by migration 032). Optional FKs: `daily_summary_id`, `video_transcription_id`, **v2.4+ `video_roundup_id`** (migration 018). **v2.6.5+** `title` (short editorial headline; populated by Top 24h **and** video roundups since v2.10.3 — migration 024). **v2.6.9+** `importance_score SMALLINT` (1-10 editorial importance for the GROUP a Top 24h bullet belongs to — same value across every row of a same-`title` run, propagated by `analyzeWithAI` flatten — migration 026). **v2.10.3+** UNIQUE DEFERRABLE constraints on `(daily_summary_id, bullet_index)`, `(video_roundup_id, bullet_index)`, `(video_transcription_id, bullet_index)` (migration 031) prevent concurrent-CRON duplicates; `'top50'` rows intentionally excluded (multi-topic fan-out, deduplicated at read time). **All writers are CRON-only since v2.10.3** — user-facing transcribe / prewarm routes set `persistBullets=false` and the next cron tick backfills. |

**Writers map (v2.10.3+).** Each `source_type` has exactly one CRON writer; user actions never insert rows.

| `source_type` | Writer CRON | Helper | Dedup key |
|---|---|---|---|
| `daily_summary` | `cron-daily-summary-background.ts` | `insertSummaryBullets` | `(daily_summary_id, bullet_index)` |
| `top50` | `cron-top-summary-background.ts` | `insertTopSummaryBullets` | `(source_type, lang, summary_date)` at delete time; **no UNIQUE** (multi-topic fan-out, read-time dedup) |
| `video_roundup` | `cron-video-roundup-background.ts` | `insertVideoRoundupBullets` | `(video_roundup_id, bullet_index)` |
| `video` | `cron-video-transcribe-background.ts` (regular pass + backfill pass) | `insertVideoBullets` via `buildVideoBulletRows` | `(video_transcription_id, bullet_index)` |
| `youtube_channels` | YouTube channel registry (channel_id, handle, title, thumbnail). Auto-refreshed when title/thumbnail are missing. |
| `youtube_videos` | Cached video metadata from RSS (persists past-date lookups). **Includes `duration_sec`** (backfilled by `enrichDurations()` via YouTube Data API v3 — drives Shorts filtering in both the SPA and the cron) and **`topic_id`** (set when the parent channel belongs to a topic — required for `/v/` SSR slug). |
| `video_transcriptions` | Full transcript text + AI Markdown summary per (video, lang). **v2.x+** `slug_keywords` + `published_date` columns + `idx_vt_route` (route resolution by `(topic_id, published_date, lang, slug_keywords)`) and `idx_vt_topic_recent` (recent-videos block) — migration 016. **Migration 021** adds `summary_score` (1-10) + `summary_scored_at` (filled by `cron-video-summary-score-background`). |
| `video_roundups` | **v2.4+** Per-topic-per-day **video roundup** briefings (8-bullet structured Markdown). Columns: `topic_id`, `roundup_date`, `lang`, `slug_keywords`, `seo_title`, `seo_description`, `intro_md`, `video_ids TEXT[]` (ordered list of `video_transcriptions.video_id`). `UNIQUE(topic_id, roundup_date, lang)`. Drives `/{topic}/r/{date}/{slug}` and the « video roundup » slot on the unified `/archives` timeline (**v2.6.11+**). Migration 017. |
| `home_surface_queue` | **v2.6+** (migration 022) Round-robin queue feeding the home page TOP STORY (article) and TOP VIDEO (video) cards. One row per `(kind, ref_id, lang)` discriminated by `kind ∈ ('article', 'video')`. `score` is denormalized at insert time (article ≥ 7 → 2 rows EN+FR; video ≥ 7 → 1 row in its lang); **migration 037** widens it to `NUMERIC(3,1)` so article scores stay integer-like (9.0) while video recap scores preserve one decimal (9.4). `display_count` is bumped atomically by `pick_home_surface()` when a row wins a 10-min wall-clock bucket. Order for the live pick is `(display_count ASC, last_displayed_at ASC NULLS FIRST, inserted_at DESC)` — un-shown items first, then round-robin within a count, then freshest insertions. The history-mode read (chevron browse, **v2.6.1+**) uses a different ordering — `(last_displayed_at DESC NULLS LAST, inserted_at DESC)` — so the user walks back through the actual rotation chronology, then through never-displayed candidates by insertion freshness. RLS: service-role only. |

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

Entries are defined in **`src/data/changelog-entries.json`** (typed and re-exported by `src/lib/changelog-entries.ts` — **v2.13.4+**, was a 580 KB TS literal before) and auto-synced to the DB on first `GET /api/changelog` call after deploy. Legacy seed data lives in `migrations/005-changelog.sql`. No manual SQL needed for new releases.

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

All cron functions run as **Netlify background functions** (15 min wall budget). Triggers come from **cron-job.org** (POST every 15 min for fetching and the heavier scoring/transcribe/summary jobs — Netlify's own scheduling is not used so the cadence stays decoupled from the deploy). Background functions return 202 immediately; cron-job.org accepts that as success.

Canonical implementations live in `src/lib/`:
- `fetch-topic-dynamic.ts` (`fetchAndStoreTopicDynamic`, returns `FetchResult`)
- `score-topic-dynamic.ts` (`scoreAndStoreTopicDynamic`, `scoreTopicForCron`)
- `generate-daily-summary.ts` (`generateDailySummary`)
- `generate-video-roundup.ts` (`generateVideoRoundup`) — **v2.4+**
- `transcribe-video.ts` (`transcribeVideo`) — **v2.5+**, shared between the synchronous API route and the pre-warm cron

`netlify/functions/shared/*.ts` re-export those modules for the cron bundle. `GET /api/fetch-feeds`, `POST /api/summaries/generate`, `POST /api/roundups/generate` and `POST /api/youtube-channels/transcribe` call the same libraries (auth via cookie session and/or `CRON_SECRET`).

#### `cron-fetching-background.ts` — RSS fetching

- Triggered every 15 min by cron-job.org
- Default timing: `CRON_BACKGROUND_FETCH_TIMEOUT_MS = 900_000`, `CRON_BACKGROUND_FETCH_BUDGET_MS = 870_000`, `CRON_BACKGROUND_FETCH_INTERVAL_MS = 900_000`, `FETCH_STALE_THRESHOLD_MS = 600_000`, `CRON_BACKGROUND_FETCH_SAFETY_RESERVE_MS = 15_000`
- Loads active topics ordered by oldest `last_fetched_at` (nulls first)
- Single-pass by default (`FETCH_MAX_PASSES = 1`) for the 15-min cadence; set `FETCH_MAX_PASSES = 0` for a one-off catch-up run that keeps looping until budget guard
- The stale threshold intentionally defaults to 10 min, below the 15-min scheduler interval, so topics claimed a few minutes into the previous run remain eligible on the next tick.
- `last_fetched_at` doubles as a lightweight claim timestamp. Each topic claim is an `UPDATE ... WHERE last_fetched_at IS NULL OR last_fetched_at < cutoff`, so overlapping background invocations skip topics already claimed by another run.
- For each claimed topic: fetches all active RSS feeds, parses, upserts into `articles`
- Emits structured run metrics (elapsed, inserted, claim skips, deadline stops)

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
- Mirrors bullets to `summary_bullets` with `source_type = 'daily_summary'` (since **v2.10.3+**, was `'article'` by DB default before) and `daily_summary_id` FK; UNIQUE `(daily_summary_id, bullet_index)` since migration 031

#### `cron-video-roundup-background.ts` — **v2.4+** Per-topic-per-day video roundups

- Triggered every 15 min by cron-job.org (typically a single nightly tick produces yesterday's roundups; subsequent ticks are no-ops)
- `WALL_MS = 840_000`, `BUDGET_MS = 810_000`, `SAFETY_MS = 15_000`, `MAX_TOPICS_PER_RUN = 5`
- For each active topic × `(en, fr)` × yesterday's `roundup_date`, calls `generateVideoRoundup`:
  - **v2.4.1+** Source window: 48 h ending at end-of-yesterday (covers `published_date IN [day-before-yesterday, yesterday]` so the briefing is dense even on slow news days)
  - Pulls the matching `video_transcriptions` rows for `(topic, lang)`
  - **`gpt-5.3-chat-latest`** generates a structured 8-bullet briefing (each: bold journalistic title 3-8 words + 3-5 sentence body), plus `seo_title` (no generic phrasing), 5-7 specific kebab-case `slug_keywords` (forbidden: `news`, `briefing`, `daily`, `ai`, `tech`, `video`, `today`), and a `seo_description` with ≥ 3 specific terms
  - Persists in `video_roundups` (`UNIQUE(topic_id, roundup_date, lang)` — re-runs update in place)
  - **v2.4+ Mirrors the 8 bullets** into `summary_bullets` with `source_type = 'video_roundup'`, `bullet_index = 0..7`, `video_roundup_id` FK (migration 018). **v2.10.3+** the `### Title` is persisted in the dedicated `title` column (mig 024) instead of being embedded as `**Title**\\n\\nBody` markdown inside `text`; `refs` is passed explicitly as `[]` (rich per-bullet source attribution lives in `video_roundup_videos`); UNIQUE `(video_roundup_id, bullet_index)` since migration 031. If migration 018 is missing the mirror logs a single `WARN` and does not fail the roundup itself.

#### `cron-video-transcribe-background.ts` — **v2.5+** Pre-warm video transcription cache

- Triggered every 15 min by cron-job.org
- `WALL_MS = 840_000`, `BUDGET_MS = 810_000`, **v2.5.4+ `SAFETY_MS = 200_000`** (must be > the per-call OpenAI timeout so the budget guard never starts a transcribe it can't finish), `MAX_BUCKETS_PER_RUN = 40`
- Source pool: `youtube_videos` published in the last 24 h, with `topic_id` set (so the `/v/` SSR page can be generated downstream)
- Backfills missing `duration_sec` via `enrichDurations()` (YouTube Data API v3) before filtering
- **Skip Shorts**: any video with `duration_sec < 180` is excluded (matches the SPA's default toggle)
- Single bulk SELECT on `video_transcriptions(video_id, lang)` builds a `Set<videoId|lang>` of already-done buckets — fast-skip pattern, no per-bucket cache check
- For each candidate × `(en, fr)`: full pipeline on the first lang (~25-90 s on `gpt-5.3-chat-latest`), then translate path on the second lang (~15-25 s) since the alt-lang cache row now exists
- **v2.5.4+** Calls `transcribeVideo()` with `model: "gpt-5.3-chat-latest"` and `openaiTimeoutMs: 180_000` (vs the synchronous route's `gpt-4.1-mini` + 25 s budget). Result: ~95 % of summaries a real visitor sees come from this higher-quality background pre-warm path; the synchronous on-demand button is now only a fallback for very-fresh videos not yet picked up by a tick

#### `cron-top-summary-background.ts` — Daily Top articles AI summary snapshot

- Triggered **once a day** by cron-job.org (suggested `0 2 * * *` UTC). Each tick produces both `en` and `fr` snapshots in sequence.
- Driver: a flat loop over `['en','fr']` calling the shared lib `generateTopSummary(today, lang)`. Per-lang `try/catch` so a failure on one lang never blocks the other.  No fan-out by topic — the Top 50 is a global cross-topic feed.
- Pipeline per lang:
  - Pulls the top 50 articles of the last 24 h via `getTopArticlesForStats(null, 1, 50)` excluding `is_displayed=false` topics (mirror of what `/api/news/top` returns to the live feed).
  - Calls `analyzeWithAI` with **`gpt-5.5`** and the editorial prompt. **v2.6.6+** the prompt produces a **grouped JSON shape** — `globalSummary[]` is a list of thematic groups `{ title (3-8 word headline), bullets: [{ text (3-5 sentences), refs }] }`. 6-12 groups, 8-15 bullets total (1-3 bullets per group). The parser flattens groups: every sub-bullet inherits its group's `title`, so the existing flat `summary_bullets` schema needs no migration. Renderers (`SummaryBox`, `Top24hHero`) fold consecutive same-title rows back into a visible group. **v2.6.9+** the same prompt also produces an integer `importance: 1-10` per group (calibrated like article `relevance_score`: 10 = breaking news at industry scale, 1-2 = anecdotal). The flattener clamps and propagates the score to every sub-bullet alongside `title`, persisted in `summary_bullets.importance_score` (migration 026, nullable + CHECK 1..10). `Top24hHero` reads it from `group.bullets[0]` and renders a `<ScoreMeter>` next to each group title — **replaces** the previous paragraph-count badge in the same slot.
  - **JSON parse retry (v2.6.6)**: `analyzeWithAI` retries the OpenAI call once if the first response fails to parse, and logs the first 400 chars of the raw response on the second failure. Fixes the prior "FR snapshot silently missing while EN succeeded" pattern caused by an occasional malformed JSON on the second sequential call.
  - Persists the snapshot atomically: a row in `top_summaries (summary_date, lang)` with the frozen 50-article list (JSONB) + the rendered markdown, then a bullet-by-bullet mirror into `summary_bullets` (`source_type='top50'`, keyed `(lang, summary_date)`). Each row gets the **shared** group title in the dedicated `title` column AND the same `**Title**\n\nbody` markdown prefix in `text` so plain-text consumers keep the visual hierarchy without joining on `title`.
  - **v2.13+** Two pinned « top videos of yesterday » bullets (carrying a `video_transcription_id`) always open the briefing, ahead of the article groups. Home, audio player, `/{date}` archives and the daily newsletter all read the same rows.
  - **v2.13.5+** The persisted bullets are **capped at 8 total**: 2 pinned video bullets + the 6 most important article bullets, selected at generation time by `selectTopArticleBullets()` in `generate-top-summary.ts` (consecutive same-title bullets folded into their group, groups stable-sorted by `importance` DESC, bullets taken group by group preserving narrative order). The LLM still produces the full 6-12 group briefing — the complete markdown stays in `top_summaries.summary_md` and keeps grounding the podcast chat.
- Idempotent: re-ticking the same day deletes the previous row first (both for `top_summaries` and the matching `summary_bullets` rows). Useful when the operator wants a refresh after late-arriving high-score articles.
- Date override: `TOP_SUMMARY_DATE=YYYY-MM-DD` to backfill or replay a past date.
- Bootstrap after first deploy: `curl https://<host>/.netlify/functions/cron-top-summary-background` so the page has a row to render before the next scheduled tick.
- Read path: `GET /api/news/top-summary/latest?lang=…` returns the latest available row (transparent fallback to yesterday if today's tick hasn't landed). The /top-articles page AND the home `Top24hHero` accordion read exclusively from this endpoint; **no on-demand LLM call from any user-facing surface anymore**.

#### `cron-newsletter-daily-background.ts` — Daily Top 24h newsletter (v2.6.12+)

- Triggered **once a day** by cron-job.org (suggested `30 6 * * *` UTC — ~30 min after `cron-top-summary-background`'s suggested `0 6 * * *` so the day's snapshot is freshly written before we read it). One tick processes both langs.
- Pipeline:
  1. Read **today's UTC** snapshot per lang via `getNewsletterSnapshotForLang(lang, todayUtc())` (`src/lib/newsletter-snapshot.ts` → `getTopSummaryByDate` + bullets). **No fallback** to `getLatestTopSummary`: re-sending yesterday's edition duplicates mail for subscribers who already got it. If today's `cron-top-summary-background` row is missing, the tick aborts with `no_snapshot_for_date` — fix or replay the snapshot cron, or set `NEWSLETTER_SUMMARY_DATE=YYYY-MM-DD` for a one-off backfill send.
  2. Page through `supabase.auth.admin.listUsers({ perPage: 1000 })` and bucket subscribers (`user_metadata.daily_newsletter === true`) by `user_metadata.preferred_lang` (fallback `"en"`; if a lang's snapshot is missing, the bucket falls back to the other lang's snapshot rather than dropping the user).
  3. Render once per lang via `src/lib/email/render-daily-newsletter.ts` — pure function producing `{ subject, html, text }` from the snapshot + bullets. The HTML mirrors the website's `Top24hHero` register (gold serif group titles, white body, gold pill chips for source refs) using **inline styles + a 600px wrapper `<table>`** (no `<style>` blocks, no flex/grid — Gmail/Outlook safe in 2026). The full `snapshot.articles` array is intentionally NOT rendered — the user explicitly asked for the grouped bullets + refs only, to keep the email scannable on mobile.
  4. Ship in 100-recipient chunks via Resend's `POST /emails/batch` endpoint with a `List-Unsubscribe: <mailto:…>` header (RFC 8058) and a `List-Unsubscribe-Post` companion so Gmail surfaces one-click unsubscribe. Per-batch try/catch — a failed batch doesn't abort the run.
- Required env: `RESEND_API_KEY`. Optional: `RESEND_FROM_ADDRESS` (default `"8news <newsletter@8news.ai>"` — the domain must be verified in Resend), `NEWSLETTER_UNSUBSCRIBE_MAILTO` (default `unsubscribe@8news.ai`), `NEWSLETTER_PUBLIC_ORIGIN` (default `https://8news.ai`, used for the « Read online » CTA pointing at `/{summary_date}`).
- No auth check on the URL (URL obscurity — same convention as the other `cron-*-background.ts` siblings). Idempotency: there is no built-in dedup, so triggering the cron twice in a day will send twice. Trust the scheduler.

#### Daily Podcast chat side panel (v2.13+)

A collapsible chat docked on the right edge of the SPA, **collapsed by default** to a slim gold tab. It lets a signed-in user ask questions about the day's Top 24h podcast. UI is `src/app/components/podcast-chat/DailyPodcastChatPanel.tsx` (+ `PodcastChatMarkdown.tsx`), mounted in [src/app/app/page.tsx](src/app/app/page.tsx) only when `isAuthenticated`.

- **Grounding (server-enforced).** `src/lib/podcast-chat-context.ts` rebuilds the system prompt from the day's `top_summaries` snapshot on every turn — per-topic group titles, bullet text and deduped source links — so the client cannot spoof the briefing. The day's running conversation (questions + answers) is re-injected each turn.
- **Persistence.** `migrations/033-podcast-chat-messages.sql` — one row per message; a conversation is the rows sharing `(user_id, summary_date)`. The (user, podcast day) tuple IS the conversation key, so each new day starts a fresh thread for free. Service-role-only RLS, accessed via helpers in `src/lib/supabase/podcast-chat.ts`.
- **API** `src/app/api/podcast-chat/route.ts` (`requireSession`, `no-store`): `GET` hydrates the day's thread; `POST { question, lang }` streams the answer (`text/plain`) and persists the turn server-side after the stream closes (the resolved day is echoed in `X-Summary-Date`), 409 when no snapshot exists; `DELETE` clears the day's thread.
- **Model.** OpenAI `PODCAST_CHAT_MODEL` (default `gpt-5.5`), reusing `OPENAI_API_KEY`.

#### Community chat side panel (v2.14+)

A collapsible **user-to-user** chat docked on the LEFT edge of the SPA (mirror of the Daily Podcast chat, which sits on the right). One global public room — no AI participant for now. Open by default on desktop, closed on phones (full-width overlay). UI is `src/app/components/user-chat/UserChatPanel.tsx` (+ a dependency-free native-emoji `EmojiPicker.tsx`), mounted in [src/app/app/page.tsx](src/app/app/page.tsx) for everyone; a distinct « users » glyph in the header icon cluster toggles it.

- **Read = public, live.** The room is readable by anyone (anonymous included): `migrations/039-user-chat-messages.sql` enables RLS with `SELECT USING (true)` and adds the table to the `supabase_realtime` publication; `migrations/040-user-chat-delete-realtime.sql` sets `REPLICA IDENTITY FULL` so DELETE payloads include the deleted row id. The panel hydrates via `GET /api/user-chat`, subscribes to INSERTs and DELETEs through the browser Supabase client (`postgres_changes`), and periodically reconciles with `GET /api/user-chat` so missed DELETE events still disappear everywhere.
- **Write = authenticated, server-validated.** `POST /api/user-chat` (`requireSession`) trims + length-caps the message and stamps a trusted `display_name` resolved server-side from `user_metadata` (nickname → first name → « Anonymous »), inserting via the service role (`src/lib/supabase/user-chat.ts`). Anonymous visitors can browse; posting routes them to sign-in.
- **Owner moderation.** Signed-in owners/admins can right-click any chat message in the panel and choose « Delete message » / « Supprimer le message ». The client calls `DELETE /api/user-chat?id=...`, protected by `requireOwnerSession()`, and the service role deletes the row. Realtime DELETE events remove it from every open panel.
- **Moderation gate.** `src/lib/user-chat-moderation.ts` runs before the insert: trivial social messages (greetings, yes/no, thanks, emoji) skip it, everything else gets a single cheap-LLM verdict (`USER_CHAT_MODERATION_MODEL`, default `gpt-4.1-nano`) judging respect AND tech-relevance (lenient on tech-adjacent topics) in EN or FR. A reject returns `422 { reason: "off_topic" | "disrespect" }`; the panel shows a localized message and keeps the text for rephrasing. **Fail-open**: missing key / OpenAI error / unparseable output allows the message and logs the incident.
- **Identity.** A `nickname` field added to sign-up (`AuthModal`) and profile editing (`MyAccountSection`), stored in `user_metadata`, lets members stay anonymous in the room. Pure helpers (name resolution, avatar colour/initial, Discord-style message grouping, URL split) live in `src/lib/user-chat.ts` with colocated tests.

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

#### `GET /api/news/strips` — **v2.13.8+** home « Vos topics » batch feed

One-shot replacement for the previous one-`/api/news`-call-per-topic pattern of the home « Vos topics · 24 dernières heures » section (each cold call re-ran a gpt-4.1-nano analysis; the section took ~30 s to fill). Single Supabase batch read (`getScoredArticlesForTopics`, `.in("topic", …)`), **no LLM call**; per-topic regroup/cap + title localization (`title_ai_fr` / `title_ai_en`, fallback raw `title`) by the pure `groupArticlesByTopic()` (`src/lib/topic-strips.ts`, vitest-covered). Fixed 24 h window, `relevance_score ≥ 6` (mirror of `getMinScore(24)`), 6 articles per topic (spares for `selectTopicStrips()` cross-topic dedup), 50 topics max per call. `force-dynamic` + `NO_STORE_HEADERS`.

| Param | Type | Description |
|---|---|---|
| `topics` | string | Comma-separated topic IDs (preferred + fill candidates), required |
| `lang` | `"en"` \| `"fr"` | Title localization |

**Response**: `{ strips: { [topicId]: { title, link, source, pubDate, score }[] } }`.

#### `GET /api/news/top-summary/latest` — **v2.6.5+** primary read path

Returns the latest available pre-computed Top articles snapshot for a given lang (transparent fallback to yesterday's row when today's cron hasn't tickled yet). Shape mirrors the legacy `SummaryResponse` so `SummaryBox` consumes it directly, plus `summaryDate`, `generatedAt`, `model`. 404 when `top_summaries` has no row yet (first deploy before the first cron tick — UI shows the empty state). `Cache-Control: public, max-age=60, s-maxage=300`. Consumed by `/top-articles` and by the home `Top24hHero` accordion.

Bullets in the response carry an optional **`title`** field (since v2.6.5) and may share that title across consecutive rows when the LLM returned the **grouped shape** introduced in v2.6.6 (a single thematic title spans 1-3 sub-bullets). Renderers fold consecutive same-title bullets into one accordion / heading group.

#### `POST /api/news/top-summary` — manual replay / debug

Kept for admin / curl replay after the v2.6.5 refactor; the UI no longer calls it. Accepts an optional `{ articles, lang, date }` body, delegates to the shared `generateTopSummary` lib (same path the cron uses), persists the snapshot in `top_summaries`, mirrors bullets in `summary_bullets`, and re-reads the snapshot back. Uses **`gpt-5.5`** with the grouped editorial prompt (`title` + `bullets[]` per theme; per-bullet headlines 3-8 words; 6-12 groups, 8-15 bullets total). `analyzeWithAI` retries the JSON parse once on failure (v2.6.6) so a malformed first response no longer wipes a whole lang's snapshot.

#### Daily Summaries API

| Route | Method | Description |
|---|---|---|
| `/api/summaries/generate` | POST | Generate (or regenerate) one daily SEO summary for `(topic, date, lang)`. Auth: cookie session **owner** OR header `Authorization: Bearer ${CRON_SECRET}` (used by the cron). Skip-if-exists guard unless `?force=1`. |
| `/api/summaries/routes` | GET | **v2.6.11+** Legacy: all `daily_summaries` route triplets — only consumed by `sitemap.ts` now (the unified archives hub uses `/api/archives` instead). |
| `/api/summaries/[topic]/[date]` | GET | Public read of one daily summary (bullets + articles + SEO metadata) — `?lang=` selects the variant. |
| `/api/archives` | GET | **v2.6.11+** Unified read endpoint backing `/archives`. Params: `lang`, `from`, `to`, `topic?`, `type?` (`all` \| `articles` \| `videos`). Returns `{ days: [{ date, topics: [{ topic_id, dailySummary?, videoRoundup?, transcribedVideoCount }], hasTopSummary }], from, to, lang }`. **v2.6.11+** `hasTopSummary` per day flags the existence of a cross-topic snapshot in `top_summaries` so the client renders the gold « ALL TOPICS » box conditionally. Cached `s-maxage=300`. |

#### Video Roundups API — v2.4+

| Route | Method | Description |
|---|---|---|
| `/api/roundups/generate` | POST | Generate (or regenerate) one **video roundup** for `(topic, date, lang)`. Auth: cookie session **owner** OR header `Authorization: Bearer ${CRON_SECRET}`. Body: `{ topicId, date, lang, force? }`. Mirrors the 8 bullets into `summary_bullets` (silent best-effort if migration 018 is missing). |

The matching SSR pages (`/[topic]/r/[date]/[slug]` and the « video roundup » slot on `/archives`, **v2.6.11+**) read `video_roundups` directly via the service-role client in `lib/supabase.ts` (`getAllVideoRoundupRoutes`, `getVideoRoundupByRoute`) — no client API call required. The legacy `/briefings` hub 308-redirects to `/archives?type=videos`.

#### Video transcription / video pages API

| Route | Method | Description |
|---|---|---|
| `/api/youtube-channels/videos` | GET | Day-by-day video list per channel (RSS fetch + DB cache + `enrichDurations()` backfill). Drives the SPA `VideosPage`. |
| `/api/youtube-channels/transcribe` | POST | **Synchronous** on-demand transcribe — calls `transcribeVideo()` with `model = "gpt-4.1-mini"` and a 25 s OpenAI timeout (Netlify cap is 30 s on serverless functions). Cross-language optimization: if a transcription exists in the other language, translates the existing summary instead of re-transcribing (saves 1 TranscriptAPI credit + ~80 % tokens). |
| `/api/youtube-channels/transcript` | GET | **v2.5+** Returns the raw transcript text for one `(video_id, lang)` as `text/plain` so the user can download a `.txt` from the SPA (`DownloadTranscriptButton`). |
| `/api/video-transcription` | GET | Public read of a single transcribed video (used by SSR `/[topic]/v/[date]/[slug]`). |
| `/api/video-pages/recent` | GET | **v2.3+** Paginated list of recent transcribed videos for the SPA's Briefing homepage. Params: `?lang=` (en/fr), `?page=` **1-indexed** (default 1), `?pageSize=` (default 10, clamped to `[1, 50]`). Response: `{ items, page, pageSize, totalCount, totalPages }`. Items are a flat view ordered `published_date DESC, created_at DESC` across the entire archive (no day grouping). The "Toutes les vidéos transcrites" section is hidden when `totalCount === 0`. |
| `/api/news/top-story` | GET | **v2.6+** Backed by `home_surface_queue` (migration 022). Params: `?lang=` (en/fr), `?offset=` **default 0** (live mode = atomic `pick_home_surface(p_kind='article', p_lang, p_min_score, p_excluded_topics)` that picks the lowest-`display_count` row matching the visitor's `homeMinScoreArticle` cookie threshold and bumps `display_count` in the same statement). For `offset > 0` (**v2.6.1+**) the endpoint runs a **read-only** SELECT — `ORDER BY last_displayed_at DESC NULLS LAST, inserted_at DESC RANGE(offset, offset+1)` — so the home « previous » chevron walks back through the rotation chronology without mutating any counter. Response: `{ article, hasOlder, offset }`; `hasOlder` lets the client disable the left chevron at the end of the pool. Hidden topics are filtered inside the RPC AND in the history SELECT. Hydrates from `articles` for the response. Live mode is dedup'd inside the warm Function via a module-level Map keyed by `${lang}:${threshold}:bucket` so all visitors of the same tuple share a single pick per 10-min bucket; **history mode skips the module cache** because each offset is unique. **Caching headers (v2.6.1+)**: `Cache-Control: private, no-store, max-age=0` + `CDN-Cache-Control: no-store` + `Netlify-CDN-Cache-Control: no-store` — Netlify's edge cache turned out to hash on the path only and was collapsing distinct `?offset=N` URLs onto one cache entry, which is why the fix is a full no-store rather than `s-maxage=remaining`. Returns `{ article: null, hasOlder: false }` if the queue is empty for that filter. |
| `/api/videos/top` | GET | **v2.6+** Same DB-backed pick as `/api/news/top-story` but for the TOP VIDEO card. Uses a fixed product threshold **8/10** against `home_surface_queue.score` (ignores legacy `homeMinScoreVideo` cookies); **v2.13.11+ / mig 037** the queue score is decimal (`NUMERIC(3,1)`), so a 9.4 video qualifies. Same `?offset=N` history mode (**v2.6.1+**) and same no-store cache headers. Hydrates from `video_transcriptions` + `youtube_videos` for the card metadata and applies `normalizeSummaryHeadings` to the recap Markdown. Selection is calendar-based in UTC: first try videos published today; if none qualify, fall back to yesterday. If the queue scan finds no candidate, falls back to fresh high-scored `video_transcriptions` so missed queue rows do not blank the home. Response: `{ video, hasOlder, offset }`. Returns `{ video: null, hasOlder: false }` only when neither today nor yesterday has a matching video. |

#### `GET /api/cron-stats`

Cron monitoring endpoint. Returns real-time statistics about fetch and scoring jobs.

**Response** (`CronStatsResponse`):
- `global`: backlog (7d unscored), fetched24h, scored24h, coverage24h %, avgDelayMinutes (mean of `scored_at − fetched_at` in minutes, only articles with `pub_date` in the last 24h and with `relevance_score`, `scored_at`, and `fetched_at` all set)
- `topics[]`: per-topic status (id, label, lastFetchedAt, lastScoredAt, backlog, status: ok/slow/high, optional **statusReason**: `"backlog"` \| `"fetch"` \| `"score"` for slow/high — used in the Topic Status table **Reason** column)
- `timeline[]`: hourly buckets (hour, fetched, scored) for the last 24h

**Status rules**: `high` if backlog >200, fetch age >60min, or (backlog >0 **and** score age >45min); `slow` if backlog ≥50, fetch age >30min, or (backlog >0 **and** score age >30min); `ok` otherwise. **v1.82+**: score age is only penalized when there are unscored articles to process.

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
- Persistent navigation bar (current pill labels, **v2.6.11**): **Today** (= Briefing, default), **All videos** (renamed in v2.6.6 to clarify it's the exhaustive archive vs. the TOP VIDEO hero card on the home), **All topics** (renamed in v2.6.5 from « Articles » so the affordance reads as the entry point to browse every topic), **Top articles 24h** (mirrors the home `Top24hHero` card and the page header), **Archives** (the unified `/archives` hub — replaces the previous standalone « Daily Summaries » + « Video recaps » pills since v2.6.11), **My Favorites** (authenticated only)
- **v2.13.5+** Main labels shortened: « My briefing » → **Briefing** (FR « Ma veille » → **Veille**), « Top articles 24h » → **Top 24h** (both langs), « My topics » → **Topics** (FR « Mes topics » → **Topics**), « YouTube channels » → **YT channels** (FR « Chaînes YouTube » → **Chaînes YT**)
- Active button highlighted with gold border/background
- SSR variant (`SeoGeneralMenu`) used on every SSR page (landing, archives, `/[topic]/...`) with `next/link` `<Link>` (v2.6.8+ for SPA-soft navigation)

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

**Default page**: `BriefingPage` — a composite landing inside the SPA. Vertical order (top → bottom):
1. **Top articles · 24h** — `Top24hHero` accordion card pinned at the very top (**v2.6.6+**). Self-fetches `GET /api/news/top-summary/latest` and renders an accordion of the day's group titles only (gold-bordered card, kicker « TOP ARTICLES · 24H », serif title « Top articles 24 heures », « Generated on … » tag). Each row is a clickable `<button aria-expanded>` with • + title + optional bullet count + chevron `▾` rotating 180° on open; hover highlights via `.top24h-row:hover` (gold). Click expands the bullets that belong to the group + their refs. Hidden silently on 404 (no snapshot yet) or fetch error. Bottom-right « Read the full briefing → » jumps to `/top-articles`.
2. **TOP VIDEO · maintenant** — single transcribed YouTube recap card, rotation pattern via `/api/videos/top` and the `home_surface_queue` (kind=video). `‹ ›` chevron history (v2.6.1+). Layout is **vertical** with a serif `<h2>` title at the top, meta + actions in the middle, and a full-width 16:9 thumbnail at the bottom (uses `VideoCard variant="hero"` with `.video-card-hero` CSS class, see `globals.css`). Fixed threshold **8/10**; selection tries today's UTC videos first, then yesterday. Section auto-hides only when neither day has a qualifying video in the queue or fallback.
3. **TOP STORY · maintenant** — single article hero card driven by `/api/news/top-story` and the `home_surface_queue` rotation (**v2.6+**, see §5.1). Refreshes every 10 minutes on the wall-clock bucket boundary + on `visibilitychange`. **v2.6.1+** discreet `‹ ›` chevrons next to the kicker let the visitor walk back through previously-displayed picks (read-only history mode via `?offset=N`); auto-refresh is suspended while `offset > 0` so the user isn't yanked back to live mid-browse, and resumed on returning to `offset === 0`. Topic label, source, relative time and a CopyLinkButton next to the favorite star sit in the meta row. CTA "Lire l'article →" is filled gold + black text (harmonized with the TOP VIDEO buttons).
4. **Toutes les vidéos transcrites** — `RecentVideoPagesSection`, the "All transcribed videos" pagination block driven by `/api/video-pages/recent`. Flat list, **10 items per page**, classic numbered pagination (Précédent / Page X / N / Suivant). Each row shows the topic pill, the emoji-stripped title, the publication date suffixed after a dash (« — 5 mai 2026 »), and the AI quality score pinned right (`summary_score` from migration 021). Hidden when the language has zero transcribed videos. **v2.6.6+** moved above « Tendances » so the editorial archive sits with the hero block instead of being buried under the trending strip.
5. **Tendances · 6 dernières heures** — `TrendingStrip` (chip rail of topic IDs whose ingestion volume spiked over the last 6 h, falls back to a 24 h window when 6 h is empty). **v2.6.6+** moved below « Toutes les vidéos transcrites ».
6. Daily summary teaser, Top 5, Your topics, Footer CTAs.

**Language sync** (v2.5.3+): on session load, the SPA reads `authUser.user_metadata.preferred_lang` and reconciles `lang` state. If `preferred_lang` is unset for an authenticated user, it's initialised from the current cookie. `handleLangChange()` writes to **both** the cookie and `auth.users.raw_user_meta_data.preferred_lang` via `supabase.auth.updateUser`.

#### `/app/top-articles` (was the on-demand Top 50 surface, **v2.6.5+** snapshot reader)

The dedicated « Top articles 24h » page (general menu pill renamed in v2.6.6 from « Top articles » to « Top articles 24h » to mirror the home accordion) reads exclusively from `GET /api/news/top-summary/latest` — the pre-computed snapshot written once a day by `cron-top-summary-background`. No on-demand LLM call from the UI anymore. The visitor sees:
- A `<SummaryBox>` with the rendered grouped markdown, per-bullet headlines in gold, and source refs.
- A « Generated on … » sub-label under the box (drives off `generatedAt` from the snapshot).
- The frozen 50-article list rendered by `<TopFeedSection>` so each bullet's `refs` always points to a card visible just below — refs ↔ article list coherence is guaranteed by construction.
- Empty state when GET 404s (« Today's AI summary is not available yet — it will appear automatically after the next scheduled run. »); no manual « Generate » button.

`/api/news/top` (live Top 50 endpoint) is **no longer consumed by the UI** since v2.6.5; it stays available as an internal helper for `generateTopSummary` (the cron pulls top 50 articles via `getTopArticlesForStats`, so this endpoint is technically a redundant read path now — kept for debug). The legacy `useTopFeed` hook is no longer mounted on `/top-articles` either; the snapshot drives the entire surface.

#### Action Bar (`TopicPersonalizationBar`)

**v1.96+**: Positioned **above** the topic grid on the per-topic AI analysis surface. Contains:
- **Customize my topics** / **Edit my topics** (personalization mode toggle)
- **Archives** (link to `/archives` public hub — was « Daily Summaries → /summaries » before v2.6.11)
- When in personalization mode: **Done** button, **+ New topic** button, save status

The « Analyze top 50 articles » CTA was removed in **v2.6.5** (the Top articles snapshot is now displayed automatically on `/top-articles` and on the home `Top24hHero`).

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

### 8.12 Archives Hub (`/archives`) — v2.6.11+

Public page at `/archives` (the unified hub that supersedes the previous `/summaries` + `/briefings` parallel routes — both now 308-redirect here, see §8.16). Single timeline grouped by date desc, each day card listing every active topic that has at least one of:
- a daily article summary (link to `/en|fr/[topic]/[date]/[slug]`),
- a video roundup (link to `/[topic]/r/[date]/[slug]`),
- a count of transcribed videos (link to `/[topic]/videos/[date]`).

A gold-bordered « ALL TOPICS / TOUS LES TOPICS » box is pinned at the top of each day card when a cross-topic Top 24h snapshot exists in `top_summaries` for that (date, lang) — the box links to the per-day archive page at `/{YYYY-MM-DD}` (see §8.13).

**Filters** (sticky bar above the timeline): topic dropdown, type radio (all / articles / videos), 7-day window pagination via inline chevrons (`‹` newer, `›` older — same convention as the home heroes' history chevrons in v2.6.4). Empty slots render as muted « no coverage » so day-completeness is legible at a glance.

**Components**: SSR shell at `src/app/archives/page.tsx` calls `getActiveTopics` + `getArchives({ from, to, lang })` to seed the initial 7-day window. The client `<ArchivesPage>` wraps the timeline with filter state + AbortController-aware fetches. The reusable `<ArchivesTimeline>` is pure presentation (data + topics dictionary in, JSX out). The SPA mirror at `/app/archives` mounts `<ArchivesBrowsePage>` which loads topics client-side then delegates to the same `<ArchivesPage>`.

**Endpoint**: `GET /api/archives` (4 parallel SELECTs: `daily_summaries`, `video_roundups`, `video_transcriptions` count, `top_summaries` presence — see API table). Edge-cached `s-maxage=300`.

**v2.6.13**: the `<SummaryExplorer>` quick-jump card (« Accès direct / Quick jump ») was removed from `/archives` — the timeline + topic/type filters above are sufficient and the duplicate entry point added noise. The component itself stays in the tree for potential reuse elsewhere.

### 8.13 Cross-Topic Top 24h Archive Page (`/{YYYY-MM-DD}`) — v2.6.11+

SSR page rendering the cross-topic Top 24h snapshot for one specific date (e.g. `/2026-05-10`). Reached from the gold « ALL TOPICS » box on `/archives` and from the sitemap. Mounted via a date-fork in `[topic]/page.tsx` because Next.js cannot have two `/[seg]/` dynamic routes at the same level — when `params.topic` matches `^\d{4}-\d{2}-\d{2}$`, control passes to `<TopDayPage>`. Topic IDs that look like dates are rejected at create time in `isReservedTopicSlug` so they can never shadow this route.

Renders:
- A H1 « Top articles 24h · {date long} » + breadcrumb « Home → Archives → {date} ».
- The full `<Top24hHero>` accordion (the same component used on the home and on `/top-articles`) reused with `data` (server-fetched snapshot) + `defaultOpen={true}` (every group open up front, the visitor came here for the brief) + `showSeeAllLink={false}` (no loop-back).
- The frozen 50-article source list (score badge tier-colored, topic chip, title link to the source).
- Adjacent-day chevrons « ← Older day / Newer day → » computed from `getAllTopSummaryRoutes()` — skips empty days so the visitor always lands on a snapshot.

404 on direct hits to dates that have no `top_summaries` row. Hreflang en/fr to the same date in the other language.

### 8.14 SEO Daily Summary Pages — v1.95+

Server-rendered public pages for search engine indexing:
- **Topic hub** (`/[topic]`): paginated list of all daily summaries for a topic + a "recent transcribed videos" sidebar
- **Daily summary** (`/[topic]/[date]/[slug]`): full AI summary with bullets, articles, JSON-LD, hreflang, OG metadata, prev/next navigation
- **Sitemap** (`/sitemap.xml`): dynamic, covers every active topic hub, every daily summary, every video roundup, every per-video page, **v2.6.11+** every cross-topic Top 24h archive page (`/{date}`)
- URL format: `8news.ai/en|fr/{topic}/{YYYY-MM-DD}/{keyword1-keyword2-keyword3}` (lang-prefixed since v2.5+; legacy `/{topic}/{date}/{slug}` 308-redirects)
- Generated via `gpt-4.1-mini` with 50 articles, top 10 displayed, enriched prompts for detailed bullets

### 8.15 SEO Per-Video Pages — v2.x

`/{topic}/v/{date}/{slug}` (e.g. `/ai/v/2026-04-25/sora-3-realtime-preview`). Server-rendered from `video_transcriptions` rows joined with `youtube_videos`, with the AI-generated Markdown summary, the embedded video, JSON-LD `VideoObject`, hreflang, and a "Latest videos transcribed in this topic" block driven by `idx_vt_topic_recent`. **v2.6.11+** the « N transcribed videos » counter on `/archives` rows links to `/[topic]/videos/[date]` (a per-day list view of these per-video pages).

### 8.16 SEO Per-Topic-Per-Day Video Roundups — v2.4+

`/{topic}/r/{date}/{slug}` (e.g. `/ai/r/2026-04-24/foundation-models-launch-week`). Server-rendered from `video_roundups` rows. Renders:
- `seo_title` (h1)
- The structured 8-bullet `intro_md` Markdown (each bullet = bold journalistic title 3-8 words + 3-5 sentence body)
- An `ItemList` of the underlying videos (`video_ids`) with thumbnails, titles, channels, durations, links to their `/v/` pages
- JSON-LD `Article` + `ItemList`, hreflang to the EN/FR variant, OG metadata
- **v2.6.11+** Surfaced on the unified `/archives` timeline as the « video roundup » slot of each topic row.

### 8.17 Legacy hubs (`/summaries`, `/briefings`) — v2.6.11+

The previously-parallel `/summaries` (article daily summaries) and `/briefings` (video roundups) hubs are now thin permanent-redirect wrappers. `/summaries` 308-redirects to `/archives` (preserving any `?lang=` query); `/briefings` 308-redirects to `/archives?type=videos`. Both routes are intentionally kept around so external backlinks accumulated over the prior 18 months keep transferring authority into the unified hub instead of returning 404. The SPA's legacy `/app/summaries-browse` path is also kept as a back-compat alias by `pathToPage` and resolves to the same SPA page as `/app/archives`.

### 8.18 Videos Page (`VideosPage`) — v1.99+, evolved through v2.x

Accessible via the General Menu "Videos" button (all users).

- **Date navigation**: prev/next day arrows with MiniCalendar picker between them, plus "Today" shortcut
- **Shorts toggle**: on/off switch on the same line as the date picker, right-aligned. **Default: off** — Shorts (`duration_sec < 180`, i.e. < 3 min) are hidden until the user flips the switch
- **Transcribed badge**: when a `(video_id, lang)` has an existing `video_transcriptions` row, the action button renders a check icon (instead of the "T" text icon). Same color / no panel expansion — clicking still toggles the summary panel.
- **Video cards**: horizontal layout (320 px thumbnail + title, truncated description with "See more", channel, time, views, duration). **v2.13.5+** Titles and descriptions are emoji-stripped at display time (`stripEmojis()` — also applied to aria-labels, iframe title, transcript filename and the TTS intro); raw values stay untouched in DB and API payloads.
- **Transcription button**: triggers AI transcription flow per video (TranscriptAPI + GPT-4.1-mini sync). **v2.x+** Inline spinner inside the button while loading.
- **AI summary display**: Markdown rendered via `react-markdown` (dynamic import, SSR disabled), collapsible. The "Key Points" / "INTRO" headings are normalized via `summary-headings.ts` (FR uses `INTRO`; both langs put a blank line between bold title and body).
- **YouTube embed**: `<iframe>` with `enablejsapi=1`, `playsinline=1`, `origin`, and `referrerPolicy="strict-origin-when-cross-origin"`. **v2.x+ localhost fix**: when `window.location.host` starts with `localhost`, swap the embed host to `youtube-nocookie.com` to bypass the strict-origin black-screen.
- **Pre-warmed by cron**: most "today's" non-Shorts videos already have a `video_transcriptions` row by the time a visitor arrives, thanks to `cron-video-transcribe-background` (every 15 min). The button is the fallback for very-fresh videos.
- **Cross-language optimization**: if a transcription exists in the other language, translates the existing summary instead of re-transcribing (saves 1 TranscriptAPI credit + ~80 % tokens)
- **Video caching**: `youtube_videos` table persists metadata from RSS on each fetch, enabling past-date lookups; `enrichDurations()` backfills `duration_sec` (retry with @handle fallback)

### 8.19 YouTube Channels Admin (`YouTubeChannelsPage`) — v1.99+

Owner-only page accessible via the user dropdown menu.

- **Add channel**: input @handle or URL, resolves via TranscriptAPI `/channel/resolve` (free), fetches title + thumbnail via `/channel/latest` (free)
- **Channel list**: table with thumbnail (or fallback icon), title, handle, channel ID, delete button
- **Auto-refresh**: on page load, channels with missing title or thumbnail are automatically refreshed from TranscriptAPI with retry logic (channel_id → @handle fallback, 2 attempts each)

### 8.20 Changelog page (`ChangelogPage`)

- Loads **`GET /api/changelog`**
- Lists version badge, date, bilingual title/body from **`changelog`** table

### 8.21 Settings Page (`SettingsPage`)

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

### 8.22 Audio Player (`AudioPlayer`)

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

### 8.23 Auto-Update Banner

The SPA checks `public/version.json` every **5 minutes**. If the version string **differs** from the bundled `APP_VERSION` constant, a gold banner appears at the **top-right** (copy: `homeNewVersionBanner` in `i18n.ts`). Clicking reloads the page. No auto-reload.

**Release workflow** — single-source-of-truth via `scripts/release.mjs`:
1. `npm run release:patch` (or `:minor` / `:major`) — bumps `package.json`, then runs `release.mjs` which propagates the new version to `public/version.json`, the SPA's `APP_VERSION`, the footer, and any other tracked spot in one atomic edit
2. Add an entry to `src/data/changelog-entries.json` (auto-synced to the `changelog` DB table on first `/api/changelog` after deploy)
3. Commit + push

### 8.24 Version Footer

Fixed bottom-right: `v{APP_VERSION}`, kept in sync by `scripts/release.mjs` so it always matches `version.json`.

---

## 9. Internationalisation (i18n)

Defined in `src/lib/i18n.ts` — 1500+ lines of EN/FR keys covering all SPA, SSR, admin, toasts, error messages, video / briefing / roundup labels, and ARIA strings.

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

**v2.13.4+** `sectionStyle` / `sectionTitle` (previously 3 per-file copies) and `kpiCard` / `kpiLbl` (2 byte-identical copies) also live in `theme.ts` — never re-declare them inline.

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
  feedRanking: Array<{ source, topic, total, scored, avgScore, hitRate, pct8_10, pct5_7, pct3_4, pct1_2 }>;
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
          │  cron-fetching-background.ts        (every 15 min)         │
          │  - Claim stale active topics (oldest last_fetched_at)      │
          │  - RSS → parse → upsert `articles`                         │
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
          │  - Today's videos with topic_id, duration_sec >= 180 s     │
          │  - First lang: full pipeline (transcript + summary)        │
          │  - Second lang: translate path (reuses transcript)         │
          │  - gpt-5.3-chat-latest, 180 s OpenAI timeout (v2.5.4+)     │
          │                                                            │
          │  cron-video-roundup-background.ts   (every 15 min)         │
          │  - For each (topic × {en,fr}) yesterday's roundup_date:    │
          │    pull last 48 h transcribed videos for the topic         │
          │  - gpt-5.3-chat-latest → 8 structured bullets + SEO meta   │
          │  - Persist video_roundups + mirror to summary_bullets      │
          │                                                            │
          │  cron-top-summary-background.ts     (1×/day, 02:00 UTC)    │
          │  - Pulls top 50 articles of last 24 h (excl. hidden topics)│
          │  - For each {en,fr}: gpt-5.5 → grouped bullets w/ titles   │
          │  - Persists snapshot in `top_summaries` (articles + MD)    │
          │  - Mirrors per-bullet rows to `summary_bullets` (top50)    │
          └────────────────────────────────────────────────────────────┘

User opens / (landing) → SSR landing
User opens /app       → client SPA → BriefingPage (default, v2.6.6 order)
                              ├─ Top24hHero (first hero card)
                              │   └─ GET /api/news/top-summary/latest
                              │       (latest top_summaries row, accordion of group titles)
                              ├─ TOP VIDEO via /api/videos/top  (rotation, 10 min refresh)
                              ├─ TOP STORY via /api/news/top-story  (rotation, 10 min refresh)
                              ├─ /api/video-pages/recent  (10 per page, flat published_date DESC)
                              └─ /api/topics/trending     (Trending strip, 6 h then 24 h fallback)
                       → /top-articles
                              └─ GET /api/news/top-summary/latest
                                  reads pre-computed `top_summaries` row
                                  (articles list + bullets) — no LLM at request time

User opens /archives, /[topic], /[topic]/[date]/[slug],
           /[topic]/v/[date]/[slug], /[topic]/r/[date]/[slug],
           /[topic]/videos/[date], /{YYYY-MM-DD}
       → SSR via lib/supabase.ts (service-role read), no AI call at request time
       (legacy /summaries and /briefings 308-redirect to /archives, v2.6.11+)
```

---

## 14. Deployment

### Netlify

- **Build command**: `npm test && npm run build` (**v2.13.5+** — vitest runs first, ~2 s; a red unit test blocks the deploy)
- **Publish directory**: `.next`
- **Plugin**: `@netlify/plugin-nextjs`
- **Background functions**: 8 cron jobs — `cron-fetching-background` (suggested cadence every 15 min), `cron-scoring-background`, `cron-daily-summary-background`, `cron-video-roundup-background`, `cron-video-transcribe-background`, `cron-video-summary-score-background` (batched 1-10 quality score for `video_transcriptions.summary_md`; same 15 min wall as other long crons; trigger on your cadence, e.g. every 15 min — no auth, URL-obscurity like the other background crons), **`cron-top-summary-background`** — daily Top articles AI summary snapshot (suggested cadence `0 2 * * *` UTC; one tick per day produces the EN+FR rows in `top_summaries`; bootstrap manually after first deploy with `curl https://<host>/.netlify/functions/cron-top-summary-background`), and **v2.6.12+ `cron-newsletter-daily-background`** — daily Top 24h newsletter (suggested cadence `30 6 * * *` UTC, runs 30 min after the snapshot cron; reads the latest `top_summaries` snapshot per lang + buckets opted-in subscribers by `user_metadata.preferred_lang`; ships in 100-recipient chunks via Resend's `POST /emails/batch`; details in § Cron jobs → `cron-newsletter-daily-background.ts`).
- **Rewrites**: every `/app/*` SPA pseudo-route is rewritten to `/app` via `next.config.ts.beforeFiles` (hard-refresh resilience for the SPA)
- **Domain**: `8news.ai`
- **Redirect**: `8news.netlify.app/*` → `8news.ai/:splat` (301)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key (gpt-4.1-nano + gpt-4.1-mini + gpt-5.3-chat-latest + **v2.6.5+** gpt-5.5) |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for TTS |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key — browser auth + session validation in API routes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only — never expose) |
| `TRANSCRIPT_API_KEY` | Yes | TranscriptAPI key for YouTube video transcription |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key — only used to backfill `youtube_videos.duration_sec` so the Shorts filter is reliable. When unset, `enrichDurations()` is a silent no-op (videos display as-is and Shorts filtering falls back to RSS metadata only). |
| `CRON_SECRET` | Yes | Bearer token used by cron-job.org for `/api/fetch-feeds`, `/api/summaries/generate`, `/api/roundups/generate`, and the Netlify cron function URLs (pass as `?secret=`). |
| `VIDEO_SUMMARY_SCORE_MODEL` | No | OpenAI model for video recap scoring (`cron-video-summary-score-background`). Default `gpt-4.1-mini` (**v2.6.10+** — was `gpt-4.1-nano`; upgraded because nano clustered around 7-8 with no spread on the composite importance × quality prompt). |
| `VIDEO_SUMMARY_SCORE_BATCH_SIZE` | No | Recaps per OpenAI JSON call. Default `8` (capped by `VIDEO_SUMMARY_SCORE_BATCH_CAP`). |
| `VIDEO_SUMMARY_SCORE_BATCH_CAP` | No | Hard max recaps per request. Default `12` (safety for context size). |
| `VIDEO_SUMMARY_SCORE_MAX_CHARS` | No | Truncate each `summary_md` in the prompt. Default `3500`. |
| `VIDEO_SUMMARY_SCORE_OPENAI_TIMEOUT_MS` | No | Per-batch OpenAI timeout. Default `20000`. |
| `VIDEO_SUMMARY_SCORE_OPENAI_MAX_RETRIES` | No | SDK retries. Default `0` (fail fast; next cron tick retries backlog). |
| `CRON_VIDEO_SUMMARY_SCORE_WALL_MS` | No | Hard wall for the function. Default `840000` (14 min). |
| `CRON_VIDEO_SUMMARY_SCORE_BUDGET_MS` | No | Effective run budget. Default `810000`. |
| `RESEND_API_KEY` | **v2.6.12+** Required to enable the daily newsletter | Resend API key used by `cron-newsletter-daily-background`. Get one at https://resend.com/api-keys. When unset the cron logs a single warning and skips the send — the rest of the app keeps working. |
| `RESEND_FROM_ADDRESS` | No | « From » envelope for the newsletter, format `Display name <local@domain>`. Default `8news <newsletter@8news.ai>`. The domain MUST be verified in your Resend account (https://resend.com/domains) before mails will deliver. |
| `NEWSLETTER_UNSUBSCRIBE_MAILTO` | No | mailto target injected into the `List-Unsubscribe` header (RFC 8058). Default `unsubscribe@8news.ai`. Doesn't currently auto-unsubscribe — you'll get a reply and toggle the user manually from `<UsersSection>` until a self-serve opt-out lands on the SettingsPage. |
| `NEWSLETTER_PUBLIC_ORIGIN` | No | Absolute origin used to build the « Read online » CTA inside the newsletter (`${origin}/${summary_date}`). Default `https://8news.ai`. |
| `PODCAST_CHAT_MODEL` | No | **v2.13+** OpenAI model for the Daily Podcast chat side panel (`/api/podcast-chat`). Reuses `OPENAI_API_KEY`. Default `gpt-5.5`. |
| `USER_CHAT_MODERATION_MODEL` | No | **v2.14+** OpenAI model for the Community chat moderation gate (`/api/user-chat`). Reuses `OPENAI_API_KEY`; fail-open if absent. Default `gpt-4.1-nano`. |
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

Release history is maintained in **`src/data/changelog-entries.json`** and auto-synced to the `changelog` DB table on first `GET /api/changelog` call after deploy. The in-app Changelog page displays all entries. This SPEC does not duplicate the changelog — see the source file or the in-app page for the full history.

**Recent (v2.x highlights)**:
- **v2.16** — Collapsible CryptoTicker: single collapsed row by default, chevron expands overflow (ResizeObserver). New `CryptoCoinPicker` component + `GET /api/crypto/coins` route (CoinGecko top 200, 1 h edge cache) for in-chart coin switching via `onSelectCoin`. Dedicated `Crypto` nav pill in `GeneralMenu` + `SeoGeneralMenu`. New i18n keys: `cryptoMenuBtn`, `cryptoTickerExpand`, `cryptoTickerCollapse`, `cryptoChartSelectCoin`, `cryptoChartPickerTitle`. No DB migration.
- **v2.15** — In-app crypto candle charts: `CryptoChartPage` + `CryptoCandleChart` (`lightweight-charts`), `GET /api/crypto/ohlc` (Binance daily klines, 10 min edge cache), `computeBollingerBands()`, range buttons 1M/3M/6M/1Y, volume histogram. Ticker click opens the chart instead of CoinGecko tab. `crypto-tradingview.ts` maps CoinGecko ids to Binance pairs. No DB migration.
- **v2.14** — Community chat room: `user_chat_messages` table (mig 039 + 040 Realtime), `GET/POST/DELETE /api/user-chat`, chat side panel with Realtime live INSERTs/DELETEs, moderation gate (`gpt-4.1-nano`), mobile crypto ticker grid.
- **v2.13.5** — Daily Podcast persisted bullets capped at **8** (2 pinned videos + 6 article bullets via `selectTopArticleBullets()` — applies to home hero, audio player, `/{date}` archives and newsletter in one change); emoji-free video titles/descriptions everywhere via `stripEmojis()` (`VideoCardHelpers.ts`); main-menu labels shortened (Briefing / Veille, Top 24h, Topics, YT channels). Netlify build now runs `npm test` first. Suite at 71 tests.
- **v2.13.4** — Six-phase cleanup, zero behavioral change: every silent `catch` in `src/lib/supabase/` now logs and ignored insert returns are checked; shared `api-helpers.ts`, extended `dates-utc.ts`, single `getServerClient()` (28 inline `createClient` removed), `cron-log.ts` (`startCronRun`) adopted by all 8 crons; obsolete 42703 migration latches (021/023/026) removed; UI dedup (`theme.ts` shared styles, merged `video-markdown.tsx`, single `HistoryArrows`); **first test infrastructure** (vitest, 56 unit tests); changelog moved to `src/data/changelog-entries.json`, `landing-source/` deleted, `@netlify/functions` dropped.
- **v2.13 → v2.13.3** — Daily Podcast chat side panel (`/api/podcast-chat`, grounded in the day's snapshot, migration 033); « top videos of yesterday » pinned at the top of the Daily Podcast + newsletter; fix: `insertVideoBullets` delete scoped to `source_type='video'` + backfill anti-join rewritten (the video cron was wiping the podcast's pinned video bullets every tick).
- **v2.9 → v2.12** — Per-user UI activity state (mig 029) + append-only visitor event log with owner-only dashboard (mig 030); `summary_bullets` uniqueness + CRON-only writers (migs 031/032); one-decimal video scores in the 9-10 band (mig 034); `global_article_kpis()` RPC for the Stats page (mig 035); daily newsletter; briefing redesign + YouTube channels browser.
- **v2.6.11** — Unified `/archives` hub replaces the previously parallel `/summaries` (article daily summaries) and `/briefings` (video roundups) — both now 308-redirect to `/archives`. Single timeline grouped by date desc, topic + type filters, sticky chevron pagination. Per-day video drill-down at `/[topic]/videos/[date]`. Cross-topic Top 24h archive at `/{YYYY-MM-DD}` (mounted via a date-fork in `[topic]/page.tsx`). Gold « ALL TOPICS » box pinned at the top of each archives day card when a `top_summaries` snapshot exists. Click-target dedup on HeroStory + DailySummaryArticles + TopFeedSection. Sitemap: drops `/briefings`, advertises `/archives` and `/{date}` instead.
- **v2.6.10** — Video recap scoring rewritten: composite « importance × quality » prompt with frontier-AI / Big Tech major-player whitelist + anti-cluster directive + concrete anchors per integer step; default model upgraded `gpt-4.1-nano → gpt-4.1-mini` for editorial-nuance discrimination; `temperature: 0` for run-to-run reproducibility. Cross-topic dedup on home « your topics » strips.
- **v2.6.9** — Per-group editorial importance score 1-10 on the Top 24h (mig 026 adds `summary_bullets.importance_score`); the `gpt-5.5` generator emits the score inline (zero extra LLM round-trip), `analyzeWithAI` propagates it across same-`title` runs, `Top24hHero` renders a `ScoreMeter` next to each group title (replaces the previous paragraph counter). Home heroes (`/api/news/top-story`, `/api/videos/top`) now scan the `home_surface_queue` in round-robin order and keep only entries whose `pub_date` falls inside the last 24 h.
- **v2.6.4 → v2.6.8** — Cron transcribe self-sufficient (RSS refresh in step 0); landing hero refocus + DB-backed topics ticker; chevron mental model inverted on home heroes; `Top24hHero` shared across home + `/top-articles`; `<a>` → `<Link>` across menus.
- **v2.5.4** — Hybrid OpenAI strategy: synchronous video transcription stays on `gpt-4.1-mini` (sub-30 s budget), pre-warm cron upgraded to `gpt-5.3-chat-latest` with a 180 s OpenAI timeout (cron `SAFETY_MS = 200_000`). Landing pricing: annual price for Pro displayed side-by-side with monthly via `.price-row`; "Choose 8 topics out of 36 available, powered by 400+ RSS feeds"; merged Top 50 + favorites + archive lines for Free; removed ElevenLabs / Webhooks-API / Priority-scoring lines; "Morning email digest covering all your topics".
- **v2.5.3** — Language persistence: SSR pages now resolve via `resolveServerLang()` (query → `preferred_lang` → cookie → default); SPA + `SeoNavBar` write `preferred_lang` to `user_metadata` on every toggle; introduced `src/lib/server-lang.ts`.
- **v2.5.2** — Briefing's "All transcribed videos" pagination = 1 day per page, default = today, section stays visible if today is empty; PostgREST `PGRST204` on missing `summary_bullets.video_roundup_id` logged as a single WARN (run migration 018).
- **v2.5** — `cron-video-transcribe-background` (every 15 min): pre-transcribe today's videos in EN+FR (skip Shorts < 180 s) so the SPA shows instant summaries.
- **v2.4 / v2.4.1** — Video roundups rebuilt: 8 structured bullets (3-8 word bold title + 3-5 sentence body), `gpt-5.3-chat-latest`, mirrored to `summary_bullets` (migration 018), 48 h source window in the cron.
- **v2.3 / v2.3.1** — Long videos transcribe reliably (3-tier sampling); recent transcribed videos block on the Briefing.
- **v2.2** — SSR per-topic-per-day video roundups (`/{topic}/r/{date}/{slug}`) + per-video pages (`/{topic}/v/{date}/{slug}`) + `/briefings` hub (migrations 016 + 017).
- **v2.x base** — Landing extracted to `/`, SPA moved to `/app/*` with `next.config.ts` rewrites, default landing page inside the SPA is the **Briefing**, tagline updated to **Tech / AI / Crypto**, dynamic sitemap covers everything.

---

## 18. Known Limitations

- **Partial authentication / role-based admin** — Supabase Auth with `member` (default) vs `owner`. Topics, Feed management, Categories, Daily Summaries (admin), YouTube Channels and Users are owner-only. Guests and members still use the Briefing, Top 50, Daily Summaries, Videos, Favorites (signed-in only), stats, crons, changelog, settings, plus every public SSR page. No per-user data partitioning in the database; `owner` is an admin role for those screens.
- **Synchronous video transcription budget** — `/api/youtube-channels/transcribe` runs on a regular Netlify route (30 s cap) and uses `gpt-4.1-mini` with a 25 s OpenAI timeout. For very long videos (> 1 h 30 min) it relies on a 3-tier transcript-sampling strategy in `lib/transcribe-video.ts`. Higher-quality summaries come from the cron pre-warm path (`gpt-5.3-chat-latest`, 180 s budget) — by the time most visitors arrive, the cache row is already populated.
- **Cron pre-warm coverage** — `cron-video-transcribe-background` only picks up videos with `topic_id` set on the parent channel and `duration_sec ≥ 180`. Shorts and channels not yet linked to a topic stay on the on-demand sync path.
- **Migrations are not auto-applied** — Migrations under `migrations/` must be run manually in the Supabase SQL Editor. Code is defensive when a migration is missing (e.g. `summary_bullets.video_roundup_id` from migration 018 — the mirror logs a single WARN and skips). Always run pending migrations before promoting a release that depends on them.
- **Serverless wall-time** — Netlify background functions cap at 15 min wall-time. Internal budgets (~13.5-14.5 min) + safety reserves (10-200 s depending on the cron) keep us inside that envelope. `POST /api/topics/[id]/feeds/[feedId]/score` is capped at `maxDuration 13` (synchronous route) and may return `partial: true` when its budget is exhausted.
- **RSS availability** — Some feeds go offline; AI feed discovery validates upfront but feeds can break later.
- **YouTube embed on localhost** — Strict-origin policies cause some channels to render a black `<iframe>` on `http://localhost`. Worked around by swapping the embed host to `youtube-nocookie.com` when the page is on localhost (production keeps `youtube.com` and a strict `referrerPolicy`).
- **AI cost** — Each request consumes OpenAI tokens; each TTS request consumes ElevenLabs credits; each video transcription costs 1 TranscriptAPI credit (cross-language translation reuses the existing summary to save credits — only one `/transcript` call per `(video_id, lang0)`, the second lang only pays the LLM bill).
- **TranscriptAPI reliability** — The `/channel/latest` RSS endpoint can time out (408) for some channels; retry logic with @handle fallback mitigates most failures.
- **Hybrid rendering** — The SPA (`/app`) is client-only; landing, briefings hub, summaries hub, per-topic hubs, daily summaries, per-video pages and per-roundup pages are server-rendered (SEO-first).
- **Cookie-based UI prefs** — Most UI prefs (`maxArticles`, TTS speed/voice, etc.) are persisted in cookies; topic and period selection reset on reload. `lang` is the exception — also written to `preferred_lang` in `user_metadata` for authenticated users (v2.5.3+). **v2.6+** `homeMinScoreArticle` (default **9**, clamp 1..10) follows the same dual-store pattern: cookie is the source of truth for `/api/news/top-story`, and authenticated users have it mirrored to `user_metadata.home_min_score_article` so the choice follows them across browsers. TOP VIDEO no longer uses the legacy video threshold preference: `/api/videos/top` uses a fixed **8/10** threshold and today→yesterday fallback.
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
| `migrations/038-crypto-top50-metadata.sql` | Adds `coin_id`, `name`, `market_cap_rank` to `crypto_prices` so stale fallback can rebuild the top-50 picker and CoinGecko links |
| `src/app/api/crypto/route.ts` | Public GET endpoint. Reads DB, refreshes CoinGecko top 50 when rows are older than 60 s, returns `{ prices, availableCoins, stale }`; optional `?symbols=btc,eth,...` filters the displayed list to 12 max with private/no-store headers |
| `src/hooks/useCryptoPrices.ts` | Client hook. `{ poll, selectedSymbols }`, 60 s `setInterval`, paused on `document.visibilityState === "hidden"`, immediate refresh on `visibilitychange → visible` |
| `src/lib/crypto-preferences.ts` | Client preference helper. Default BTC/ETH/SOL/XRP/TAO/SUI, max 12 symbols, cookie persistence and sanitization before syncing to `auth.users.user_metadata.crypto_ticker_symbols` |
| `src/app/components/CryptoTicker.tsx` | **v2.16+** Collapsible single-row ticker with expand chevron (ResizeObserver overflow detection). Click → in-app `CryptoChartPage`. Root class `crypto-ticker-wrap`. |
| `src/app/components/CryptoTickerSettingsPage.tsx` | Section embedded in `/app/settings` for signed-in users, with search across the top 50 and max-20 checkbox selection |
| `src/app/components/crypto-chart/CryptoCoinPicker.tsx` | **v2.16+** Modal coin switcher for `CryptoChartPage`. Fetches `GET /api/crypto/coins` (top 200 by market cap), live search, fires `onSelectCoin` callback. |
| `src/app/api/crypto/coins/route.ts` | **v2.16+** GET endpoint. Fetches CoinGecko top 200 by market cap, server-side 1 h edge cache, returns `{ coins }`. |
| `src/app/globals.css` | Adds `@keyframes cryptoFlash` (price update glow) + `.crypto-ticker-wrap` grid, `.crypto-ticker-change` responsive class, `.topic-pagination` mobile nav |
| `src/lib/i18n.ts` | `cryptoTickerStale` / `cryptoTickerError` / `cryptoMenuBtn` / `cryptoTickerExpand` / `cryptoTickerCollapse` / `cryptoChartSelectCoin` / `cryptoChartPickerTitle` plus the bilingual user-menu picker labels |

### 19.3 Cache strategy & rate limit math

- **Tier 1 — module memo.** Inside the warm Function instance, the latest top-50 price list is kept in `let memo: { prices, stale, cachedAt }`. Same-instance requests within 60 s return immediately, no DB round-trip.
- **Tier 2 — Supabase row cache.** When the memo is cold or expired, the route reads `crypto_prices`. If the top-50 rows have `updated_at >= now - 60s`, those rows ARE the response — no upstream call.
- **Tier 3 — CoinGecko refresh.** Only when the top-50 cache is old do we hit `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h` with a 5 s `AbortController` timeout. The response is upserted back into `crypto_prices` (fire-and-forget, with write errors logged).
- **Tier 4 — CDN cache.** The unfiltered route returns `Cache-Control: public, max-age=0, s-maxage=60, must-revalidate`. Personalized `?symbols=` responses return `private, no-store` so Netlify never reuses one user's selected symbols for another visitor.

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

**v2.16+** The ticker is collapsed to a single row by default on all screen sizes. A chevron at the far right expands/collapses when the selection overflows one row (detected by `ResizeObserver` comparing `scrollHeight > 40 px`).

| Viewport | Behavior |
|---|---|
| Default | All selected coins on one collapsed row; chevron expands overflow |
| ≤ 640 px | The 24h % column hides (`.crypto-ticker-change { display: none }`) |

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
