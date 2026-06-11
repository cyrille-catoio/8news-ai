import { getServerClient } from "./client";

/**
 * Topics + feeds + categories CRUD. Used by:
 *   - The /app/topics admin page (TopicsPage component) for full RW.
 *   - The cron functions (`cron-fetch-feeds`, `cron-scoring`,
 *     `cron-daily-summary-background`, `cron-video-roundup-background`)
 *     for read-only enumeration of `is_active` topics.
 *   - The SSR pages (`/{topic}`, `/{topic}/r/...`, `/{topic}/v/...`)
 *     for label resolution and existence checks.
 *
 * Active vs displayed: `is_active=false` means "still in the DB but
 * temporarily paused" (no fetch, no scoring, no UI). `is_displayed=false`
 * means "active but hidden from the main UI" (e.g. a niche topic kept
 * around for a specific user but not shown to the general public).
 */

export interface TopicRow {
  id: string;
  label_en: string;
  label_fr: string;
  scoring_domain: string;
  scoring_tier1: string;
  scoring_tier2: string;
  scoring_tier3: string;
  scoring_tier4: string;
  scoring_tier5: string;
  prompt_en: string;
  prompt_fr: string;
  is_active: boolean;
  is_displayed: boolean;
  sort_order: number;
  category_id: number | null;
  last_fetched_at: string | null;
  last_scored_at: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: number;
  slug: string;
  label_en: string;
  label_fr: string;
  sort_order: number;
}

export interface FeedRow {
  id: number;
  topic_id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
}

export async function getCategories(): Promise<CategoryRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("categories")
      .select("id, slug, label_en, label_fr, sort_order")
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return data as CategoryRow[];
  } catch (err) {
    console.warn("[getCategories]", err);
    return [];
  }
}

export async function createCategory(
  data: { slug: string; label_en: string; label_fr: string; sort_order: number },
): Promise<CategoryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("categories")
      .insert(data)
      .select()
      .single();
    if (error || !row) {
      if (error) console.error("[createCategory] insert failed:", error.message);
      return null;
    }
    return row as CategoryRow;
  } catch (err) {
    console.error("[createCategory]", err);
    return null;
  }
}

export async function updateCategory(
  id: number,
  data: Partial<Omit<CategoryRow, "id">>,
): Promise<CategoryRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("categories")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error || !row) {
      if (error) console.error("[updateCategory] update failed:", error.message);
      return null;
    }
    return row as CategoryRow;
  } catch (err) {
    console.error("[updateCategory]", err);
    return null;
  }
}

export async function deleteCategory(id: number): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      console.error("[deleteCategory] delete failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[deleteCategory]", err);
    return false;
  }
}

export async function getActiveTopics(includeInactive = false): Promise<
  (TopicRow & { feed_count: number; category_label_en?: string; category_label_fr?: string })[]
> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;

    let query = supabase
      .from("topics")
      .select("*, categories(label_en, label_fr)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true).eq("is_displayed", true);
    }

    const { data: topics, error } = await query;

    if (error || !topics) return [];

    const { data: counts } = await supabase
      .from("feeds")
      .select("topic_id")
      .eq("is_active", true);

    const countMap = new Map<string, number>();
    if (counts) {
      for (const row of counts) {
        countMap.set(row.topic_id, (countMap.get(row.topic_id) ?? 0) + 1);
      }
    }

    type TopicWithCat = TopicRow & { categories: { label_en: string; label_fr: string } | null };
    return (topics as TopicWithCat[]).map(({ categories: cat, ...row }) => ({
      ...row,
      feed_count: countMap.get(row.id) ?? 0,
      category_label_en: cat?.label_en,
      category_label_fr: cat?.label_fr,
    }));
  } catch (err) {
    console.warn("[getActiveTopics]", err);
    return [];
  }
}

export async function getTopicWithFeeds(
  id: string,
): Promise<(TopicRow & { feeds: FeedRow[] }) | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;

    const { data: topic, error } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !topic) return null;

    const { data: feeds } = await supabase
      .from("feeds")
      .select("*")
      .eq("topic_id", id)
      .order("created_at", { ascending: true });

    return { ...(topic as TopicRow), feeds: (feeds ?? []) as FeedRow[] };
  } catch (err) {
    console.warn("[getTopicWithFeeds]", err);
    return null;
  }
}

export async function createTopic(
  data: Omit<TopicRow, "is_active" | "is_displayed" | "last_fetched_at" | "last_scored_at" | "created_at">,
): Promise<TopicRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("topics")
      .insert(data)
      .select()
      .single();

    if (error || !row) {
      if (error) console.error("[createTopic] insert failed:", error.message);
      return null;
    }
    return row as TopicRow;
  } catch (err) {
    console.error("[createTopic]", err);
    return null;
  }
}

export async function updateTopic(
  id: string,
  data: Partial<Omit<TopicRow, "id" | "created_at">>,
): Promise<TopicRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("topics")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error || !row) {
      if (error) console.error("[updateTopic] update failed:", error.message);
      return null;
    }
    return row as TopicRow;
  } catch (err) {
    console.error("[updateTopic]", err);
    return null;
  }
}

/**
 * Counts of every side-effect performed during a hard delete. Surfaced
 * to the admin UI so the operator can audit the cleanup at a glance.
 *
 * - `articlesDeleted`: rows removed from `articles` (no FK from articles
 *   to topics — manual sweep).
 * - `homeQueueDeleted`: rows removed from `home_surface_queue` (the
 *   queue holds polymorphic refs and intentionally has no FK).
 * - `userPrefsUpdated`: number of `user_topic_preferences` rows whose
 *   `topic_ids` array was rewritten to drop the deleted topic.
 *
 * Cascade-deleted via FK ON DELETE CASCADE (no count needed): `feeds`,
 * `daily_summaries`, `summary_bullets`, `video_roundups`.
 *
 * Set-NULL via FK ON DELETE SET NULL (rows kept, topic_id cleared):
 * `youtube_videos`, `video_transcriptions`, `youtube_channels`.
 */
export interface DeleteTopicResult {
  ok: boolean;
  articlesDeleted: number;
  homeQueueDeleted: number;
  userPrefsUpdated: number;
}

/**
 * Hard delete a topic and every dependent row that the FK graph won't
 * clean up on its own. Order matters — we sweep tables that don't have
 * a cascading FK BEFORE issuing the `DELETE FROM topics` so the row
 * counters returned to the UI reflect what we actually removed.
 *
 * Idempotent: a re-delete on a missing topic returns
 * `{ ok: true, ...0s }` because the per-table sweeps each match nothing.
 */
export async function deleteTopic(id: string): Promise<DeleteTopicResult> {
  const empty: DeleteTopicResult = {
    ok: false,
    articlesDeleted: 0,
    homeQueueDeleted: 0,
    userPrefsUpdated: 0,
  };
  const clientP = getServerClient();
  if (!clientP) return empty;

  try {
    const supabase = await clientP;

    // 1. home_surface_queue — kind='article' rows reference articles.id,
    //    kind='video' rows reference video_transcriptions.id; both carry
    //    the denormalized `topic_id`, so a single sweep removes both.
    //    Run BEFORE deleting articles so the queue.ref_id never points
    //    at an already-deleted article id.
    const queueRes = await supabase
      .from("home_surface_queue")
      .delete({ count: "exact" })
      .eq("topic_id", id);
    if (queueRes.error) {
      console.warn(
        `[deleteTopic] home_surface_queue cleanup failed for topic=${id}: ${queueRes.error.message}`,
      );
    }

    // 2. articles — `articles.topic` is a TEXT label (no FK). A topic
    //    delete must explicitly remove its articles or they linger as
    //    orphans visible in /api/cron-stats and the topic_dynamic
    //    pipelines.
    const articlesRes = await supabase
      .from("articles")
      .delete({ count: "exact" })
      .eq("topic", id);
    if (articlesRes.error) {
      console.warn(
        `[deleteTopic] articles cleanup failed for topic=${id}: ${articlesRes.error.message}`,
      );
    }

    // 3. user_topic_preferences.topic_ids is a TEXT[] array. Pull every
    //    row that contains this id, rewrite the array without it, push
    //    back. `.contains([id])` is a Postgres `@>` containment check.
    const { data: prefsRows, error: prefsSelErr } = await supabase
      .from("user_topic_preferences")
      .select("user_id, topic_ids")
      .contains("topic_ids", [id]);
    if (prefsSelErr) {
      console.warn(
        `[deleteTopic] user_topic_preferences select failed for topic=${id}: ${prefsSelErr.message}`,
      );
    }
    let userPrefsUpdated = 0;
    if (prefsRows) {
      for (const row of prefsRows as Array<{ user_id: string; topic_ids: string[] }>) {
        const next = (row.topic_ids ?? []).filter((t) => t !== id);
        const { error: prefUpdErr } = await supabase
          .from("user_topic_preferences")
          .update({ topic_ids: next })
          .eq("user_id", row.user_id);
        if (!prefUpdErr) userPrefsUpdated++;
      }
    }

    // 4. topics row itself. ON DELETE CASCADE on:
    //    - feeds.topic_id          → all RSS feeds gone
    //    - daily_summaries.topic_id → cascades summary_bullets too via
    //                                 daily_summary_id (and summary_bullets
    //                                 also has a direct ON DELETE CASCADE
    //                                 on its own topic_id, defense in depth).
    //    - video_roundups.topic_id  → all video roundup pages gone
    //    ON DELETE SET NULL on:
    //    - youtube_videos.topic_id, video_transcriptions.topic_id,
    //      youtube_channels.topic_id — the rows persist with topic_id
    //      = NULL so the cron / SSR can keep operating on them, just
    //      detached from the deleted label.
    const { error: topicErr } = await supabase
      .from("topics")
      .delete()
      .eq("id", id);
    if (topicErr) {
      console.error(
        `[deleteTopic] topics delete failed for topic=${id}: ${topicErr.message}`,
      );
      return {
        ok: false,
        articlesDeleted: articlesRes.count ?? 0,
        homeQueueDeleted: queueRes.count ?? 0,
        userPrefsUpdated,
      };
    }

    return {
      ok: true,
      articlesDeleted: articlesRes.count ?? 0,
      homeQueueDeleted: queueRes.count ?? 0,
      userPrefsUpdated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[deleteTopic] threw for topic=${id}: ${msg}`);
    return empty;
  }
}

export async function createFeed(
  topicId: string,
  name: string,
  url: string,
): Promise<FeedRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("feeds")
      .insert({ topic_id: topicId, name, url })
      .select()
      .single();

    if (error || !row) {
      if (error) console.error("[createFeed] insert failed:", error.message);
      return null;
    }
    return row as FeedRow;
  } catch (err) {
    console.error("[createFeed]", err);
    return null;
  }
}

export async function updateFeed(
  feedId: number,
  data: Partial<Pick<FeedRow, "name" | "url" | "is_active">>,
): Promise<FeedRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data: row, error } = await supabase
      .from("feeds")
      .update(data)
      .eq("id", feedId)
      .select()
      .single();

    if (error || !row) {
      if (error) console.error("[updateFeed] update failed:", error.message);
      return null;
    }
    return row as FeedRow;
  } catch (err) {
    console.error("[updateFeed]", err);
    return null;
  }
}

export async function deleteFeed(feedId: number): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;

  try {
    const supabase = await clientP;
    const { error } = await supabase.from("feeds").delete().eq("id", feedId);
    if (error) {
      console.error("[deleteFeed] delete failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[deleteFeed]", err);
    return false;
  }
}

export async function getFeedById(feedId: number): Promise<FeedRow | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("feeds")
      .select("*")
      .eq("id", feedId)
      .single();

    if (error || !data) return null;
    return data as FeedRow;
  } catch (err) {
    console.warn("[getFeedById]", err);
    return null;
  }
}

export async function deleteArticlesByTopicAndSource(
  topicId: string,
  source: string,
): Promise<{ ok: boolean; deleted: number }> {
  const clientP = getServerClient();
  if (!clientP) return { ok: false, deleted: 0 };

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("articles")
      .delete()
      .eq("topic", topicId)
      .eq("source", source)
      .select("id");

    if (error) {
      console.error("[deleteArticlesByTopicAndSource] delete failed:", error.message);
      return { ok: false, deleted: 0 };
    }
    return { ok: true, deleted: data?.length ?? 0 };
  } catch (err) {
    console.error("[deleteArticlesByTopicAndSource]", err);
    return { ok: false, deleted: 0 };
  }
}

export async function getAllFeedsRows(): Promise<FeedRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("feeds")
      .select("*")
      .order("topic_id", { ascending: true })
      .order("name", { ascending: true });

    if (error || !data) return [];
    return data as FeedRow[];
  } catch (err) {
    console.warn("[getAllFeedsRows]", err);
    return [];
  }
}

export async function getTopicPrompt(
  id: string,
): Promise<{ prompt_en: string; prompt_fr: string } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;

  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("prompt_en, prompt_fr")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as { prompt_en: string; prompt_fr: string };
  } catch (err) {
    console.warn("[getTopicPrompt]", err);
    return null;
  }
}

export async function getTopicById(
  id: string,
): Promise<{ id: string; label_en: string; label_fr: string; is_active: boolean } | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("id, label_en, label_fr, is_active")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return data as { id: string; label_en: string; label_fr: string; is_active: boolean };
  } catch (err) {
    console.warn("[getTopicById]", err);
    return null;
  }
}

export async function getActiveTopicIds(): Promise<string[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("topics")
      .select("id")
      .eq("is_active", true);
    if (error || !data) return [];
    return data.map((r) => r.id);
  } catch (err) {
    console.warn("[getActiveTopicIds]", err);
    return [];
  }
}
