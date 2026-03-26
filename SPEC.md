# 8news.ai — Technical Specification

**Version**: v1.48
**Last updated**: March 2026

---

## 1. Overview

**8news.ai** is an AI-powered news aggregation and summarisation platform. It fetches articles from curated RSS feeds across multiple topics, pre-scores them with AI via scheduled Netlify cron jobs (stored in Supabase), then analyses the top-scoring articles with OpenAI's GPT-4.1-nano for structured summarisation. Results are presented in a dark-themed, bilingual (EN/FR) web interface with ElevenLabs text-to-speech playback.

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
│   └── version.json            # {"version":"1.48"} — auto-update check
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, metadata, favicons
│   │   ├── globals.css         # Global CSS reset + base styles
│   │   ├── page.tsx            # Main client component (entire UI)
│   │   └── api/
│   │       ├── news/route.ts   # GET /api/news — Supabase read + AI analysis
│   │       ├── tts/route.ts    # POST /api/tts — ElevenLabs Text-to-Speech
│   │       ├── fetch-feeds/route.ts  # GET /api/fetch-feeds — manual RSS fetch
│   │       └── test-score/route.ts   # GET /api/test-score — manual scoring
│   └── lib/
│       ├── types.ts            # TypeScript interfaces (Topic, ScoreResult, etc.)
│       ├── theme.ts            # Design tokens (colors, fonts, shared styles)
│       ├── i18n.ts             # EN/FR translation strings (40+ keys)
│       ├── rss-feeds.ts        # RSS feed URLs per topic (20 feeds each)
│       ├── prompts.ts          # AI system prompts per topic × language
│       ├── scoring-prompts.ts  # AI scoring prompts per topic
│       ├── supabase.ts         # Supabase client, caching, article queries
│       └── html.ts             # HTML entity decoder
├── netlify/
│   └── functions/
│       ├── shared/
│       │   ├── fetch-topic.ts  # Shared: fetch RSS → Supabase
│       │   └── score-topic.ts  # Shared: score articles with AI → Supabase
│       ├── fetch-conflict.ts   # Cron: fetch conflict feeds (@hourly)
│       ├── fetch-ai.ts         # Cron: fetch AI feeds (@hourly)
│       ├── fetch-aiengineering.ts
│       ├── fetch-robotics.ts
│       ├── fetch-crypto.ts
│       ├── fetch-bitcoin.ts
│       ├── fetch-videogames.ts
│       ├── fetch-elon.ts
│       ├── score-conflict.ts   # Cron: score conflict articles (10 * * * *)
│       ├── score-ai.ts
│       ├── score-aiengineering.ts
│       ├── score-robotics.ts
│       ├── score-crypto.ts
│       ├── score-bitcoin.ts
│       ├── score-videogames.ts
│       └── score-elon.ts
├── .env                        # API keys (not committed)
├── .env.example                # Placeholder for API keys
├── netlify.toml                # Netlify build + redirect config
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 4. Topics

The application supports **8 topics**, each with ~20 curated RSS feeds, dedicated EN/FR AI prompts, and AI scoring criteria:

| # | Topic ID | Label (EN) | Label (FR) | Focus |
|---|---|---|---|---|
| 1 | `conflict` | Iran War | Iran War | USA/Israel vs Iran conflict, Hezbollah, Houthis, militias |
| 2 | `ai` | AI | IA | AI models, breakthroughs, products, regulation, industry news |
| 3 | `aiengineering` | AI Eng. | AI Eng. | Production AI systems, coding agents, LLM engineering, infra, MLOps |
| 4 | `robotics` | Robotics | Robotique | Humanoid robots, Unitree, Tesla Optimus, Boston Dynamics, Figure AI |
| 5 | `crypto` | Crypto | Crypto | Cryptocurrency, blockchain, DeFi, regulation, market movements |
| 6 | `bitcoin` | Bitcoin | Bitcoin | BTC-only: price, ETFs, mining, Lightning, on-chain, institutional adoption |
| 7 | `videogames` | Video Games | Jeux Vidéo | Game releases, reviews, studios, consoles, esports, industry business |
| 8 | `elon` | Elon Musk | Elon Musk | Tesla, SpaceX, xAI, X/Twitter, Neuralink, Starlink |

### Topic order in UI
`Iran War` → `AI` → `AI Eng.` → `Robotics` → `Crypto` → `Bitcoin` → `Video Games` → `Elon Musk`

---

## 5. RSS Feeds

Each topic has approximately **20 RSS feed URLs** defined in `src/lib/rss-feeds.ts`.

### 5.1 Iran War (conflict)
BBC News, Al Jazeera, The Guardian, France 24, DW, NYT World, NPR News, ABC News, Times of Israel, Jerusalem Post, Middle East Eye, War on the Rocks, The War Zone, Google News Iran, Sky News, CBS News, Euronews, The Hill, Politico Defense, CNBC World.

### 5.2 AI
TechCrunch AI, The Verge AI, Wired AI, Ars Technica, VentureBeat AI, MIT Tech Review, The Register AI, AI News, Google AI Blog, OpenAI Blog, Hacker News AI, Hugging Face Blog, Towards Data Science, DeepMind Blog, Simon Willison, Engadget, Marktechpost, The Decoder, ZDNET AI, Last Week in AI.

### 5.3 AI Engineering
Latent Space, Simon Willison, Eugene Yan, Chip Huyen, LangChain Blog, Hugging Face Blog, GitHub Blog, OpenAI Blog, Google AI Blog, Vercel Blog, The Verge AI, TechCrunch AI, VentureBeat AI, DeepMind Blog, Together AI Blog, Replicate Blog, W&B Fully Connected, The Pragmatic Engineer, InfoQ AI/ML, MIT Tech Review AI.

### 5.4 Robotics
The Robot Report, TechCrunch Robotics, The Verge AI, Ars Technica, Wired AI, VentureBeat AI, MIT Tech Review, Hacker News Robotics, Robohub, Singularity Hub, Google DeepMind, OpenAI Blog, Futurism, Slash Gear, IEEE Robotics, Hackaday, Science Daily Robots, Engadget, ZDNET Robotics, SCMP Tech.

### 5.5 Crypto
CoinDesk, Cointelegraph, The Block, Decrypt, NewsBTC, U.Today, Bitcoinist, The Daily Hodl, CryptoPotato, Bitcoin Magazine, Bitcoin News, Blockworks, Glassnode Insights, BitcoinDev Blog, Stacker News, Crypto Briefing, AMBCrypto, Blockonomi, Coingape, Crypto News.

### 5.6 Bitcoin
Bitcoin Magazine, CoinDesk, Cointelegraph Bitcoin, NewsBTC, Bitcoinist, Bitcoin.com News, Decrypt, The Bitcoin Layer, CryptoNews Bitcoin, Blockworks, The Block, AMBCrypto, WatcherGuru, CryptoPotato, Coingape, Bitcoin Insider, Protos, Unchained, Coinpedia, Crypto Briefing.

### 5.7 Video Games
IGN, Kotaku, GameSpot, PC Gamer, Eurogamer, Polygon, Rock Paper Shotgun, VG247, GamesRadar+, Destructoid, Nintendo Life, Push Square, Pure Xbox, The Verge Gaming, Ars Technica Gaming, GamesIndustry.biz, Siliconera, Dualshockers, Wired Gaming, PCGamesN.

### 5.8 Elon Musk
Google News Elon, TechCrunch, The Verge, Ars Technica, Wired, Engadget, CNBC Tech, Reuters Tech, Bloomberg Tech, Electrek, Teslarati, InsideEVs, SpaceNews, NASASpaceflight, The Guardian Tech, Business Insider Tech, Forbes Innovation, Futurism, VentureBeat, ZDNET.

---

## 6. Backend Architecture

### 6.1 Netlify Scheduled Functions (Cron Jobs)

Articles are fetched and pre-scored by background cron jobs, not at request time.

**Fetch functions** (`netlify/functions/fetch-*.ts`):
- Run **hourly** (`@hourly`)
- Fetch all RSS feeds for a topic
- Parse and decode HTML entities
- Upsert into Supabase `articles` table (deduplicated by `link`)

**Score functions** (`netlify/functions/score-*.ts`):
- Run **every hour at minute 10** (`10 * * * *`)
- Fetch up to **300** unscored articles from the last 7 days
- Score in batches of 50 using `gpt-4.1-nano`
- Each article gets a relevance score (1-10), reason, and AI-generated EN/FR summaries for articles scoring ≥5
- Results stored back in Supabase

**Scoring criteria** (`src/lib/scoring-prompts.ts`):
Each topic has 5 scoring tiers:
- **9-10**: Major breaking news (e.g., new model launch, peace treaty, ATH)
- **7-8**: Significant development (e.g., notable partnership, large funding)
- **5-6**: Interesting content (e.g., product update, analysis with data)
- **3-4**: Low value (e.g., opinion without facts, tutorial)
- **1-2**: Off-topic or spam

### 6.2 Supabase Database

**Tables:**

| Table | Purpose |
|---|---|
| `articles` | All fetched articles with scores, AI summaries |
| `news_cache` | Cached API responses (TTL-based) |

**`articles` columns**: `id`, `topic`, `source`, `title`, `link`, `pub_date`, `content`, `snippet`, `snippet_ai_en`, `snippet_ai_fr`, `relevance_score`, `score_reason`, `scored_at`

**Cache TTL** (based on time window):

| Hours | Cache duration |
|---|---|
| ≤1h | 5 min |
| ≤6h | 15 min |
| ≤24h | 30 min |
| >24h | 60 min |

### 6.3 `GET /api/news`

Main data endpoint. Reads pre-scored articles from Supabase, analyses with AI, returns structured summary.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `hours` | float | 24 | Time window (0.25 to 168) |
| `lang` | `"en"` \| `"fr"` | `"en"` | Language for AI output |
| `topic` | Topic string | `"conflict"` | One of the 8 topic IDs |
| `count` | int | 10 | Target number of relevant articles (3–30) |

**Processing pipeline:**

1. **Cache check** — Look for a valid cached response in Supabase
2. **Read scored articles** — Fetch articles with `relevance_score >= minScore` from Supabase
3. **Read all articles** — Fetch all articles for the "All articles" tab
4. **AI analysis** — Send top-scored articles to `gpt-4.1-nano` for filtering and summarisation
5. **Cache write** — Store result in `news_cache` (non-blocking)
6. **Periodic cleanup** — 10% chance to clean expired cache entries

**Minimum score by time window:**

| Hours | Min score |
|---|---|
| ≤1h | 3 |
| ≤6h | 4 |
| ≤12h | 5 |
| ≤48h | 6 |
| >48h | 7 |

### 6.4 `POST /api/tts`

Text-to-Speech endpoint using **ElevenLabs** `eleven_flash_v2_5` model.

**Request body:**

```json
{
  "text": "Text to synthesize (max 5000 chars)",
  "lang": "en",
  "speed": 1.05,
  "voice": "sarah"
}
```

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

**Voice settings**: `stability: 0.7`, `similarity_boost: 0.85`, `speed: 0.7–1.2` (clamped)

**Output format**: `mp3_44100_128`

**Response:** Binary `audio/mpeg` (MP3 buffer)

---

## 7. AI Prompts

Each topic has **2 prompts** (EN + FR), defined as functions in `src/lib/prompts.ts` that accept `maxArticles: number`.

### 7.1 Prompt structure (common to all topics)

Every prompt instructs the AI to:

1. **FILTER** — Select only articles relevant to the topic. Explicit inclusion/exclusion criteria.
2. **SUMMARIZE EACH** — Write a 2-3 sentence factual summary per article. In FR mode, also translate the title.
3. **GLOBAL SUMMARY** — Write **up to 8 bullet points** (max target, not forced). Must include specific numbers, figures, names, dates. No vague statements.

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

### 7.3 Topic-specific focus

| Topic | Prompt focus |
|---|---|
| **Iran War** | Casualty counts, troop numbers, dollar amounts, escalation/de-escalation |
| **AI** | Model names, benchmarks, parameter counts, funding, release dates, coding tools |
| **AI Engineering** | Production systems, architecture decisions, tradeoffs, latency/cost, tooling, postmortems |
| **Robotics** | Robot specs (DOF, payload, speed), funding, deployment numbers, company names |
| **Crypto** | BTC price, percentage changes, market caps, hash rates, regulatory actions |
| **Bitcoin** | Exclusively BTC: price, ETFs, mining, Lightning, on-chain, institutional adoption |
| **Video Games** | Game titles, review scores, sales, player counts, prize pools, studio names |
| **Elon Musk** | Tesla deliveries, SpaceX launches, xAI model releases, X platform changes, Neuralink trials |

---

## 8. Frontend — UI Components

The entire UI is in `src/app/page.tsx` (client component, `"use client"`).

### 8.1 Layout

- **Background**: Pure black (`#000000`)
- **Max width**: 830px, centered
- **Font**: System UI stack
- **Theme**: Black & gold (`#c9a227`)

### 8.2 Navigation

The app has **3 pages** managed by `currentPage` state (`"home"` | `"stats"` | `"settings"`):

**Header** (shared across all pages):
- **Logo**: PNG image (`/logo-8news.png`), responsive height `clamp(32px, 5vw, 48px)`
- **Subtitle**: "AI that decodes the news" / "L'IA qui décrypte l'actualité"
- **Top-right controls** (left to right):
  - **Language toggle** (EN/FR) — Segmented control, gold highlight. Changing language reloads the page.
  - **Home icon** (house SVG) — Navigates to home page, gold when active
  - **Stats icon** (bar chart SVG) — Navigates to stats page, gold when active
  - **Settings icon** (gear SVG) — Navigates to settings page, gold when active

### 8.3 Home Page

#### Topic Selector (`TopicToggle`)

- **Layout**: CSS grid
  - Desktop (>640px): up to 9 columns
  - Mobile (≤640px): 4 columns → wraps to 2 rows
- **Style**: Individual rounded buttons with gold border, gold fill when active
- **Default**: No topic selected on launch
- **Behaviour**: Changing topic clears results and resets state

#### Period Selector

11 buttons in a flex-wrap row:

| Label | Hours value |
|---|---|
| 30 m | 0.5 |
| 1 h | 1 |
| 3 h | 3 |
| 6 h | 6 |
| 12 h | 12 |
| 24 h | 24 |
| 48 h | 48 |
| 3 d | 72 |
| 7 d | 168 |
| 14 d | 336 |
| 30 d | 720 |

Disabled until a topic is selected. Clicking triggers `fetchNews(hours)`.

#### Loading State

- **Progress bar** with simulated two-phase animation:
  - Phase 1 (0→90%): +3.5% every 200ms
  - Phase 2 (90→99%): Exponentially slowing increments
- **Dynamic loading message**:
  - `< 50%`: "Reading articles..." / "Lecture des articles..."
  - `≥ 50%`: "AI analysis..." / "Analyse IA..."
- Jumps to 100% when API responds

#### Summary Box (`SummaryBox`)

- **Heading**: "Summary" / "Résumé" with article count
- **Audio player**: Below heading (see section 8.5)
- **Bullet points**: Up to 8, each with gold "•" prefix, source reference links below
- **Period display**: "from → to" timestamps in locale format

#### Result Tabs

Two tabs below the summary:
- **"Relevant articles"** — AI-filtered articles with generated summaries
- **"All articles"** — All articles from Supabase, grouped by source

### 8.4 Stats Page

Placeholder page with "Coming soon." / "Bientôt disponible." message. Same header and navigation as other pages.

### 8.5 Settings Page (`SettingsPage`)

Four sections:

**1. Preferences**
- **Max relevant articles** slider: 3–30, default 10
- Info button with explanatory tooltip
- Persisted in cookie (`maxArticles`, 1 year)

**2. Voice**
- **Speed** slider: 0.7x–1.2x, default 1.05x, persisted in cookie (`ttsSpeed`)
- **Voice EN** (accordion): 6 voices (3F, 3M), default "Jade" (`sarah`), persisted in cookie (`ttsVoice`)
- **Voice FR** (accordion): 6 voices (3F, 3M), default "Tristan" (`george`), persisted in cookie (`ttsVoiceFr`)

**3. RSS Sources** (accordion)
- Tab bar to switch between topics
- Lists all feeds with name + domain, clickable
- Shows feed count

**4. AI Prompt** (accordion)
- Tab bar to switch between topics
- Displays the full system prompt for the selected topic/language/maxArticles
- Monospace `<pre>` block, scrollable

### 8.6 Audio Player (`AudioPlayer`)

Text-to-Speech player for the global summary, using ElevenLabs API.

**Controls:**
- **Play/Pause** toggle (SVG icons, 32px/30px)
- **Stop** button (resets to beginning)
- **-15s** / **+15s** skip buttons
- **Time display** (current / total)
- **Loading spinner** (gold, appears during first audio fetch, disappears after 2s of playback)
- **Seekable progress bar** (clickable)

**TTS text composition:**
1. **Intro** (`ttsIntro`): e.g., "Bitcoin News. Here is the news analyzed for the last 3 hours."
2. **Summary text** (from AI analysis)
3. **Outro** with ~2s pause: "... ... That's all folks!" (EN) / "... ... C'est tout... pour le moment..." (FR)

**Audio end behaviour:** 2-second delay before resetting to idle state to avoid abrupt cutoff.

**iOS compatibility:**
- `AudioContext` created and resumed on user gesture (`ensureAudioContext`)
- `playsinline` attribute set on audio element
- `preload="auto"` set
- Waits for both `canplaythrough` and `loadeddata` events (8s timeout)
- Voice selected based on current language (EN voices for English, FR voices for French)

### 8.7 Notification Beep

When results load successfully, a **double beep** plays via Web Audio API:
- Beep 1: 880 Hz, 120ms
- Silence: 60ms
- Beep 2: 1050 Hz, 120ms

**iOS fix**: `AudioContext` is created and unlocked during the user's tap (in `fetchNews`), then reused for the beep after the async fetch completes.

### 8.8 Auto-Update

The app checks `public/version.json` every **60 seconds**. If the version differs from `APP_VERSION`, the page automatically reloads to pick up the latest deployment.

### 8.9 Version Footer

Fixed bottom-right: `v1.48` (incremented with each GitHub push).

---

## 9. Internationalisation (i18n)

Defined in `src/lib/i18n.ts`.

- **Languages**: English (`en`), French (`fr`)
- **Toggle**: Segmented control in header — changing language sets a cookie and reloads the page
- **Language persistence**: Cookie (`lang`, 1 year, `SameSite=Lax`), read client-side via `useEffect` to avoid hydration mismatch
- **Scope**: All UI text, topic labels, error messages, loading messages
- **AI output**: When `lang=fr`, the AI prompt instructs GPT to translate article titles and write summaries in French
- **TTS voice**: Automatically selects from EN or FR voice pool based on current language
- **Date formatting**: `en-US` or `fr-FR` locale via `Intl.DateTimeFormat`

**Total translation keys**: 40+ strings covering all UI states.

---

## 10. Design System (`theme.ts`)

Centralised design tokens:

### Colors
| Token | Value | Usage |
|---|---|---|
| `bg` | `#000000` | Page background |
| `surface` | `#111` | Card/section background |
| `border` | `#2a2a2a` | Default borders |
| `borderLight` | `#333` | Lighter borders |
| `gold` | `#c9a227` | Primary accent (buttons, headings, highlights) |
| `goldLight` | `#e6c84e` | Hover state for gold |
| `text` | `#f5f5f5` | Primary text |
| `textSecondary` | `#ddd` | Summary text |
| `textMuted` | `#999` | Secondary UI text |
| `articleSnippet` | `#b0b0b0` | Article snippet text |
| `textDim` | `#666` | Tertiary/metadata text |
| `errorBg` | `rgba(200,50,50,0.1)` | Error background |
| `errorText` | `#ff8888` | Error text |

### Typography
- Font: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

### Shared styles
- `sectionHeading`: Gold, 13px, uppercase, letterspaced
- `card`: `#111` background, `#2a2a2a` border, 10px radius, 16px padding

---

## 11. State Management

All state is managed with React `useState` + `useRef` + `useCallback` hooks in the `Home` component. No external state library.

| State | Type | Default | Persistence |
|---|---|---|---|
| `lang` | `"en"` \| `"fr"` | `"en"` | Cookie (`lang`, read via useEffect) |
| `topic` | Topic \| null | null | None |
| `maxArticles` | number | 10 | Cookie (`maxArticles`, 1 year) |
| `ttsSpeed` | number | 1.05 | Cookie (`ttsSpeed`, 1 year) |
| `ttsVoice` | string | `"sarah"` | Cookie (`ttsVoice`, 1 year) |
| `ttsVoiceFr` | string | `"george"` | Cookie (`ttsVoiceFr`, 1 year) |
| `selected` | number \| null | null | None |
| `data` | SummaryResponse \| null | null | None |
| `loading` | boolean | false | None |
| `progress` | number | 0 | None |
| `error` | string \| null | null | None |
| `currentPage` | `"home"` \| `"stats"` \| `"settings"` | `"home"` | None |
| `resultTab` | `"relevant"` \| `"all"` | `"relevant"` | None |

---

## 12. TypeScript Interfaces

```typescript
type Topic = "conflict" | "ai" | "crypto" | "robotics" | "bitcoin" | "videogames" | "aiengineering" | "elon";

interface ScoreResult {
  index: number;
  score: number;
  reason: string;
  summary_en?: string;
  summary_fr?: string;
}

interface ParsedArticle {
  topic: string;
  source: string;
  title: string;
  link: string;
  pub_date: string;
  content: string;
  snippet: string;
}

interface ArticleSummary {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
}

interface SummaryBullet {
  text: string;
  refs: Array<{ title: string; link: string; source: string }>;
}

interface SummaryResponse {
  summary: string;
  bullets: SummaryBullet[];
  articles: ArticleSummary[];
  allArticles: ArticleSummary[];
  period: { from: string; to: string };
}

interface AIAnalysis {
  relevant: Array<{ index: number; snippet: string; title?: string }>;
  globalSummary: string | Array<{ text: string; refs: number[] }>;
}
```

---

## 13. Data Flow

```
          ┌──────────────────────────────────────────────────┐
          │  BACKGROUND (Netlify Scheduled Functions)        │
          │                                                  │
          │  @hourly: fetch-*.ts                            │
          │  - Fetch 20 RSS feeds per topic                 │
          │  - Parse, decode, deduplicate                   │
          │  - Upsert into Supabase `articles` table        │
          │                                                  │
          │  10 * * * *: score-*.ts                         │
          │  - Fetch ≤300 unscored articles (last 7 days)   │
          │  - Score with gpt-4.1-nano (batches of 50)      │
          │  - Store score + AI summaries in Supabase        │
          └──────────────────────────────────────────────────┘

User clicks period button
        │
        ▼
  unlockAudioContext()     ← iOS audio fix (on user tap)
        │
        ▼
  startProgress()         ← Simulated loading bar begins
        │
        ▼
  GET /api/news?hours=X&lang=Y&topic=Z&count=N
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: Check cache (Supabase news_cache)  │
  │  → If valid cached response, return it      │
  └─────────────────────┬───────────────────────┘
                        │ (cache miss)
                        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: Read from Supabase                 │
  │  - Scored articles (score >= minScore)      │
  │  - All articles (for "All" tab)             │
  │  - Use AI snippets based on language        │
  └─────────────────────┬───────────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: analyzeWithAI()                    │
  │  - Send top articles to gpt-4.1-nano       │
  │  - Parse relevant[] and globalSummary[]     │
  │  - Map refs to actual article links         │
  └─────────────────────┬───────────────────────┘
                        │
                        ▼
  JSON response → Client (+ async cache write)
        │
        ▼
  stopProgress()          ← Bar jumps to 100%
  playNotificationBeep()  ← Double beep
  setData(response)       ← Renders Summary + Articles
```

---

## 14. Deployment

### Netlify

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Plugin**: `@netlify/plugin-nextjs` (handles SSR/serverless functions)
- **Scheduled functions**: 16 cron jobs (8 fetch + 8 score)
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
| No scored articles in time window | Topic-specific "no articles" message |
| Missing/invalid OpenAI key | Returns raw articles without AI, with explanatory message |
| OpenAI API error | "Error calling OpenAI" message, empty bullets |
| ElevenLabs API error | 502 with error details |
| Network error (client) | "Unable to connect to the server" |
| Supabase errors | Graceful fallback (empty arrays) |
| iOS audio autoplay blocked | AudioContext resume on user gesture |
| Audio load timeout | 8-second timeout with fallback |

---

## 16. Adding a New Topic

To add a new topic, update these files:

1. **`src/lib/types.ts`** — Add topic ID to `Topic` union type and `VALID_TOPICS` array
2. **`src/lib/rss-feeds.ts`** — Add feed constant with ~20 URLs, add to `FEEDS_BY_TOPIC`
3. **`src/lib/i18n.ts`** — Add keys: `topicXxx`, `xxxTitle`, `noArticlesXxx`
4. **`src/lib/prompts.ts`** — Add `xxxEn(max)` and `xxxFr(max)` functions, add to `PROMPTS` map
5. **`src/lib/scoring-prompts.ts`** — Add scoring criteria to `SCORING_CRITERIA`
6. **`src/app/page.tsx`** — Add to `TOPICS`, `TOPIC_TITLE_KEY`, `NO_ARTICLES_KEY`
7. **`netlify/functions/fetch-xxx.ts`** — New fetch cron function
8. **`netlify/functions/score-xxx.ts`** — New score cron function

---

## 17. Known Limitations

- **No authentication** — The app is public, no user accounts
- **Serverless timeout** — Netlify functions have execution time limits; 5s per-feed timeout helps stay within bounds
- **RSS availability** — Some feeds may go offline; periodic manual verification needed
- **AI cost** — Each request consumes OpenAI tokens (gpt-4.1-nano for analysis and scoring), each TTS request consumes ElevenLabs credits
- **No SSR** — The page is a client-only component (`"use client"`)
- **Cookie-only persistence** — User preferences persisted in cookies; topic and period reset on reload
- **Stats page** — Placeholder only, not yet implemented
