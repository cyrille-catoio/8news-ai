# 8news.ai — Technical Specification

**Version**: v1.89
**Last updated**: 12 April 2026

---

## 1. Overview

**8news.ai** is an AI-powered news aggregation and summarisation platform. It fetches articles from curated RSS feeds across multiple **dynamic, database-driven topics**, pre-scores them with AI via scheduled Netlify cron jobs (stored in Supabase), then analyses the top-scoring articles with OpenAI (topic summaries via GPT-4.1-nano; homepage Top summary via GPT-5.3-chat-latest) for structured summarisation. Results are presented in a dark-themed, bilingual (EN/FR) web interface with ElevenLabs text-to-speech playback.

Users can **create custom topics** from the UI, with AI-assisted generation of scoring criteria and automatic RSS feed discovery.

**v1.80+**: Optional **Supabase Auth** (email + password). **v1.81+**: **`user_type`** in **`user_metadata`** — **`member`** (default at sign-up) or **`owner`**. The app remains **fully usable without signing in** (home, stats, crons, changelog, settings). Signed-in **members** use the same public areas as guests. **Topics** and **Feed management** are **`owner`**-only (promote in **Supabase Dashboard → Authentication → Users**; user must sign in again for JWT refresh). Admin APIs: **`401`** unsigned, **`403`** **`member`**. **v1.82+**: Settings **My Account** (any authenticated user, editable name) + **Users** management (`owner`-only, inline edit of name and user type).

**Tagline**: "Tech intelligence, powered by AI." / "La tech décodée par l'IA"

**Live URL**: https://8news.ai
**Repository**: https://github.com/cyrille-catoio/8news-ai

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | ^5 |
| Frontend | React | 19.2.3 |
| CSS | `globals.css` (tables, grids, keyframes) + `theme.ts` tokens + inline styles | — |
| RSS Parsing | rss-parser | ^3.13.0 |
| AI (text analysis) | OpenAI API — `gpt-4.1-nano` | via `openai` ^6.25.0 |
| AI (text-to-speech) | ElevenLabs API — `eleven_flash_v2_5` model | via REST API |
| Database | Supabase (PostgreSQL) | via `@supabase/supabase-js` |
| Auth (session cookies) | Supabase Auth + `@supabase/ssr` | **v1.80+** — browser anon client + `middleware.ts` refresh |
| Hosting | Netlify | via `@netlify/plugin-nextjs` ^5.15.8 |
| Cron Jobs | Netlify Scheduled Functions | `@netlify/functions` |
| Domain | 8news.ai (redirect from 8news.netlify.app) | |

---

## 3. Project Structure

```
8news/
├── middleware.ts               # **v1.80+**: Supabase session cookie refresh on each request
├── public/
│   ├── logo-8news.png          # App logo (PNG, "8" gold / "news" light grey)
│   ├── favicon.svg             # Browser favicon — gold "8" on black, 512×512
│   ├── apple-touch-icon.svg    # iOS home screen icon — gold "8" on black, 180×180
│   └── version.json            # {"version":"1.83"} — auto-update check (bump with each release)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, metadata, favicons, **v1.80+** `AuthProvider` wrapper, **v1.82+** Google Analytics
│   │   ├── providers.tsx       # **v1.80+**: `AuthProvider` / `useAuth` (Supabase session)
│   │   ├── globals.css         # Global CSS reset + base styles
│   │   ├── page.tsx            # Main client shell: home flow + `currentPage` router to feature components
│   │   ├── components/         # Feature UI: AppHeader, AuthModal, TopFeedSection, TopicsPage/, StatsPage, FeedsAdminPage, MyAccountSection, UsersSection, …
│   │   └── api/
│   │       ├── news/
│   │       │   ├── route.ts            # GET /api/news — Supabase read + AI analysis
│   │       │   ├── all/route.ts        # GET /api/news/all — All articles (lazy load, up to 1000)
│   │       │   ├── top/route.ts         # GET /api/news/top — Top scored articles (homepage feed, Top 50)
│   │       │   └── top-summary/route.ts # POST /api/news/top-summary — homepage AI grouped summary
│   │       ├── cron-stats/route.ts     # GET /api/cron-stats — Cron monitoring KPIs & timeline
│   │       ├── tts/route.ts            # POST /api/tts — ElevenLabs Text-to-Speech
│   │       ├── stats/route.ts          # GET /api/stats — Dashboard statistics
│   │       ├── fetch-feeds/route.ts    # GET /api/fetch-feeds — manual RSS fetch
│   │       ├── feeds-admin/route.ts    # GET /api/feeds-admin — feeds + stats (**v1.80+**: session required)
│   │       ├── changelog/route.ts      # GET /api/changelog — update log entries from DB
│   │       ├── test-score/route.ts     # GET /api/test-score — manual scoring
│   │       └── topics/
│   │           ├── route.ts                    # GET/POST /api/topics — list (public without `?all=1`) & create (session **v1.80+**)
│   │           ├── generate-scoring/route.ts   # POST — AI-generate scoring criteria
│   │           ├── generate-labels/route.ts    # **v1.82+**: POST — AI-generate slug, label FR, domain from label EN
│   │           ├── reorder/route.ts            # POST /api/topics/reorder — swap sort order between two topics
│   │           └── [id]/
│   │               ├── route.ts                # GET/PATCH/DELETE /api/topics/:id
│   │               ├── feeds/
│   │               │   ├── route.ts            # POST /api/topics/:id/feeds
│   │               │   └── [feedId]/
│   │               │       ├── route.ts        # PATCH/DELETE feed
│   │               │       ├── articles/route.ts # DELETE — remove DB articles for topic+source
│   │               │       └── score/route.ts  # POST — score up to 50 unscored articles (all ages, newest first)
│   │               └── discover-feeds/route.ts # POST — AI auto-discover RSS feeds
│   │       └── users/
│   │           ├── route.ts                   # **v1.82+**: GET — list all users (**owner** only, service role)
│   │           └── [id]/route.ts              # **v1.82+**: PATCH — update user name / type (**owner** only)
│   ├── hooks/
│   │   └── useTopFeed.ts       # Homepage Top 50: GET /api/news/top (v1.76+: `?lang=` + localized snippet; refetch on lang change), refresh, clear, 5 min poll when home + no topic, **v1.82+** `lastUpdatedAt` timestamp
│   └── lib/
│       ├── types.ts            # TypeScript interfaces (TopicItem, TopicDetail, etc.)
│       ├── theme.ts            # Design tokens (colors, fonts, shared styles)
│       ├── i18n.ts             # EN/FR translation strings (100+ keys)
│       ├── supabase.ts         # Supabase **service-role** client, caching, article/topic/feed queries (not for browser auth)
│       ├── supabase-browser.ts # **v1.80+**: `createBrowserSupabaseClient()` — anon key, sign-in / sign-up
│       ├── auth-api.ts         # **v1.80+**: `getSessionUser()`, `requireOwnerSession()` (cookie session)
│       ├── user-type.ts        # **v1.81+**: `user_type` metadata — `member` | `owner`; `isOwnerUser()`
│       ├── html.ts             # HTML entity decoder
│       ├── cookies.ts          # getCookie / setCookie (client prefs: lang, maxArticles, TTS)
│       ├── fetch-topic-dynamic.ts  # RSS fetch + upsert (used by API + Netlify)
│       ├── score-topic-dynamic.ts # AI scoring batches → Supabase (used by API + Netlify)
│       └── ai-analyze.ts         # Shared OpenAI analysis helpers (analyzeWithAI, prompts/messages)
├── netlify/
│   └── functions/
│       ├── shared/
│       │   ├── fetch-topic.ts  # Re-exports `@/lib/fetch-topic-dynamic` for cron bundling
│       │   └── score-topic.ts  # Re-exports `@/lib/score-topic-dynamic` for cron bundling
│       ├── cron-fetch.ts       # Cron: batched RSS fetch (* * * * *, k topics/run)
│       └── cron-score.ts       # Cron: prioritized scoring (* * * * *)
├── migrations/
│   ├── 001-topics-feeds.sql    # Create topics + feeds tables, seed 8 topics + ~160 feeds
│   ├── 002-prompts.sql         # Add prompt_en/prompt_fr columns, seed prompts
│   ├── 003-topic-anthropic.sql # Add Anthropic topic with scoring + prompts
│   ├── 004-feeds-anthropic.sql # Add 20 RSS feeds for Anthropic
│   ├── 005-changelog.sql       # changelog table + seed (in-app update log)
│   ├── 006-topic-display.sql    # Add topics.is_displayed (homepage visibility toggle)
│   ├── insert-changelog-1.77.sql # one-off INSERT for v1.77 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.78.sql # one-off INSERT for v1.78 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.79.sql # one-off INSERT for v1.79 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.80.sql # one-off INSERT for v1.80 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.81.sql # one-off INSERT for v1.81 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.82.sql # one-off INSERT for v1.82 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.83.sql # one-off INSERT for v1.83 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.84.sql # one-off INSERT for v1.84 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.85.sql # one-off INSERT for v1.85 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.86.sql # one-off INSERT for v1.86 on existing DBs (Supabase SQL Editor)
│   ├── insert-changelog-1.87.sql # one-off INSERT for v1.87 on existing DBs (Supabase SQL Editor)
│   └── insert-changelog-1.88.sql # one-off INSERT for v1.88 on existing DBs (Supabase SQL Editor)
├── .gitignore                  # Next/Node ignores; **v1.77+**: `.claude/` (local Claude/Cursor worktrees, not committed)
├── .env                        # API keys (not committed)
├── .env.example                # Placeholder for API keys
├── netlify.toml                # Netlify build + redirect config
├── package.json
├── tsconfig.json
└── next.config.ts
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
| `changelog` | In-app release notes (version, bilingual title/body, `created_at`) |
| `news_cache` | Cached API responses (TTL-based) |

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

Populated via migration `005-changelog.sql` (newest first): **1.88 → 1.49** one row per release with short EN/FR summaries aligned with §17; **1.0–1.48** are represented by a **single** row (`version` = `1.0–1.48`, shared generic EN/FR body pointing to git history and SPEC for **1.49+**). For new releases, extend the migration (or `INSERT` manually) and keep §17 and `public/version.json` / `APP_VERSION` in sync. **Existing database missing the latest row only:** run **`migrations/insert-changelog-1.88.sql`** once in the Supabase SQL Editor (see file header). Older gaps: **`insert-changelog-1.87.sql`**, **`insert-changelog-1.86.sql`**, etc.

### 5.6 Cache TTL (based on time window)

| Hours | Cache duration |
|---|---|
| ≤1h | 5 min |
| ≤6h | 15 min |
| ≤24h | 30 min |
| >24h | 60 min |

---

## 6. Backend Architecture

### 6.1 Netlify Scheduled Functions (Cron Jobs)

Articles are fetched and pre-scored by **2 scheduled Netlify functions** (not per-topic files): **batched fetch** plus **prioritized score** (see below). Canonical implementations live in **`src/lib/score-topic-dynamic.ts`** (`scoreAndStoreTopicDynamic`, `scoreTopicForCron`, optional `ScoreTopicOptions.maxArticles` / `windowHours` / `maxArticlesCap` / `maxElapsedMs`) and **`src/lib/fetch-topic-dynamic.ts`** (`fetchAndStoreTopicDynamic`, returns `FetchResult` with `summary`, `inserted`, `feedsOk`, `feedsFailed`, `totalParsed`, `duplicatesSkipped`). `netlify/functions/shared/*.ts` re-export those modules for the cron bundle. **`GET /api/fetch-feeds`** and **`GET /api/test-score`** call the same libraries (auth via `secret` + `CRON_SECRET`).

**`cron-fetch.ts`** — RSS fetching:
- Runs **every minute** (`* * * * *`), same cadence as scoring
- Loads active topics ordered by oldest `last_fetched_at` (nulls first)
- Uses a strict runtime budget aligned with Netlify cap: `CRON_WALL_MS=13000`, internal default `CRON_BUDGET_MS=11800`, `CRON_SAFETY_RESERVE_MS=1200`
- Processes **`k` topics per run**: `k = min(max(1, ceil(N/10)), FETCH_TOPICS_MAX_PER_RUN)` with default cap **3** (env configurable)
- For each selected topic: updates `last_fetched_at` **before** fetching, then fetches all active RSS feeds, parses, upserts into `articles`
- `fetchAndStoreTopicDynamic` returns a `FetchResult` (includes `summary`, `inserted`, and aggregate feed/article counts) — `inserted` drives the adaptive mini-score
- **Adaptive post-fetch scoring** runs only when budget allows (`remaining > FETCH_SCORE_CALL_RESERVE_MS + reserve`): uses `scoreTopicForCron(..., maxElapsedMs=...)` and adaptive `maxArticles` clamped between **15** and **50**
- Emits structured run metrics (`elapsed_ms`, inserted, mini_scored, deadline stops)

**`cron-score.ts`** — AI scoring:
- Runs **every minute** (`* * * * *`)
- Uses the same strict budget model (`CRON_WALL_MS=13000`, default internal budget **11.8s** + reserve)
- Loads **all active topics**, counts **all** unscored articles (`relevance_score IS NULL`, **no `pub_date` cutoff**) and computes a **fresh backlog** (`fetched_at >= now - 5min`, configurable via `SCORE_FRESH_WINDOW_MIN`)
- **Sort order (fresh-first)**: topics with fresh backlog first (largest first, then newest `last_fetched_at`), then remaining backlog topics, then idle topics
- **Adaptive per-topic quota**: `maxArticles` is adjusted from remaining budget + backlog pressure (defaults around **12–80** bounds, env-configurable)
- **Fairness guard**: periodically forces one least-recently-scored backlog topic (`SCORE_FAIRNESS_EVERY_N_TOPICS`) to avoid starvation
- Stops cleanly before deadline and logs per-topic metrics (`fresh_backlog`, backlog, scored/candidates, partial, elapsed, remaining budget)
- Crons still pass **`windowHours: null`** so older backlog remains eligible; `GET /api/test-score` keeps default **168h** unless overridden
- Each scored article stores: relevance score (1-10), reason, AI EN/FR summaries (score ≥5)

**Scoring criteria** (stored in `topics` table):
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

Homepage-only AI summary endpoint. Accepts `{ articles, lang }` from the Top feed and returns `SummaryResponse` with grouped bullet points (`globalSummary`) and source references (`refs`) rendered by `SummaryBox`. Uses dedicated homepage prompt rules (homogeneous grouping + mandatory refs) and OpenAI `gpt-5.3-chat-latest`.

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

The app has **7 pages** managed by `currentPage` state (`"home"` | `"stats"` | `"crons"` | `"topics"` | `"feeds"` | `"changelog"` | `"settings"`). **v1.80+**: **`topics`** and **`feeds`** are reachable only for **`owner`** users (icons hidden for guests and **members**; leaving those pages without **owner** returns to **home**).

**Header** (`AppHeader`, shared across all pages):
- **Logo**: PNG image (`/logo-8news.png`), responsive height — **clicking logo resets to homepage Top 50 feed**
- **Subtitle**: "Tech intelligence, powered by AI." / "La tech décodée par l'IA" (`t("subtitle", lang)`)
- **Top-right controls**:
  - **Icon row** (left to right): **Home** (house); **Topics** and **Feed management** only if **`user_type` is `owner`** (**v1.80+**); **Stats** (bars), **Cron Monitor** (pulse), **Changelog** (clock), **Settings** (gear)
  - **Row below icons**: **Sign in** / **Sign out** (**v1.80+**, `AuthModal` for email/password + register with first/last name + default **`member`**) **to the left of** the **language toggle** (EN/FR), right-aligned

### 8.3 Home Page

#### Default Homepage Feed (Top 50)

On launch (no topic or period selected), the homepage displays the **Top 50 best-scored articles from the last 24 hours** across displayed topics, fetched from **`/api/news/top`** ( **`v1.83+`**: `?limit=50&days=1&lang={ui lang}` ). UI: **`TopFeedSection`** (caption, sorted rows, NEW badge, topic pill, copy link, **v1.82+** last-updated timestamp `— Mise à jour HH:MM` / `— Updated HH:MM`). Data + polling: **`useTopFeed`** with `poll === true` only when **`currentPage === "home"`** and **`topic === null`** (initial fetch on mount, silent 5 min refresh, `refresh()` after logo/home reset, `clear()` when user picks a topic). **`v1.76+`**: hook shape **`useTopFeed({ poll, lang })`** — **language change refetches** the Top 50. **v1.82+**: hook also exposes **`lastUpdatedAt`** (`Date | null`), updated on every successful fetch. (`cache: "no-store"` on fetches.)

Each Top 50 row shows a small **topic ID badge** (gold outline) next to the source line when `topic` is present. Items with `pubDate` in the **last hour** show a **NEW** badge. **`v1.76+` — French UI**: when a non-empty **`snippet`** is returned (typically **`snippet_ai_fr`**), the **main line** is that French text and the **RSS `title`** appears below in muted style; **English** keeps **title** first and **snippet** under it (like **ArticleCard**). If no AI snippet exists, only the RSS title is shown.

When a topic is selected but no period chosen, the Top 50 disappears and a message prompts the user: "Select a time period to start the analysis."

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

### 8.4 Stats Page

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

### 8.5 Cron Monitor Page (`CronMonitorPage`)

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

### 8.6 Topics Page (`TopicsPage/`)

Full CRUD management for topics and feeds. **`index.tsx`** holds state and API handlers; **three view components**: `TopicsPageListView`, `TopicsPageCreateView`, `TopicsPageDetailView`.

**List view**: Table of all topics with #, name, feed count, status, click to detail. Supports **drag & drop reordering** via `/api/topics/reorder` with optimistic UI updates.

**Create view**: Form with:
- **Identity box** (**v1.82+ layout**): Label EN, Label FR, Slug (3-column row); Domain textarea below; **"✨ Generate with AI"** button calls `/api/topics/generate-labels` to auto-fill slug, label FR, and domain from label EN
- Scoring criteria: 5 tiers
  - **"✨ Generate with AI"** button: calls `/api/topics/generate-scoring` to auto-fill tiers from domain
- Analysis Prompt (optional): EN/FR tabs, monospace textarea, `{{max}}` info
- **"🔍 Find 10 RSS feeds automatically"** checkbox (checked by default):
  - After topic creation, calls `/api/topics/[id]/discover-feeds`
  - Shows spinner "Searching for RSS feeds…" in the detail view
  - Displays result summary (added / rejected)

**Detail view**:
- Topic info (labels, domain, scoring criteria displayed in read mode with "Scoring" section header, edit toggle)
- Analysis prompt (EN/FR tabs, read/edit modes, `{{max}}` validation warning)
- Feeds list (name, domain link, delete button) + add feed form
- **"🔍 Discover feeds by AI"** button: discovers and adds 10 new feeds to an existing topic

### 8.7 Feed management (`FeedsAdminPage`)

Dedicated **RSS / feed operations** view (not the same as Topics CRUD):

- **Topic filter**: pill buttons — **All** or one topic (labels from homepage topic list)
- **Table**: source (link to RSS URL), topic, **created at** (`feeds.created_at`), total articles, scored, avg score, Score ≥ 7 % — all numeric/topic columns **sortable** (asc/desc)
- **Actions** (per row):
  - **Score** (star icon): `POST /api/topics/:id/feeds/:feedId/score` — up to 50 unscored articles, **all** unscored for the feed (newest `pub_date` first; no day window)
  - **Delete articles** (document‑X): `DELETE .../articles` — removes stored articles for that topic + source
  - **Delete feed** (trash): `DELETE .../feeds/:feedId`
- **Toasts** (fixed bottom center): loading spinner + message while waiting; success / info / error with auto-dismiss (replaces `alert` for these actions)

### 8.8 Changelog page (`ChangelogPage`)

- Loads **`GET /api/changelog`**
- Lists version badge, date, bilingual title/body from **`changelog`** table

### 8.9 Settings Page (`SettingsPage`)

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

### 8.10 Audio Player (`AudioPlayer`)

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

### 8.11 Auto-Update Banner

The app checks `public/version.json` every **5 minutes**. If the version differs from `APP_VERSION`, a gold banner appears at the **top-right** of the screen (copy: `homeNewVersionBanner` in `i18n.ts`). Clicking reloads the page. No auto-reload.

### 8.12 Version Footer

Fixed bottom-right: `v{APP_VERSION}` from `page.tsx`, kept in sync with `public/version.json` (increment with each production release).

---

## 9. Internationalisation (i18n)

Defined in `src/lib/i18n.ts` — **100+ translation keys** (includes feed admin, changelog, toasts, home loading / Top 50 / version banner / nav aria-labels).

- **Languages**: English (`en`), French (`fr`)
- **Toggle**: Segmented control in header — sets cookie, reloads page
- **Scope**: All UI text, error messages, loading messages, topic management, stats labels
- **AI output**: Language-specific prompts from DB (`prompt_en` / `prompt_fr`)
- **TTS voice**: Auto-selects from EN or FR voice pool
- **Date formatting**: `en-US` or `fr-FR` locale

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
| `currentPage` | `"home"` \| `"stats"` \| `"crons"` \| `"topics"` \| `"feeds"` \| `"changelog"` \| `"settings"` | `"home"` | None |
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
          ┌──────────────────────────────────────────────────┐
          │  BACKGROUND (Netlify Scheduled Functions)        │
          │                                                  │
          │  cron-fetch.ts (* * * * *)                       │
          │  - k topics/run: ceil(N/10), max 3, ~13s budget  │
          │  - Oldest last_fetched_at first (nulls first)    │
          │  - Update last_fetched_at BEFORE each fetch      │
          │  - RSS → parse → upsert `articles`               │
          │  - Adaptive mini-score: min(50, max(15, inserted))│
          │                                                  │
          │  cron-score.ts (* * * * *, ~13s budget)             │
          │  - Multi-topic: continues if backlog ≤20        │
          │  - Backlog topics first; newest fetch first      │
          │  - Skip no-backlog (update last_scored_at only)  │
          │  - ≤50 unscored articles/topic (7d), DESC       │
          │  - gpt-4.1-nano → Supabase                      │
          └──────────────────────────────────────────────────┘

User clicks period button
        │
        ▼
  GET /api/news?hours=X&lang=Y&topic=Z&count=N
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: Check cache (Supabase news_cache)  │
  │  → If valid, return cached response         │
  └─────────────────────┬───────────────────────┘
                        │ (cache miss)
                        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: Read from Supabase                 │
  │  - Scored articles (score >= minScore)      │
  │  - All articles (for "All" tab)             │
  │  - Fetch prompt from topics table           │
  └─────────────────────┬───────────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: analyzeWithAI()                    │
  │  - Send top articles to gpt-4.1-nano       │
  │  - Use topic-specific prompt from DB        │
  │  - Parse relevant[] and globalSummary[]     │
  └─────────────────────┬───────────────────────┘
                        │
                        ▼
  JSON response → Client (+ async cache write)
```

---

## 14. Deployment

### Netlify

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Plugin**: `@netlify/plugin-nextjs`
- **Scheduled functions**: 2 cron jobs (batched fetch + prioritized score across active topics)
- **Domain**: `8news.ai`
- **Redirect**: `8news.netlify.app/*` → `8news.ai/:splat` (301)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4.1-nano |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for TTS |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key — **v1.80+** browser auth + session validation in API routes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `CRON_SECRET` | Yes | Secret for manual API route invocation |

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

## 17. Changelog (v1.49 → v1.88)

Summary table (one line per release). **§17.1** expands **v1.65–v1.88** in detail (aligned with `005-changelog.sql` seeds and current code).

| Version | Key Changes |
|---|---|
| v1.88 | Specialized background functions: fetch-background is fetch-only (no mini-scoring), score-background is score-only with raised caps (150/run, 300 hard cap). Scoring stamps `last_scored_at` before processing to prevent double-scoring. Removed scheduled triggers — scheduling externalized to cron-job.org calling background endpoints directly. |
| v1.87 | Migrated crons to scheduled-trigger + background-function architecture (15-min runtime). Multi-pass fetch loop processes all topics with extended mini-scoring (80 articles). Multi-pass scoring loop drains full backlog with fair budget distribution. Cron cadence changed to every 10 minutes. Cron Monitor timeline fixed to use `fetched_at`. |
| v1.86 | Restored previous cron runtime tuning (13s baseline) and removed 30s production overrides. Improved non-owner topic submission UX with a message-only pending-validation screen and dedicated `Retour page d'accueil` action. Kept `Analyse des top articles` generally available on home while hiding it during authenticated topic-edit mode. Added explicit `[functions]` directory in `netlify.toml` to fix scheduled functions not triggering after deploy. |
| v1.85 | Homepage Top analysis is now on-demand via `Analyse des top articles` (no auto-run on home load), with contextual top toasts and wording updates (`Articles sélectionnés`, `X sélectionnés et analysés par IA`). Signed-in members can propose new topics from personalization; created topics are saved inactive/hidden pending owner validation with 24h notice. Top-summary cache stability improved via deterministic ordering and normalized cache key. |
| v1.84 | Signed-in user topic personalization (onboarding, per-user selected-topic persistence, and homepage Top feed filtered by selected topics). Cron fetch/score and Netlify production env defaults aligned with 30s runtime budget. Summary metadata copy refined for selected-topic mode (`N articles, X scored and analyzed by AI`) and “Customize my topics” UI polished. |
| v1.83 | Homepage **Top 50** feed + dedicated **AI Summary** card for home (`POST /api/news/top-summary`) with grouped bullet points, references, audio playback and progressive reveal animation. Added `is_displayed` topic visibility control (hidden topics excluded from homepage Top feed while remaining active for ingestion/scoring). i18n labels updated (AI Summary / Résumé IA, Top 50 subtitle), homepage loading label and visual separation polish. |
| v1.82 | Settings **My Account** (editable name, read-only email/type) + **Users** management (owner-only table with inline edit). Homepage refresh button removed; **last-updated timestamp** on Top 20. Baselines updated (EN: "Tech intelligence, powered by AI." / FR: "La tech décodée par l'IA"). Topic creation reorganized (Label EN/FR/Slug row + Domain + AI label generation via `/api/topics/generate-labels`). Cron status: score age only penalized when backlog > 0. Google Analytics integration. |
| v1.49 | Full Stats dashboard (KPIs, score distribution, feed ranking, top articles, topic comparison) |
| v1.50 | Replace auto-reload with update banner, add period filters to stats (yesterday, 3d, 7d, 30d) |
| v1.51 | Boost scoring throughput, fix KPIs period filter |
| v1.52 | Dynamic topics & feeds from DB, TopicsPage, round-robin crons, delete 18 hardcoded cron files |
| v1.53 | Dynamic prompts from DB, full cleanup of hardcoded data (remove prompts.ts, rss-feeds.ts, scoring-prompts.ts, Topic union type) |
| v1.54 | Compact KPI boxes (7 on single line), add Anthropic topic + 20 feeds |
| v1.55 | AI-powered scoring generation, auto RSS feed discovery on topic creation, refresh topics on homepage return |
| v1.56 | Fix cron round-robin blocking (update timestamps before processing), limit scoring to 100 articles/run, score every minute |
| v1.57 | Update banner moved to top-right, add 1h/3h/6h/today period filters to stats, clickable logo → homepage |
| v1.58 | Loading spinner while topics load, topic active/inactive toggle in UI, drag & drop topic reorder |
| v1.59 | "Discover feeds by AI" button in topic edit view, AI feed discovery for existing topics |
| v1.60 | Cron scoring optimization: reduce to 50 articles/batch, smart backlog skip, OpenAI timeout handling |
| v1.61 | Cron Monitor page (KPIs, per-topic status, hourly timeline). "All Articles" sorted by score DESC. Remove x2 multiplier on maxArticles. Article stats in Summary box. Lazy-loaded "All Articles" tab (1000 limit). Max articles slider up to 100, default 20. Local timezone in timeline. Filter future hours. Cron efficiency: skip topics without backlog |
| v1.62 | Rename "Hit %" to "Score ≥ 7". Active Feeds column shows "(7d)"/"(7j)". Homepage Top 20 default feed (best scored articles last 24h). Scroll-to-top button |
| v1.63 | Home icon and logo reset to Top 20 feed (deselects topic). Topic name displayed next to Summary title. Remove standalone Top 20 button |
| v1.64 | Topic selection clears Top 20 feed and shows "select a period" prompt |
| v1.65 | **Copy link** on article cards; Cron Monitor **Reason** column (`statusReason`: backlog / fetch / score); **NEW** badge on Top 20 when `pubDate` within the last hour |
| v1.66 | Version bump; SPEC / repo tree folder name standardized to **`8news/`** |
| v1.67 | Summary **metadata** on one compact line (total / scored / AI-analyzed); tighter **mobile** typography for that line (≤640px) |
| v1.68 | **`/api/cron-stats`**: paginate heavy article reads in **1000-row** pages (PostgREST cap). **Top 20** auto-refresh every **5 min** on home when no topic selected. **Topic badge** on Top 20 cards |
| v1.69 | **cron-fetch** (phase 1): per-minute batch size `k = min(ceil(N/15), 3)`, ~**12s** deadline; **cron-score** prioritizes backlog then newest `last_fetched_at`; **post-fetch mini-score** up to **15** articles |
| v1.70 | Cron Monitor **average delay** KPI: cohort = articles with **`pub_date` in last 24h** and **scored** (aligned with “Fetched 24h” semantics); documentation sync |
| v1.71 | **cron-fetch** (phase 2): ~**10 min** full rotation (`k = min(max(1, ceil(N/10)), 4)`), **adaptive** post-fetch mini-score `min(50, max(15, inserted))`, **6s** reserve before deadline; **cron-score** can touch **multiple topics** per run (12s deadline, backlog threshold **20**). `fetchAndStoreTopicDynamic` exposes **`inserted`** (and full **`FetchResult`** aggregates in shared lib) for mini-score sizing |
| v1.72 | Cron Monitor avg delay = **`scored_at − fetched_at`** per article, shown as **`Xm XXs`**; **`fetched_at`** populated on article insert/upsert. **Stats** three-step UX: global KPIs → pick topic → pick period; optional **`kpi_only`** stats mode; **Article ranking** (renamed section), **500** rows loaded, UI shows **50** at a time with “load more” |
| v1.73 | **`changelog`** table + **`GET /api/changelog`** + in-app **Changelog** page. **Feed management**: **`GET /api/feeds-admin`**, sortable table, **POST** `.../feeds/[id]/score`, **DELETE** articles / remove feed, **toasts**. Layout widened to **916px**; **EN/FR** under nav icons; Stats feed-ranking **tooltip `title`** on source; **`/api/fetch-feeds`** / shared RSS path set **`fetched_at`**. *Follow-up UX:* feed table **Articles** / **Coverage** columns; manual score up to **50** articles (initially with a **90-day** unscored window — **removed in v1.75**) |
| v1.74 | **Housekeeping / architecture**: remove **Tailwind** + `postcss.config`; delete obsolete root **`spec-*.md`**; canonical **`src/lib/fetch-topic-dynamic.ts`** & **`score-topic-dynamic.ts`** (Netlify `shared/*.ts` re-export); **`globals.css`** for shared layout/table/grid/**keyframes**; **`theme.ts`**: `spinnerStyle`, `ghostBtn`, `ghostOutlineBtn`, color helpers; **`cookies.ts`**; move **`TopicLabel`**, **`ChangelogEntry`**, **`FeedAdminRow`** to **`types.ts`**. |
| v1.75 | **Feed admin — Score**: manual scoring uses **all** unscored articles for the feed (**newest first**), no **`pub_date`** window; still **≤50** per request. **UI refactor**: `AppHeader`, **`TopFeedSection`**, **`useTopFeed({ poll })`** (Top 20 extracted; **RSS titles only**, no localized snippets yet); **`TopicsPage/`** (index + List/Create/Detail); **`theme.ts`** `sectionCard` + form styles; home strings in **i18n**. **SPEC** §3/§8/§10/§11 aligned. |
| v1.76 | **Top 20 bilingual**: **`GET /api/news/top?lang=`**; DB reads **`snippet_ai_*`** / RSS → response **`snippet`**; **`useTopFeed({ poll, lang })`** with refetch on language change; **FR** UI: French AI summary as **primary** line when present. **`SPEC.md`** §6/§17 + **`005-changelog.sql`** (rows **1.74–1.76**); **`public/version.json`** / **`APP_VERSION`** **1.76**. |
| v1.77 | **Release 1.77**: **`public/version.json`** and **`APP_VERSION`** → **1.77**; **`.gitignore`**: ignore **`.claude/`** (agent worktrees); **SPEC** §17 and **`migrations/005-changelog.sql`** include **1.77** for parity with the in-app Changelog. **No product change** vs **v1.76** (same Top 20 i18n and feed flows). |
| v1.78 | **Scoring backlog & Netlify limits**: **cron-score** + post-fetch mini-score use **`windowHours: null`** — unscored articles are eligible **regardless of `pub_date`** (previously only last **168h**, which hid old backlog). Backlog counts **all** unscored per topic. **`POST .../feeds/[feedId]/score`**: OpenAI batches of **12** in **parallel** (avoids Netlify **~10s** wall timeout from sequential calls), **8s**/call, trimmed **`source`** match, **`maxDuration` 26**. **`version.json`** / **`APP_VERSION`** **1.78**; **`insert-changelog-1.78.sql`**. **`GET /api/test-score`** still defaults to **168h** window. |
| v1.79 | **Netlify 13s cron optimization**: unify cron runtime budget around **13s** cap; **fresh-first** scoring priority (`fetched_at` last 5m), adaptive scoring quotas, fairness anti-starvation, structured cron metrics. **Feed manual score** route updated to **`maxDuration` 13** with elapsed-budget partial responses (`partial`). **Cron Monitor** adds `delay p95`, `SLA <5m`, `fresh backlog 5m`, and alerts. |
| v1.80 | **Supabase user authentication**: optional **email + password** sign-in; **Topics** + **Feed management** (UI + APIs) require a session; rest of the app stays public. **`@supabase/ssr`**, **`middleware.ts`**, **`AuthProvider`** / **`AuthModal`**, **`auth-api.ts`** + **`supabase-browser.ts`**. Register: first name, last name, email, password → **`user_metadata`**. **`GET /api/topics`** without `?all=1` remains public for the homepage selector. |
| v1.81 | **`member` vs `owner` roles**: **`user_type`** in **`user_metadata`** (`member` at sign-up; **`owner`** set in Supabase Dashboard). **Topics** and **Feed management** are **`owner`**-only; **members** keep guest-level access to other screens. **`requireOwnerSession()`** returns **401** / **403**. **`src/lib/user-type.ts`**. **`version.json`** / **`APP_VERSION`** **1.81**; **`insert-changelog-1.81.sql`**. |

### 17.1 Release detail — v1.65 through v1.88

| Ver. | EN (what shipped) | FR (titre seed migration) |
|------|-------------------|----------------------------|
| **1.88** | Specialized background functions for single-responsibility: **fetch-background** stripped of all mini-scoring (fetch-only), **score-background** raised to **150 articles/run** default and **300 hard cap** with aggressive adaptive scaling. Scoring now stamps `last_scored_at` **before** processing to prevent double-scoring from concurrent runs, and tracks in-memory backlog for accurate budget distribution. Removed the scheduled trigger functions (`cron-fetching`, `cron-scoring`) and their `netlify.toml` schedule declarations — scheduling is now **externalized to cron-job.org** calling `/.netlify/functions/cron-fetching-background` and `/.netlify/functions/cron-scoring-background` directly via POST every 10 minutes. | *Background functions spécialisées, scheduling externe cron-job.org* |
| **1.87** | Migrated cron architecture from scheduled functions (30s limit) to a **scheduled-trigger + background-function** pattern with **15-minute** runtime. `cron-fetching` and `cron-scoring` become lightweight triggers that POST to `cron-fetching-background` and `cron-scoring-background` (suffix `-background` = Netlify background function). Fetch background runs a **multi-pass loop** that re-checks `last_fetched_at` staleness each pass and processes all active topics, with extended post-fetch mini-scoring (up to 80 articles per topic, budget distributed fairly). Score background runs a **multi-pass loop** that re-queries backlogs after each pass and keeps scoring until all are drained or the 13-min budget is exhausted, with per-topic budget split across remaining topics. Cron schedule changed from `* * * * *` to `*/10 * * * *` (every 10 minutes). Fixed Cron Monitor activity timeline to bucket articles by `fetched_at` instead of `pub_date`. | *Architecture background functions, multi-pass fetch/score, cadence 10 min, fix timeline* |
| **1.86** | Rolled cron runtime tuning back to previous stable settings: 13s wall/budget defaults in `cron-fetch`/`cron-score`, previous per-topic elapsed caps restored, and production env overrides removed from `netlify.toml`. Non-owner topic creation UX now switches to a message-only confirmation state after submit (`24h max` validation notice) with a dedicated back-to-home button, instead of keeping the creation form visible. Home control refinement: `Analyze top articles` remains globally accessible, except hidden while an authenticated user is actively editing topic preferences. Added explicit `[functions]` directory declaration in `netlify.toml` to restore scheduled function triggering after deploy with the Next.js plugin. | *Rollback cron stable 13s, écran confirmation membre, fix fonctions schedulées* |
| **1.85** | Homepage top analysis is now explicitly user-triggered (`Analyze top articles`) instead of auto-loading on home. Added guidance toasts for missing topic / next step after selecting a topic, and refreshed FR copy (`Articles sélectionnés`; `N articles, X sélectionnés et analysés par IA`). Topic personalization now includes member-side topic proposal from home; topic creation APIs accept authenticated users, and newly created topics are forced inactive/hidden pending owner validation with a visible “24h max” notice. Improved button visual consistency on personalization controls and fixed top-summary cache misses by enforcing deterministic article ordering and order-insensitive cache key hashing. | *Analyse top à la demande, soumission topic membre, cache stable et wording FR* |
| **1.84** | Signed-in user personalization for homepage topics: onboarding modal + editable topic selection, persisted in DB (`user_topic_preferences`), with homepage top feed and summary requests filtered by preferred topics when set. Cron tuning upgraded from 13s assumptions to 30s Netlify window (fetch/score budgets and safe production env overrides). Summary metadata copy now supports selected-topic mode (`N articles, X scored and analyzed by AI`) and topic personalization controls were visually refined. | *Personnalisation topics utilisateur, cron 30s, résumé avec compteur analysé, polish UI* |
| **1.83** | Homepage default feed now uses **Top 50** displayed-topic articles over 24h. Added homepage-only **AI Summary** (`POST /api/news/top-summary`) with grouped bullets + refs + TTS, plus progressive reveal animation. New `is_displayed` topic visibility toggle excludes hidden topics from homepage selection while ingestion/scoring continues. | *Top 50 accueil, résumé IA home groupé, filtre display* |
| **1.82** | Settings: **My Account** section for any authenticated user (editable first/last name, read-only email + user type badge); **Users** management for `owner` (inline edit name + type, service-role API). Homepage: removed manual refresh button; added **last-updated timestamp** on Top 20 subtitle. Baselines: EN "Tech intelligence, powered by AI." / FR "La tech décodée par l'IA". Topic creation: 3-column row (Label EN, Label FR, Slug) + Domain moved up + **"Generate with AI"** for labels via `/api/topics/generate-labels`. Cron status: score age only flags slow/high when backlog > 0. **Google Analytics** (`G-X8RR3FMCR0`) in `layout.tsx`. | *Mon compte, gestion utilisateurs, timestamp Top 20, GA, labels IA* |
| **1.65** | Per-article **copy-to-clipboard**; Cron table **Reason** from `statusReason`; **NEW** label on Top 20 items published **within the last hour**. | *Copie lien, raison Cron, badge NEW* |
| **1.66** | Changelog seed + SPEC path **8news/** consistency. | *Bump version & arbre SPEC* |
| **1.67** | Single **summary meta** line (counts + “analyzed by AI”); **responsive** font size/line-height for that block. | *Ligne méta résumé (mobile)* |
| **1.68** | **cron-stats** no longer truncates at 1k rows for aggregates; **Top 20** polling on idle home; **topic** label on each Top 20 card. | *Pagination Supabase & refresh Top 20* |
| **1.69** | Fetch cron: smaller batches (`N/15`, max 3 topics), strict **12s** budget; score cron: **backlog-first** ordering; **≤15** articles scored immediately after a fetch when time remains. | *Optimisation cron phase 1* |
| **1.70** | **Avg delay** denominator fixed to 24h-scored cohort matching KPI copy. | *Correction délai moyen & sync doc* |
| **1.71** | Fetch cron: **larger** batches (`N/10`, max **4**), **adaptive** mini-score tied to **`inserted`**; score cron: **multi-topic** within 12s if backlogs small. | *Optimisation cron phase 2* |
| **1.72** | **Latency** metric uses ingest→score timestamps; **`fetched_at`** column; **Stats** navigation + **lazy** article list (50-step). | *Refonte stats & correction délai fetch* |
| **1.73** | **In-app changelog** + **feeds admin** CRUD/score flows + **toasts**; shell width **916px**; i18n layout tweak; **RSS pipeline** writes **`fetched_at`**. Product tweaks after seed: **Articles** / **Coverage** columns, **90d** manual score, **50** articles cap (see v1.74 for code consolidation). | *Gestion des flux, journal des mises à jour, polish UX* |
| **1.74** | **Housekeeping**: remove **Tailwind** + `postcss.config`; delete obsolete root **`spec-*.md`**; canonical **`src/lib/fetch-topic-dynamic.ts`** & **`score-topic-dynamic.ts`** (Netlify **`shared/*.ts`** re-export); **`globals.css`** for layout/table/grid/**keyframes**; **`theme.ts`**: `spinnerStyle`, `ghostBtn`, `ghostOutlineBtn`; **`cookies.ts`**; **`TopicLabel`**, **`ChangelogEntry`**, **`FeedAdminRow`** → **`types.ts`**. | *Nettoyage : CSS, libs partagées, types* |
| **1.75** | **Feed admin score** without **90-day** window (**all** unscored, newest first, cap **50**). **Refactor**: **`AppHeader`**, **`TopFeedSection`**, **`useTopFeed({ poll })`**; **`TopicsPage/`**; **`theme`** section/form tokens; home **i18n**. Top 20 still **title-only** from API. | *Scoring flux, refonte UI accueil* |
| **1.76** | **Top 20 i18n**: **`/api/news/top?lang=`**, **`snippet`** from **`snippet_ai_*`** / RSS; **`useTopFeed({ poll, lang })`**; **FR** = résumé IA en tête si présent. **SPEC** §6/§17, seed **005**, **`version.json`** / **`APP_VERSION`** **1.76**. | *Top 20 bilingue, doc & version* |
| **1.77** | **Identifiers** **1.77** (`version.json`, **`APP_VERSION`**). **Repo**: **`.gitignore`** adds **`.claude/`**. **Docs/DB**: SPEC §17 through **1.77**; on Supabase run **`migrations/insert-changelog-1.77.sql`** once if the **1.77** row is missing. | *v1.77, gitignore .claude, journal* |
| **1.78** | **Cron / mini-score**: `windowHours: null` — no **`pub_date`** cutoff on unscored selection; backlog = all unscored per topic. **Manual feed score**: batches **12** **parallel**, **8s**/call, **`source` trim**, **`maxDuration` 26** (Netlify). **1.78** identifiers + **`insert-changelog-1.78.sql`**. | *Scoring backlog, limites Netlify, v1.78* |
| **1.79** | **Cron orchestration for Netlify 13s**: shared runtime budget (`CRON_BUDGET_MS`, reserve), fetch cap default **3 topics/run**, adaptive post-fetch mini-score with remaining-time gate, score cron **fresh-first** with adaptive `maxArticles` and fairness injection. **Manual feed score** route now **`maxDuration` 13** with sequential batches and `partial` response when budget ends. **Cron Monitor**: add `delayP95`, `SLA<5m`, `freshBacklog5m`, and `alerts`. | *Optimisation crons 13s Netlify & SLA <5 min* |
| **1.80** | **Supabase Auth** (optional): **Sign in / Sign out** next to language toggle; **Topics** + **Feeds** nav + admin APIs gated (`401` without session); **`middleware`** cookie refresh; homepage **`GET /api/topics`** still public. Registration: prénom, nom, e-mail, MDP → metadata. | *Authentification Supabase, accès Topics/Feeds réservé* |
| **1.81** | **`user_type`**: **`member`** (default) / **`owner`** (dashboard). Only **`owner`** sees Topics + Feed management; **`403`** for **`member`** on admin APIs. **`requireOwnerSession()`**, **`user-type.ts`**. | *Rôles member/owner, admin réservé aux owners* |

> **Note:** If the in-app Changelog was filled before **1.74–1.88** rows existed, run the per-version **`INSERT`** statements (e.g. **`insert-changelog-1.88.sql`**) or re-apply **`005-changelog.sql`** (after **`TRUNCATE changelog`** only if you want a full re-seed). **SPEC** and **runtime** remain authoritative when copy diverges.

---

## 18. Known Limitations

- **Partial authentication (v1.80+ / roles v1.81+)** — **Supabase Auth** with **`member`** (default) vs **`owner`**. **Topics** and **Feed management** are **`owner`**-only (UI + APIs). Guests and **members** still use the homepage, stats, crons, changelog, and settings. No per-user data partitioning in the database; **`owner`** is an **admin role** for those screens.
- **Serverless timeout** — Netlify background functions have a **15-minute** wall-time. Cron jobs run as background functions invoked every 10 minutes by **cron-job.org**, with internal budgets (~13 min) and safety reserves. `POST .../feeds/[feedId]/score` is capped at **`maxDuration` 13** with a shorter internal elapsed budget and may return `partial` when time is exhausted.
- **RSS availability** — Some feeds may go offline; AI feed discovery validates upfront but feeds can break later
- **AI cost** — Each request consumes OpenAI tokens (gpt-4.1-nano), each TTS request consumes ElevenLabs credits
- **No SSR** — The page is a client-only component (`"use client"`)
- **Cookie-only persistence** — User preferences persisted in cookies; topic and period reset on reload
- **AI feed discovery accuracy** — GPT may suggest invalid URLs; validation catches most but not all edge cases
