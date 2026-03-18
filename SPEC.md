# 8news.ai — Technical Specification

**Version**: v1.19
**Last updated**: March 2026

---

## 1. Overview

**8news.ai** is an AI-powered news aggregation and summarisation platform. It fetches articles from curated RSS feeds across multiple topics, sends them to OpenAI's GPT-4o-mini for relevance filtering and structured summarisation, and presents the results in a dark-themed, bilingual (EN/FR) web interface with text-to-speech playback.

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
| AI (text analysis) | OpenAI API — `gpt-4o-mini` | via `openai` ^6.25.0 |
| AI (text-to-speech) | OpenAI API — `tts-1` model | via `openai` ^6.25.0 |
| Hosting | Netlify | via `@netlify/plugin-nextjs` ^5.15.8 |
| Domain | 8news.ai (redirect from 8news.netlify.app) | |

---

## 3. Project Structure

```
newsread/
├── public/
│   ├── logo-8news.png          # App logo (PNG, "8" gold / "news" light grey)
│   ├── logo-8news.svg          # App logo (SVG fallback)
│   ├── favicon.svg             # Browser favicon — gold "8" on black, 512×512
│   └── apple-touch-icon.svg    # iOS home screen icon — gold "8" on black, 180×180
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, metadata, favicons
│   │   ├── globals.css         # Global CSS reset + base styles
│   │   ├── page.tsx            # Main client component (entire UI)
│   │   └── api/
│   │       ├── news/route.ts   # GET /api/news — RSS fetch + AI analysis
│   │       └── tts/route.ts    # POST /api/tts — Text-to-Speech
│   └── lib/
│       ├── types.ts            # TypeScript interfaces
│       ├── theme.ts            # Design tokens (colors, fonts, shared styles)
│       ├── i18n.ts             # EN/FR translation strings
│       ├── rss-feeds.ts        # RSS feed URLs per topic (20 feeds each)
│       └── prompts.ts          # AI system prompts per topic × language
├── .env                        # OPENAI_API_KEY (not committed)
├── .env.example                # Placeholder for API key
├── netlify.toml                # Netlify build + redirect config
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 4. Topics

The application supports **7 topics**, each with 20 curated RSS feeds and dedicated EN/FR AI prompts:

| # | Topic ID | Label (EN) | Label (FR) | Focus |
|---|---|---|---|---|
| 1 | `conflict` | Iran War | Iran War | USA/Israel vs Iran conflict, Hezbollah, Houthis, militias |
| 2 | `ai` | AI | IA | AI models, breakthroughs, products, regulation, industry news |
| 3 | `aiengineering` | AI Engineering | AI Engineering | Production AI systems, coding agents, LLM engineering, infra, evals, MLOps |
| 4 | `robotics` | Robotics | Robotique | Humanoid robots, Unitree, Tesla Optimus, Boston Dynamics, Figure AI |
| 5 | `crypto` | Crypto | Crypto | Cryptocurrency, blockchain, DeFi, regulation, market movements |
| 6 | `bitcoin` | Bitcoin | Bitcoin | BTC-only: price, ETFs, mining, Lightning, on-chain, institutional adoption |
| 7 | `videogames` | Video Games | Jeux Vidéo | Game releases, reviews, studios, consoles, esports, industry business |

### Topic order in UI
`Iran War` → `AI` → `AI Engineering` → `Robotics` → `Crypto` → `Bitcoin` → `Video Games`

---

## 5. RSS Feeds

Each topic has exactly **20 RSS feed URLs** defined in `src/lib/rss-feeds.ts`.

### 5.1 Iran War (conflict)
BBC News, Al Jazeera, The Guardian, France 24, DW, NYT World, NPR News, ABC News, Times of Israel, Jerusalem Post, Middle East Eye, War on the Rocks, The War Zone, Google News Iran, Sky News, CBS News, Euronews, The Hill, Politico Defense, CNBC World.

### 5.2 AI
TechCrunch AI, The Verge AI, Wired AI, Ars Technica, VentureBeat AI, MIT Tech Review, The Register AI, AI News, Google AI Blog, OpenAI Blog, Hacker News AI, Hugging Face Blog, Towards Data Science, DeepMind Blog, Simon Willison, Engadget, Marktechpost, The Decoder, ZDNET AI, Last Week in AI.

### 5.3 AI Engineering
Latent Space, Simon Willison, Eugene Yan, Chip Huyen, Hamel Husain, Lilian Weng, LangChain Blog, LlamaIndex Blog, Anthropic Blog, Hugging Face Blog, GitHub Blog, Databricks Blog, W&B Fully Connected, The Pragmatic Engineer, InfoQ AI/ML, Software Engineering Daily, OpenAI Blog, Google AI Blog, Vercel Blog, The Batch (DeepLearning.AI).

### 5.4 Robotics
The Robot Report, TechCrunch Robotics, The Verge AI, Ars Technica, Wired AI, VentureBeat AI, MIT Tech Review, Hacker News Robotics, Robohub, Singularity Hub, Google DeepMind, OpenAI Blog, Futurism, Slash Gear, IEEE Robotics, Hackaday, Science Daily Robots, Engadget, ZDNET Robotics, SCMP Tech.

### 5.5 Crypto
CoinDesk, Cointelegraph, The Block, Decrypt, NewsBTC, U.Today, Bitcoinist, The Daily Hodl, CryptoPotato, Bitcoin Magazine, Bitcoin News, Blockworks, Glassnode Insights, BitcoinDev Blog, Stacker News, Crypto Briefing, AMBCrypto, Blockonomi, Coingape, Crypto News.

### 5.6 Bitcoin
Bitcoin Magazine, CoinDesk, Cointelegraph Bitcoin, NewsBTC, Bitcoinist, Bitcoin.com News, Decrypt, The Bitcoin Layer, CryptoNews Bitcoin, Blockworks, The Block, AMBCrypto, WatcherGuru, CryptoPotato, Coingape, Bitcoin Insider, Protos, Unchained, Coinpedia, Crypto Briefing.

### 5.7 Video Games
IGN, Kotaku, GameSpot, PC Gamer, Eurogamer, Polygon, Rock Paper Shotgun, VG247, GamesRadar+, Destructoid, Nintendo Life, Push Square, Pure Xbox, The Verge Gaming, Ars Technica Gaming, GamesIndustry.biz, Siliconera, Dualshockers, Wired Gaming, PCGamesN.

---

## 6. Backend — API Routes

### 6.1 `GET /api/news`

Main data endpoint. Fetches RSS, filters with AI, returns structured summary.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `hours` | float | 24 | Time window (0.25 to 168). Supports fractional values (0.25 = 15 min). |
| `lang` | `"en"` \| `"fr"` | `"en"` | Language for AI output and translations. |
| `topic` | Topic string | `"conflict"` | One of the 7 topic IDs. |
| `count` | int | 10 | Target number of relevant articles (3–30, clamped). |

**Processing pipeline:**

1. **Fetch all feeds** — `Promise.allSettled` on all 20 RSS URLs for the topic, with 5s timeout per feed. HTML entities decoded during parse.
2. **Filter by date** — Only articles published after `now - hours` are kept.
3. **Sort** — Newest first by `pubDate`.
4. **Truncate** — Max 200 articles sent to AI (`MAX_ARTICLES`). Each snippet capped at 600 chars (`SNIPPET_MAX`).
5. **AI analysis** — If `OPENAI_API_KEY` is valid, articles are formatted as a numbered list and sent to `gpt-4o-mini` with the topic-specific system prompt. Response format is `json_object`.
6. **Parse AI response** — Extracts `relevant` articles (with AI-generated summaries) and `globalSummary` (structured bullet points with article refs).
7. **Return** — JSON response matching `SummaryResponse` interface.

**Response shape (`SummaryResponse`):**

```json
{
  "summary": "Plain text summary (bullet points joined by \\n)",
  "bullets": [
    {
      "text": "Bullet point text without the • prefix",
      "refs": [
        { "title": "Article title", "link": "https://...", "source": "BBC News" }
      ]
    }
  ],
  "articles": [
    {
      "title": "Article title (translated if FR)",
      "link": "https://...",
      "source": "BBC News",
      "pubDate": "2026-03-03T12:00:00Z",
      "snippet": "AI-generated 2-3 sentence summary"
    }
  ],
  "allArticles": [
    { "title": "...", "link": "...", "source": "...", "pubDate": "...", "snippet": "..." }
  ],
  "period": {
    "from": "2026-03-03T00:00:00.000Z",
    "to": "2026-03-03T12:00:00.000Z"
  }
}
```

**Key constants:**

| Constant | Value | Description |
|---|---|---|
| `FETCH_TIMEOUT_MS` | 5000 | Per-feed HTTP timeout |
| `MAX_ARTICLES` | 200 | Max articles sent to AI |
| `SNIPPET_MAX` | 600 | Max snippet chars stored |
| `PREVIEW_LIMIT` | 10 | Articles shown when no API key |

**Fallback behaviours:**
- No API key → returns raw articles without AI filtering, with explanatory message.
- AI call fails → returns error message as summary, empty bullets.
- No articles found → returns informative message with feed success/failure counts.

### 6.2 `POST /api/tts`

Text-to-Speech endpoint using OpenAI `tts-1` model.

**Request body:**

```json
{
  "text": "Text to synthesize (max 4096 chars)",
  "voice": "nova"  // optional, defaults to "nova"
}
```

**Supported voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`.

**Response:** Binary `audio/mpeg` (MP3 buffer).

**API key validation:** Same as news endpoint — rejects empty keys and the `sk-your-key-here` placeholder.

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

- `index` = 0-based position in the article list sent to the AI.
- `refs` = indices of articles that support each bullet point (used for source links in UI).

### 7.3 Topic-specific focus

| Topic | Prompt focus |
|---|---|
| **Iran War** | Casualty counts, troop numbers, dollar amounts, escalation/de-escalation |
| **AI** | Model names, benchmarks, parameter counts, funding, release dates, coding tools |
| **AI Engineering** | Production systems, architecture decisions, tradeoffs, latency/cost, tooling, postmortems. Excludes consumer news, hype, tutorials |
| **Robotics** | Robot specs (DOF, payload, speed), funding, deployment numbers, company names |
| **Crypto** | BTC price, percentage changes, market caps, hash rates, regulatory actions |
| **Bitcoin** | Exclusively BTC: price, ETFs, mining, Lightning, on-chain, institutional adoption |
| **Video Games** | Game titles, review scores, sales, player counts, prize pools, studio names |

---

## 8. Frontend — UI Components

The entire UI is in `src/app/page.tsx` (client component, `"use client"`).

### 8.1 Layout

- **Background**: Pure black (`#000000`)
- **Max width**: 830px, centered
- **Font**: System UI stack
- **Theme**: Black & gold (`#c9a227`)

### 8.2 Header

- **Logo**: PNG image (`/logo-8news.png`) — "8" in gold, "news" in light grey, responsive height `clamp(32px, 5vw, 48px)`
- **Subtitle**: "AI that decodes the news" / "L'IA qui décrypte l'actualité"
- **Top-right controls**:
  - **Language toggle** (EN/FR) — Segmented control, gold highlight
  - **Settings button** — Gear icon (SVG), opens settings modal
  - **Reset button** — Refresh icon (SVG), clears all state

### 8.3 Topic Selector (`TopicToggle`)

- **Layout**: CSS grid
  - Desktop (>640px): up to 9 columns
  - Mobile (≤640px): 4 columns → wraps to 2 rows
- **Style**: Individual rounded buttons with gold border, gold fill when active
- **Behaviour**: Changing topic clears results and resets state

### 8.4 Period Selector

10 buttons in a flex-wrap row:

| Label | Hours value |
|---|---|
| 15 m | 0.25 |
| 30 m | 0.5 |
| 1 h | 1 |
| 3 h | 3 |
| 6 h | 6 |
| 12 h | 12 |
| 24 h | 24 |
| 48 h | 48 |
| 3 d | 72 |
| 7 d | 168 |

Clicking a period button triggers `fetchNews(hours)`.

### 8.5 Loading State

- **Progress bar** with simulated two-phase animation:
  - Phase 1 (0→70%): +3.5% every 200ms (~4s)
  - Phase 2 (70→95%): Exponentially slowing increments
- **Percentage display** below the bar
- Jumps to 100% when API responds
- No spinner (removed by design)

### 8.6 Summary Box (`SummaryBox`)

- **Heading**: "Summary" / "Résumé"
- **Audio player**: Top-right corner (see section 8.8)
- **Bullet points**: Up to 8, each with:
  - Gold "•" prefix
  - Text content
  - Source references below each bullet — clickable links with external-link icon (`RefIcon`), muted grey, gold on hover
- **Period display**: "from → to" timestamps in locale format

### 8.7 Result Tabs

Two tabs below the summary:
- **"Relevant articles"** — AI-filtered articles with generated summaries
- **"All articles"** — Raw articles from all RSS feeds, grouped by source, no AI filtering

### 8.8 Audio Player (`AudioPlayer`)

Text-to-Speech player for the global summary.

**Controls:**
- **-15s** / **+15s** skip buttons
- **Play/Pause** toggle (SVG icons)
- **Stop** button (resets to beginning)
- **Seekable progress bar** (clickable)
- **Time display** (current / total) — fixed 72px width to prevent layout shift

**TTS flow:**
1. On Play, calls `POST /api/tts` with summary text prepended by topic/period intro
2. Receives MP3 blob, creates `Audio` object
3. Stores blob URL — reuses on Stop→Play (no re-fetch)
4. On new summary data, cleans up and resets

**TTS intro** (`ttsIntro` function): Generates a spoken introduction, e.g.:
- EN: "Bitcoin News. Here is the news analyzed for the last 3 hours."
- FR: "Actualités Bitcoin. Voici l'actualité analysée pour les 3 dernières heures."

### 8.9 Notification Beep

When results load successfully, a **double beep** plays via Web Audio API:
- Beep 1: 880 Hz, 120ms
- Silence: 60ms
- Beep 2: 1050 Hz, 120ms

**iOS fix**: `AudioContext` is created and unlocked during the user's tap (in `fetchNews`), then reused for the beep after the async fetch completes. This avoids iOS blocking audio created outside user gestures.

### 8.10 Settings Modal (`SettingsModal`)

Three sections:

**1. Preferences** (always visible)
- **Max relevant articles** slider: 3–30, default 10 on first launch
- Persisted in cookie (`maxArticles`, 1 year, `SameSite=Lax`)

**2. RSS Sources** (accordion, collapsed by default)
- Tab bar to switch between topics (defaults to currently selected topic)
- Lists all 20 feeds for the active tab
- Each feed: name + domain, clickable (opens RSS URL in new tab)
- Shows feed count

**3. AI Prompt** (accordion, collapsed by default)
- Same tab bar as RSS Sources
- Displays the full system prompt sent to OpenAI for the selected topic/language/maxArticles
- Monospace `<pre>` block, scrollable

### 8.11 Version Footer

Fixed bottom-right: `v1.19` (incremented with each GitHub push).

### 8.12 Article Card (`ArticleCard`)

Each relevant article card shows:
- **Title** (translated to French in FR mode)
- **Snippet** (AI-generated 2-3 sentence summary), lighter grey (`#b0b0b0`)
- **Source + date** in gold
- Entire card is a link, opens original article in new tab

---

## 9. Internationalisation (i18n)

Defined in `src/lib/i18n.ts`.

- **Languages**: English (`en`), French (`fr`)
- **Toggle**: Segmented control in header
- **Scope**: All UI text, topic labels, error messages
- **AI output**: When `lang=fr`, the AI prompt instructs GPT to translate article titles and write summaries in French
- **Date formatting**: `en-US` or `fr-FR` locale via `Intl.DateTimeFormat`

**Total translation keys**: 30+ strings covering all UI states.

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
- All font sizes increased by ~10% from default for readability

### Shared styles
- `sectionHeading`: Gold, 13px, uppercase, letterspaced
- `card`: `#111` background, `#2a2a2a` border, 10px radius, 16px padding

---

## 11. Data Flow

```
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
  │  Server: fetchAllFeeds()                    │
  │  - Fetch 20 RSS feeds in parallel (5s max)  │
  │  - Filter by pubDate >= since               │
  │  - Decode HTML entities                     │
  │  - Sort by date (newest first)              │
  │  - Cap at 200 articles                      │
  └─────────────────────┬───────────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────────┐
  │  Server: analyzeWithAI()                    │
  │  - Format articles as numbered list         │
  │  - Send to gpt-4o-mini with system prompt   │
  │  - Request JSON response format             │
  │  - Parse relevant[] and globalSummary[]     │
  │  - Map refs to actual article links         │
  └─────────────────────┬───────────────────────┘
                        │
                        ▼
  JSON response → Client
        │
        ▼
  stopProgress()          ← Bar jumps to 100%
  playNotificationBeep()  ← Double beep
  setData(response)       ← Renders Summary + Articles
```

---

## 12. Deployment

### Netlify

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Plugin**: `@netlify/plugin-nextjs` (handles SSR/serverless functions)
- **Domain**: `8news.ai`
- **Redirect**: `8news.netlify.app/*` → `8news.ai/:splat` (301)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o-mini and TTS |

### Favicons

- **Browser**: `/favicon.svg` — SVG, gold "8" on black, 512×512 viewBox
- **iOS**: `/apple-touch-icon.svg` — SVG, gold "8" on black, 180×180 viewBox

---

## 13. State Management

All state is managed with React `useState` + `useRef` hooks in the `Home` component. No external state library.

| State | Type | Default | Persistence |
|---|---|---|---|
| `lang` | `"en"` \| `"fr"` | `"en"` | None (resets on reload) |
| `topic` | Topic | `"conflict"` | None |
| `maxArticles` | number | 10 | Cookie (`maxArticles`, 1 year) |
| `selected` | number \| null | null | None |
| `data` | SummaryResponse \| null | null | None |
| `loading` | boolean | false | None |
| `progress` | number | 0 | None |
| `error` | string \| null | null | None |
| `showSettings` | boolean | false | None |
| `resultTab` | `"relevant"` \| `"all"` | `"relevant"` | None |

---

## 14. TypeScript Interfaces

```typescript
type Topic = "conflict" | "ai" | "crypto" | "robotics" | "bitcoin" | "videogames" | "aiengineering";

interface RawArticle {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  source: string;
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

## 15. Error Handling

| Scenario | Behaviour |
|---|---|
| RSS feed timeout (>5s) | Feed silently skipped, others continue |
| All feeds fail | "No articles found (0 feeds OK, 20 failed)" |
| No articles in time window | "No articles found for the selected time period" |
| Missing/invalid API key | Returns raw articles without AI, with explanatory message |
| OpenAI API error | "Error calling OpenAI. Please verify your OPENAI_API_KEY." |
| Network error (client) | "Unable to connect to the server" |
| AI returns array instead of string for globalSummary | Handled: joins if string array, maps if structured array |
| HTML entities in RSS content | Decoded via custom `decodeHtmlEntities()` (numeric, hex, named) |

---

## 16. Performance Optimisations

- **Parallel RSS fetching**: All 20 feeds fetched with `Promise.allSettled` (resilient to individual failures)
- **5s timeout** per feed (reduced from original 8s for Netlify serverless compatibility)
- **Max 200 articles** sent to AI (increased from original 80)
- **500 chars** per article snippet sent to LLM (increased from original 200)
- **Simulated progress bar** with two-phase animation for perceived performance
- **Audio reuse**: TTS MP3 cached as blob URL, reused on Stop→Play without re-fetching
- **Cookie-based preferences**: `maxArticles` persisted to avoid re-configuration

---

## 17. Adding a New Topic

To add a new topic, update these 6 files:

1. **`src/lib/types.ts`** — Add topic ID to `Topic` union type
2. **`src/lib/rss-feeds.ts`** — Add `const NEW_FEEDS: readonly Feed[]` with 20 URLs, add to `FEEDS_BY_TOPIC`
3. **`src/lib/i18n.ts`** — Add keys: `topicXxx`, `xxxTitle`, `noArticlesXxx`
4. **`src/lib/prompts.ts`** — Add `xxxEn(max)` and `xxxFr(max)` functions, add to `PROMPTS` map
5. **`src/app/page.tsx`** — Add to `TOPICS`, `TABS`, `TOPIC_TITLE_KEY`, `noArticlesKey` chain, update all type unions
6. **`src/app/api/news/route.ts`** — Add to `topic` parsing ternary chain

---

## 18. Known Limitations

- **No authentication** — The app is public, no user accounts
- **No caching** — Each request fetches RSS and calls OpenAI fresh
- **Serverless timeout** — Netlify functions have execution time limits; 5s per-feed timeout helps stay within bounds
- **RSS availability** — Some feeds may go offline; periodic manual verification needed
- **AI cost** — Each request consumes OpenAI tokens (gpt-4o-mini for analysis, tts-1 for audio)
- **No SSR** — The page is a client-only component (`"use client"`)
- **Cookie-only persistence** — Only `maxArticles` is persisted; topic, language, and period reset on reload
