# 8news.ai — Technical Specification

**Version**: v1.56
**Last updated**: March 2026

---

## 1. Overview

**8news.ai** is an AI-powered news aggregation and summarisation platform. It fetches articles from curated RSS feeds across multiple **dynamic, database-driven topics**, pre-scores them with AI via scheduled Netlify cron jobs (stored in Supabase), then analyses the top-scoring articles with OpenAI's GPT-4.1-nano for structured summarisation. Results are presented in a dark-themed, bilingual (EN/FR) web interface with ElevenLabs text-to-speech playback.

Users can **create custom topics** from the UI, with AI-assisted generation of scoring criteria and automatic RSS feed discovery.

**Tagline**: "AI that decodes the news" / "L'IA qui décrypte l'actualité"

**Live URL**: https://8news.ai
**Repository**: https://github.com/cyrille-catoio/8news-ai

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | ^5 |
| Frontend | React | 19.2.3 |
| CSS | Tailwind CSS v4 + inline styles via `theme.ts` | ^4 |
| RSS Parsing | rss-parser | ^3.13.0 |
| AI (text analysis) | OpenAI API — `gpt-4.1-nano` | via `openai` ^6.25.0 |
| AI (text-to-speech) | ElevenLabs API — `eleven_flash_v2_5` model | via REST API |
| Database | Supabase (PostgreSQL) | via `@supabase/supabase-js` |
| Hosting | Netlify | via `@netlify/plugin-nextjs` ^5.15.8 |
| Cron Jobs | Netlify Scheduled Functions | `@netlify/functions` |
| Domain | 8news.ai (redirect from 8news.netlify.app) | |

---

## 3. Project Structure

```
newsread/
├── public/
│   ├── logo-8news.png          # App logo (PNG, "8" gold / "news" light grey)
│   ├── favicon.svg             # Browser favicon — gold "8" on black, 512×512
│   ├── apple-touch-icon.svg    # iOS home screen icon — gold "8" on black, 180×180
│   └── version.json            # {"version":"1.56"} — auto-update check
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, metadata, favicons
│   │   ├── globals.css         # Global CSS reset + base styles
│   │   ├── page.tsx            # Main client component (entire UI)
│   │   └── api/
│   │       ├── news/route.ts           # GET /api/news — Supabase read + AI analysis
│   │       ├── tts/route.ts            # POST /api/tts — ElevenLabs Text-to-Speech
│   │       ├── stats/route.ts          # GET /api/stats — Dashboard statistics
│   │       ├── fetch-feeds/route.ts    # GET /api/fetch-feeds — manual RSS fetch
│   │       ├── test-score/route.ts     # GET /api/test-score — manual scoring
│   │       └── topics/
│   │           ├── route.ts                    # GET/POST /api/topics — list & create
│   │           ├── generate-scoring/route.ts   # POST — AI-generate scoring criteria
│   │           └── [id]/
│   │               ├── route.ts                # GET/PATCH/DELETE /api/topics/:id
│   │               ├── feeds/
│   │               │   ├── route.ts            # POST /api/topics/:id/feeds
│   │               │   └── [feedId]/route.ts   # PATCH/DELETE feed
│   │               └── discover-feeds/route.ts # POST — AI auto-discover RSS feeds
│   └── lib/
│       ├── types.ts            # TypeScript interfaces (TopicItem, TopicDetail, etc.)
│       ├── theme.ts            # Design tokens (colors, fonts, shared styles)
│       ├── i18n.ts             # EN/FR translation strings (60+ keys)
│       ├── supabase.ts         # Supabase client, caching, article/topic/feed queries
│       └── html.ts             # HTML entity decoder
├── netlify/
│   └── functions/
│       ├── shared/
│       │   ├── fetch-topic.ts  # Shared: fetch RSS → Supabase
│       │   └── score-topic.ts  # Shared: score articles with AI → Supabase
│       ├── cron-fetch.ts       # Cron: round-robin RSS fetch (*/5 * * * *)
│       └── cron-score.ts       # Cron: round-robin scoring (* * * * *)
├── migrations/
│   ├── 001-topics-feeds.sql    # Create topics + feeds tables, seed 8 topics + ~160 feeds
│   ├── 002-prompts.sql         # Add prompt_en/prompt_fr columns, seed prompts
│   ├── 003-topic-anthropic.sql # Add Anthropic topic with scoring + prompts
│   └── 004-feeds-anthropic.sql # Add 20 RSS feeds for Anthropic
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

**Columns**: `id`, `topic`, `source`, `title`, `link`, `pub_date`, `content`, `snippet`, `snippet_ai_en`, `snippet_ai_fr`, `relevance_score`, `score_reason`, `scored_at`

### 5.5 Cache TTL (based on time window)

| Hours | Cache duration |
|---|---|
| ≤1h | 5 min |
| ≤6h | 15 min |
| ≤24h | 30 min |
| >24h | 60 min |

---

## 6. Backend Architecture

### 6.1 Netlify Scheduled Functions (Cron Jobs)

Articles are fetched and pre-scored by **2 generic round-robin** cron jobs (not per-topic files).

**`cron-fetch.ts`** — RSS fetching:
- Runs **every 5 minutes** (`*/5 * * * *`)
- Picks the topic with the oldest `last_fetched_at` (round-robin)
- Updates `last_fetched_at` **before** processing (prevents blocking on failure)
- Fetches all active RSS feeds for that topic
- Parses, decodes HTML entities, upserts into Supabase `articles` table
- Each topic fetched approximately every `5 × N` minutes (N = active topics)

**`cron-score.ts`** — AI scoring:
- Runs **every minute** (`* * * * *`)
- Picks the topic with the oldest `last_scored_at` (round-robin)
- Updates `last_scored_at` **before** processing (prevents blocking on failure)
- Fetches up to **100** unscored articles from the last 7 days, most recent first
- Scores in batches of 50 using `gpt-4.1-nano`
- Each article gets: relevance score (1-10), reason, AI-generated EN/FR summaries (for score ≥5)
- Each topic scored approximately every `N` minutes (N = active topics)

**Scoring criteria** (stored in `topics` table):
- **9-10**: Major breaking news
- **7-8**: Significant development
- **5-6**: Interesting content
- **3-4**: Low value (opinion without facts)
- **1-2**: Off-topic or spam

### 6.2 API Routes

#### `GET /api/news`

Main data endpoint. Reads pre-scored articles from Supabase, analyses with AI, returns structured summary.

| Param | Type | Default | Description |
|---|---|---|---|
| `hours` | float | 24 | Time window (0.25 to 168) |
| `lang` | `"en"` \| `"fr"` | `"en"` | Language for AI output |
| `topic` | string | — | Topic ID (validated against DB) |
| `count` | int | 10 | Target number of relevant articles (3–30) |

Analysis prompt is fetched dynamically from the `topics` table (`prompt_en` or `prompt_fr`), with `{{max}}` replaced by the article count.

**Minimum score by time window:**

| Hours | Min score |
|---|---|
| ≤1h | 3 |
| ≤6h | 4 |
| ≤12h | 5 |
| ≤48h | 6 |
| >48h | 7 |

#### `GET /api/stats`

Dashboard statistics endpoint with optional topic and period filtering.

| Param | Type | Default | Description |
|---|---|---|---|
| `topic` | string | `"all"` | Topic ID or `"all"` |
| `days` | int | 0 | Period filter (0 = all time, 1 = yesterday, 3, 7, 30) |

Returns: `global` KPIs, `scoreDistribution`, `feedRanking`, `topArticles`, `topicComparison`.

#### `POST /api/tts`

Text-to-Speech via ElevenLabs `eleven_flash_v2_5`. Returns `audio/mpeg` (MP3).

#### Topics API

| Route | Method | Description |
|---|---|---|
| `/api/topics` | GET | List active topics with feed counts |
| `/api/topics` | POST | Create topic (auto-generates prompts if empty) |
| `/api/topics/[id]` | GET | Topic detail with feeds, scoring, prompts |
| `/api/topics/[id]` | PATCH | Update topic (labels, scoring, prompts) |
| `/api/topics/[id]` | DELETE | Soft-delete topic (`is_active = false`) |
| `/api/topics/[id]/feeds` | POST | Add feed to topic |
| `/api/topics/[id]/feeds/[feedId]` | PATCH | Update feed |
| `/api/topics/[id]/feeds/[feedId]` | DELETE | Remove feed |
| `/api/topics/generate-scoring` | POST | AI-generate 5 scoring tiers from domain |
| `/api/topics/[id]/discover-feeds` | POST | AI-discover + validate + insert 10 RSS feeds |

#### `POST /api/topics/generate-scoring`

Uses GPT-4.1-nano to generate 5 scoring tier descriptions from a domain description. Returns `{ tier1, tier2, tier3, tier4, tier5 }`.

#### `POST /api/topics/[id]/discover-feeds`

1. Reads topic domain from DB
2. Asks GPT-4.1-nano for 10 RSS feed URLs
3. Validates each in parallel (HTTP fetch, XML check, ≥1 `<item>`/`<entry>`, 8s timeout)
4. Inserts valid feeds into DB, deduplicates against existing
5. Returns `{ added: [...], rejected: [...] }`

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

The entire UI is in `src/app/page.tsx` (client component, `"use client"`).

### 8.1 Layout

- **Background**: Pure black (`#000000`)
- **Max width**: 830px, centered
- **Font**: System UI stack
- **Theme**: Black & gold (`#c9a227`)

### 8.2 Navigation

The app has **4 pages** managed by `currentPage` state (`"home"` | `"stats"` | `"topics"` | `"settings"`):

**Header** (shared across all pages):
- **Logo**: PNG image (`/logo-8news.png`), responsive height
- **Subtitle**: "AI that decodes the news" / "L'IA qui décrypte l'actualité"
- **Top-right controls** (left to right):
  - **Language toggle** (EN/FR) — Segmented control
  - **Home icon** (house SVG)
  - **Stats icon** (bar chart SVG)
  - **Topics icon** (RSS signal SVG)
  - **Settings icon** (gear SVG)

### 8.3 Home Page

#### Topic Selector (`TopicToggle`)

- **Layout**: CSS grid, **max 8 topics per line**
  - Desktop (>640px): `repeat(min(N, 8), 1fr)` — wraps to next line if >8 topics
  - Mobile (≤640px): 4 columns → wraps
- **Data**: Topics loaded dynamically from `/api/topics` on mount and when returning from other pages
- **Style**: Individual rounded buttons with gold border, gold fill when active
- **Default**: No topic selected on launch

#### Period Selector

11 buttons: 30m, 1h, 3h, 6h, 12h, 24h, 48h, 3d, 7d, 14d, 30d

#### Loading State

- Progress bar with simulated two-phase animation
- Dynamic loading message ("Reading articles..." → "AI analysis...")
- Notification double beep on completion (880Hz + 1050Hz)

#### Summary Box (`SummaryBox`)

- Up to 8 bullet points with gold "•" prefix and source reference links
- Audio player for TTS playback
- Period display

#### Result Tabs

- **"Relevant articles"** — AI-filtered with generated summaries
- **"All articles"** — All articles from Supabase, grouped by source

### 8.4 Stats Page

Full dashboard with topic selector tabs, period filter, and multiple sections:

**Topic Selector**: Tabs for "All" and each active topic (loaded from DB)

**Period Filter**: All time, Yesterday, 3 days, 7 days, 30 days — all KPIs update dynamically

**KPIs** (7 boxes, single compact line):
- Total articles, Scored, Coverage %, Avg score, New 24h, New 7d, Scored 24h

**Sections**:
- **Score distribution**: Horizontal bar chart by tier (1-2 through 9-10)
- **Feed ranking**: Sortable table (source, total, scored, avg, hit rate, tier distribution). Source names are clickable links
- **Top articles**: Best-scored articles with score, reason, link
- **Topic comparison**: Table comparing all topics (articles, coverage, avg score, hit rate, feeds)

### 8.5 Topics Page

Full CRUD management for topics and feeds, with 3 views:

**List view**: Table of all topics with #, name, feed count, status, click to detail

**Create view**: Form with:
- Slug (auto-generated from label EN), Label EN, Label FR
- Scoring criteria: Domain + 5 tiers
  - **"✨ Generate with AI"** button: calls `/api/topics/generate-scoring` to auto-fill tiers from domain
- Analysis Prompt (optional): EN/FR tabs, monospace textarea, `{{max}}` info
- **"🔍 Find 10 RSS feeds automatically"** checkbox (checked by default):
  - After topic creation, calls `/api/topics/[id]/discover-feeds`
  - Shows spinner "Searching for RSS feeds…" in the detail view
  - Displays result summary (✅ X added / ❌ Y rejected)

**Detail view**:
- Topic info (labels, domain, scoring criteria — read-only with edit toggle)
- Analysis prompt (EN/FR tabs, read/edit modes, `{{max}}` validation warning)
- Feeds list (name, domain link, delete button) + add feed form

### 8.6 Settings Page (`SettingsPage`)

Two sections:

**1. Preferences**
- **Max relevant articles** slider: 3–30, default 10, persisted in cookie

**2. Voice**
- **Speed** slider: 0.7x–1.2x, default 1.05x
- **Voice EN** (6 voices), **Voice FR** (6 voices)

### 8.7 Audio Player (`AudioPlayer`)

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

### 8.8 Auto-Update Banner

The app checks `public/version.json` every **5 minutes**. If the version differs from `APP_VERSION`, a gold banner appears at the **top-right** of the screen: "New version available — click to refresh". Clicking reloads the page. No auto-reload.

### 8.9 Version Footer

Fixed bottom-right: `v1.56` (incremented with each GitHub push).

---

## 9. Internationalisation (i18n)

Defined in `src/lib/i18n.ts` — **60+ translation keys**.

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

---

## 11. State Management

All state is managed with React hooks (`useState`, `useRef`, `useCallback`) in the `Home` component. No external state library.

| State | Type | Default | Persistence |
|---|---|---|---|
| `lang` | `"en"` \| `"fr"` | `"en"` | Cookie |
| `topic` | string \| null | null | None |
| `topics` | TopicItem[] | [] | Fetched from `/api/topics` |
| `maxArticles` | number | 10 | Cookie |
| `ttsSpeed` | number | 1.05 | Cookie |
| `ttsVoice` | string | `"sarah"` | Cookie |
| `ttsVoiceFr` | string | `"george"` | Cookie |
| `currentPage` | `"home"` \| `"stats"` \| `"topics"` \| `"settings"` | `"home"` | None |
| `data` | SummaryResponse \| null | null | None |
| `loading` | boolean | false | None |

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
}

interface StatsResponse {
  global: { totalArticles, scoredArticles, pctScored, avgScore, new24h, new7d, scored24h };
  scoreDistribution: Array<{ tier, count, pct }>;
  feedRanking: Array<{ source, topic, total, scored, avgScore, hitRate, pct9_10..pct1_2 }>;
  topArticles: Array<{ title, link, source, topic, pubDate, score, reason }>;
  topicComparison: Array<{ topic, total, scored, pctScored, avgScore, hitRate, activeSources, totalFeeds }>;
}
```

---

## 13. Data Flow

```
          ┌──────────────────────────────────────────────────┐
          │  BACKGROUND (Netlify Scheduled Functions)        │
          │                                                  │
          │  cron-fetch.ts (*/5 * * * *)                    │
          │  - Round-robin: pick topic with oldest fetch     │
          │  - Update last_fetched_at BEFORE processing     │
          │  - Fetch active RSS feeds from DB                │
          │  - Parse, decode, deduplicate                    │
          │  - Upsert into Supabase `articles` table         │
          │                                                  │
          │  cron-score.ts (* * * * *)                      │
          │  - Round-robin: pick topic with oldest score     │
          │  - Update last_scored_at BEFORE processing      │
          │  - Fetch ≤100 unscored articles (last 7 days)    │
          │  - Most recent articles scored first             │
          │  - Score with gpt-4.1-nano (batches of 50)       │
          │  - Store score + AI summaries in Supabase         │
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
- **Scheduled functions**: 2 cron jobs (1 fetch + 1 score), round-robin across all active topics
- **Domain**: `8news.ai`
- **Redirect**: `8news.netlify.app/*` → `8news.ai/:splat` (301)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4.1-nano |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for TTS |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
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
2. Enter slug, EN/FR labels
3. Enter scoring domain description
4. Click **"✨ Generate with AI"** to auto-fill scoring criteria (optional)
5. Optionally customize the analysis prompt (EN/FR)
6. Leave **"🔍 Find 10 RSS feeds automatically"** checked (or uncheck to add feeds manually later)
7. Click **"Create"**

The topic immediately appears in the homepage topic selector, stats page, and cron rotation. No code changes or deployment required.

---

## 17. Changelog (v1.49 → v1.56)

| Version | Key Changes |
|---|---|
| v1.49 | Full Stats dashboard (KPIs, score distribution, feed ranking, top articles, topic comparison) |
| v1.50 | Replace auto-reload with update banner, add period filters to stats (yesterday, 3d, 7d, 30d) |
| v1.51 | Boost scoring throughput, fix KPIs period filter |
| v1.52 | Dynamic topics & feeds from DB, TopicsPage, round-robin crons, delete 18 hardcoded cron files |
| v1.53 | Dynamic prompts from DB, full cleanup of hardcoded data (remove prompts.ts, rss-feeds.ts, scoring-prompts.ts, Topic union type) |
| v1.54 | Compact KPI boxes (7 on single line), add Anthropic topic + 20 feeds |
| v1.55 | AI-powered scoring generation, auto RSS feed discovery on topic creation, refresh topics on homepage return |
| v1.56 | Fix cron round-robin blocking (update timestamps before processing), limit scoring to 100 articles/run, score every minute |

---

## 18. Known Limitations

- **No authentication** — The app is public, no user accounts
- **Serverless timeout** — Netlify functions have ~15s limit; scoring limited to 100 articles/run to stay within bounds
- **RSS availability** — Some feeds may go offline; AI feed discovery validates upfront but feeds can break later
- **AI cost** — Each request consumes OpenAI tokens (gpt-4.1-nano), each TTS request consumes ElevenLabs credits
- **No SSR** — The page is a client-only component (`"use client"`)
- **Cookie-only persistence** — User preferences persisted in cookies; topic and period reset on reload
- **AI feed discovery accuracy** — GPT may suggest invalid URLs; validation catches most but not all edge cases
