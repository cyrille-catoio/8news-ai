/**
 * Central registry of the OpenAI model IDs used across 8news, one entry
 * per task. These strings previously lived inline in ~14 files under four
 * different naming conventions (`AI_MODEL`, `DEFAULT_AI_MODEL`,
 * `SCORE_OPENAI_MODEL`, bare literals), so migrating a model meant a
 * grep-and-pray sweep. Now it is a single edit here.
 *
 * The three tasks that already exposed an env override keep it, with the
 * exact same coalescing they used before (so behaviour is unchanged):
 *   - `SCORE_OPENAI_MODEL`          — article relevance scoring
 *   - `USER_CHAT_MODERATION_MODEL`  — user-chat moderation
 *   - `PODCAST_CHAT_MODEL`          — Daily Podcast chat
 * Env vars are read once at module load (fresh per Lambda cold start).
 * Every other task is a plain constant — no new env knobs are introduced.
 */
export const OPENAI_MODELS = {
  /** Article relevance scoring — `score-topic-dynamic`. */
  articleScore: process.env.SCORE_OPENAI_MODEL ?? "gpt-4.1-nano",
  /** Video-recap quality scoring — `score-video-summary-batch` (default). */
  videoSummaryScore: "gpt-4.1-mini",
  /** User-chat moderation — `user-chat-moderation`. */
  moderation: process.env.USER_CHAT_MODERATION_MODEL?.trim() || "gpt-4.1-nano",
  /** Generic article analysis / summarisation — `ai-analyze` (default). */
  analyze: "gpt-4.1-mini",
  /** Per-topic daily SEO summary — `generate-daily-summary`. */
  dailySummary: "gpt-4.1-mini",
  /** Video transcription summaries — `transcribe-video` (default). */
  transcribe: "gpt-4.1-mini",
  /** Per-topic video roundup — `generate-video-roundup`. */
  videoRoundup: "gpt-5.3-chat-latest",
  /** Daily Top-50 snapshot ("podcast du jour") — `generate-top-summary`. */
  topSummary: "gpt-5.5",
  /** Daily Podcast chat — `/api/podcast-chat`. */
  podcastChat: process.env.PODCAST_CHAT_MODEL?.trim() || "gpt-5.5",
  /** Live on-demand article analysis — `/api/news`. */
  news: "gpt-4.1-nano",
  /** Topic label generation — `/api/topics/generate-labels`. */
  topicLabels: "gpt-4.1-mini",
  /** Topic scoring-rubric generation — `/api/topics/generate-scoring`. */
  topicScoring: "gpt-4.1-mini",
  /** Single-feed relevance score — `/api/topics/[id]/feeds/[feedId]/score`. */
  feedScore: "gpt-4.1-mini",
  /** Feed discovery — `/api/topics/[id]/discover-feeds`. */
  discoverFeeds: "gpt-4.1-mini",
} as const;
