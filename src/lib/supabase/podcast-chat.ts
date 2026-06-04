import { getServerClient } from "./client";
import type { Lang } from "@/lib/i18n";

/**
 * Service-role helpers around `podcast_chat_messages` (mig. 033+).
 *
 * Backs the Daily Podcast chat side panel. A conversation is the set of
 * rows sharing `(user_id, summary_date)` ordered by `created_at` — the
 * (user, podcast day) tuple IS the conversation key, so a new day starts
 * a fresh thread for free.
 *
 * The grounding system prompt is never stored here: it is rebuilt from
 * the day's `top_summaries` snapshot on every call so it always mirrors
 * the live briefing. Only the user questions and assistant answers are
 * persisted.
 *
 * All reads/writes go through the service role (RLS only allows
 * service_role). The route layer (`/api/podcast-chat`) resolves the
 * session and passes a trusted `userId`.
 */

export type PodcastChatRole = "user" | "assistant";

export interface PodcastChatMessageRow {
  role: PodcastChatRole;
  content: string;
  created_at: string;
}

/** Ordered conversation for a (user, podcast day). Sized for an
 *  interactive panel — a single day's thread is at most a few dozen
 *  turns, so no pagination is needed. */
export async function getPodcastChatMessages(
  userId: string,
  summaryDate: string,
): Promise<PodcastChatMessageRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("podcast_chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .eq("summary_date", summaryDate)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error || !data) return [];
    return data as PodcastChatMessageRow[];
  } catch {
    return [];
  }
}

/** Appends one or more messages (typically the user question followed by
 *  the assistant answer) to the (user, podcast day) thread. Inserted in
 *  array order; the BIGSERIAL id breaks ties on equal timestamps so a
 *  question and its answer never swap on read. */
export async function insertPodcastChatMessages(
  userId: string,
  summaryDate: string,
  lang: Lang,
  rows: Array<{ role: PodcastChatRole; content: string }>,
): Promise<boolean> {
  if (rows.length === 0) return true;
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const payload = rows.map((r) => ({
      user_id: userId,
      summary_date: summaryDate,
      lang,
      role: r.role,
      content: r.content,
    }));
    const { error } = await supabase
      .from("podcast_chat_messages")
      .insert(payload);
    return !error;
  } catch {
    return false;
  }
}

/** Clears the whole (user, podcast day) thread — drives the panel's
 *  « clear conversation » action. */
export async function deletePodcastChatMessages(
  userId: string,
  summaryDate: string,
): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase
      .from("podcast_chat_messages")
      .delete()
      .eq("user_id", userId)
      .eq("summary_date", summaryDate);
    return !error;
  } catch {
    return false;
  }
}
