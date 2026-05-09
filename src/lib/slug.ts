/**
 * Video-page slug helpers.
 *
 * Two responsibilities, two functions:
 *  - `slugifyVideoTitle` is pure and synchronous. It distills 4-5
 *    keyword-rich tokens out of a YouTube video title, stripping
 *    diacritics, punctuation and stop words, then joins them with `-`.
 *  - `uniquifyVideoSlug` checks the database for collisions on
 *    `(topic_id, published_date, lang)` and appends `-2`, `-3`… until
 *    it finds a slot. Idempotent: when called with the same `videoId`
 *    that already owns the slug, it returns the existing slug instead
 *    of creating a new variant.
 *
 * Used by:
 *  - `POST /api/youtube-channels/transcribe` (transcribe-time write)
 *  - `scripts/backfill-video-slugs.mjs` (one-shot backfill)
 */

/** Stop words filtered out before keyword selection. */
const STOP_WORDS_EN = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "has", "have", "how", "i", "in", "is", "it", "its", "just", "may",
  "of", "off", "on", "or", "our", "out", "over", "own", "so", "than",
  "that", "the", "their", "there", "these", "they", "this", "to", "too",
  "up", "via", "was", "we", "were", "what", "when", "where", "which",
  "who", "why", "will", "with", "you", "your", "vs", "ep", "episode",
  "podcast", "interview", "feat", "ft", "and",
]);

const STOP_WORDS_FR = new Set([
  "à", "ainsi", "alors", "au", "aux", "avec", "ce", "ces", "cet", "cette",
  "ceux", "comme", "d", "dans", "de", "des", "du", "elle", "elles", "en",
  "encore", "est", "et", "etre", "faire", "il", "ils", "j", "je", "l",
  "la", "le", "les", "leur", "ma", "mais", "mes", "moi", "mon", "n",
  "ne", "nos", "notre", "nous", "ou", "où", "par", "pas", "plus", "pour",
  "puis", "qu", "que", "qui", "quoi", "s", "sa", "sans", "se", "ses",
  "si", "son", "sous", "sur", "ta", "te", "tes", "ton", "toi", "tous",
  "tout", "tres", "tu", "un", "une", "vos", "votre", "vous", "y", "via",
  "ep", "episode", "podcast", "interview", "feat", "ft", "et",
]);

/**
 * Turn a video title into a 4-5 keyword slug. Deterministic, no I/O.
 *
 * Algorithm:
 *  1. Lowercase + strip diacritics (NFKD + drop combining marks) so
 *     "résumé" → "resume" and the slug stays ASCII-safe.
 *  2. Replace anything non-alphanumeric with a space, then split on
 *     whitespace.
 *  3. Drop stop words for the matching language and any token shorter
 *     than 3 chars (which are usually filler — "GPT" survives because
 *     the algorithm runs after the digit/letter merge of step 2).
 *  4. Keep the first 5 surviving tokens (preserving original order so
 *     the slug reads like a sentence: "anthropic-claude-4-released").
 *  5. Join with `-`, hard-cap at 60 chars to play nice with sitemaps.
 */
export function slugifyVideoTitle(title: string, lang: "en" | "fr"): string {
  if (!title) return "";

  // NFKD splits "é" into "e" + combining acute, then we drop the marks.
  // 0x0300-0x036F is the "Combining Diacritical Marks" range.
  const normalized = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase();

  const stopWords = lang === "fr" ? STOP_WORDS_FR : STOP_WORDS_EN;

  // Replace any non-alphanumeric with space, split, filter.
  const tokens = normalized
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((tok) => tok.length >= 3 && !stopWords.has(tok));

  if (tokens.length === 0) return "";

  // Cap at 5 tokens, then trim the joined result to 60 chars.
  const slug = tokens.slice(0, 5).join("-");
  return slug.length > 60 ? slug.slice(0, 60).replace(/-[^-]*$/, "") : slug;
}

/**
 * Resolve a unique slug for a (topic, published_date, lang) bucket.
 *
 * Returns:
 *  - `baseSlug` if no other row in the bucket has any slug starting with it
 *  - the existing slug owned by the same `videoId` (idempotent — re-running
 *    the backfill on an already-slug'd video doesn't allocate a new variant)
 *  - `baseSlug-2`, `-3`, … walking the first free integer otherwise
 *
 * The LIKE pattern keeps the query cheap: only rows in the same bucket
 * whose slug starts with the same base are pulled into JS, and there are
 * never many of them in practice (a topic publishes a handful of videos
 * per day).
 *
 * `supabase` is typed loosely (`unknown` cast internally) so this helper
 * works equally well with the SDK's strongly-typed `SupabaseClient` from
 * the API route, the looser shape used by `scripts/backfill-video-slugs.mjs`,
 * or any future test mock — without dragging the SDK's deep generics
 * (which were tripping `Type instantiation is excessively deep` errors).
 */
export async function uniquifyVideoSlug(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  baseSlug: string,
  topicId: string,
  publishedDate: string,
  lang: "en" | "fr",
  videoId: string,
): Promise<string> {
  if (!baseSlug) return baseSlug;

  const { data, error } = (await supabase
    .from("video_transcriptions")
    .select("slug_keywords, video_id")
    .eq("topic_id", topicId)
    .eq("published_date", publishedDate)
    .eq("lang", lang)
    .like("slug_keywords", `${baseSlug}%`)) as {
      data: Array<{ slug_keywords: string; video_id: string }> | null;
      error: unknown;
    };

  if (error || !data || data.length === 0) return baseSlug;

  // If THIS video already owns a slug starting with baseSlug, re-use it.
  // This is what makes the backfill idempotent.
  const ownByThisVideo = data.find((r) => r.video_id === videoId);
  if (ownByThisVideo) return ownByThisVideo.slug_keywords;

  const taken = new Set(data.map((r) => r.slug_keywords));
  if (!taken.has(baseSlug)) return baseSlug;

  // Walk -2, -3, -4 … until we find a free slot. In practice we exit on
  // the first or second iteration; the `100` guard is just a sanity net
  // against a runaway loop.
  for (let i = 2; i < 100; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Should never happen — fall back to a timestamp suffix.
  return `${baseSlug}-${Date.now()}`;
}
