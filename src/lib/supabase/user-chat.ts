import { getServerClient } from "./client";
import type { Lang } from "@/lib/i18n";
import type { UserChatMessage } from "@/lib/user-chat";

/**
 * Service-role helpers around `user_chat_messages` (mig. 039+).
 *
 * Backs the Community chat left-side panel — a single global public room
 * where signed-in members talk to each other. Reads are public (RLS
 * `SELECT USING (true)`, also used by Supabase Realtime fan-out), but
 * every WRITE goes through the service role here so the route layer
 * (`/api/user-chat`) can validate input and stamp a trusted
 * `user_id` / `display_name`.
 */

const SELECT_COLS = "id, user_id, display_name, content, lang, created_at";

/** Most recent `limit` messages, returned in ASCENDING order (oldest
 *  first) so the panel can render them top-to-bottom and scroll to the
 *  newest. */
export async function getRecentUserChatMessages(
  limit = 50,
): Promise<UserChatMessage[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("user_chat_messages")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(200, Math.max(1, limit)));
    if (error || !data) {
      if (error) console.warn("[getRecentUserChatMessages]", error.message);
      return [];
    }
    return (data as UserChatMessage[]).slice().reverse();
  } catch (err) {
    console.warn("[getRecentUserChatMessages]", err);
    return [];
  }
}

/** Inserts a single community-chat message and returns the persisted row
 *  (so the API can echo it back to the poster while Realtime fans it out
 *  to everyone else). Returns `null` on failure — the caller surfaces it
 *  rather than swallowing it. */
export async function insertUserChatMessage(args: {
  userId: string;
  displayName: string;
  content: string;
  lang: Lang;
}): Promise<UserChatMessage | null> {
  const clientP = getServerClient();
  if (!clientP) return null;
  try {
    const supabase = await clientP;
    const { data, error } = await supabase
      .from("user_chat_messages")
      .insert({
        user_id: args.userId,
        display_name: args.displayName,
        content: args.content,
        lang: args.lang,
      })
      .select(SELECT_COLS)
      .single();
    if (error || !data) {
      console.error(
        "[insertUserChatMessage] insert failed:",
        error?.message ?? "no row returned",
      );
      return null;
    }
    return data as UserChatMessage;
  } catch (err) {
    console.error("[insertUserChatMessage]", err);
    return null;
  }
}

/** Owner-only moderation action: deletes a single community-chat message
 *  by id. The API route enforces `requireOwnerSession()` before calling
 *  this helper; the service role performs the actual delete. */
export async function deleteUserChatMessage(messageId: number): Promise<boolean> {
  const clientP = getServerClient();
  if (!clientP) return false;
  try {
    const supabase = await clientP;
    const { error } = await supabase
      .from("user_chat_messages")
      .delete()
      .eq("id", messageId);
    if (error) {
      console.error("[deleteUserChatMessage] delete failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[deleteUserChatMessage]", err);
    return false;
  }
}
