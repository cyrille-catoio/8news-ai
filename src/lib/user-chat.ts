import type { Lang } from "@/lib/i18n";

/**
 * Pure, framework-agnostic helpers for the Community chat (v2.14+) —
 * shared by the API route (`/api/user-chat`), the client panel
 * (`UserChatPanel`) and their colocated tests. Nothing here touches
 * Supabase, React or the DOM, so it stays trivially unit-testable and
 * safe to import from both the server and the browser bundle.
 */

/** Hard cap on a single chat message (matches the API validation). */
export const USER_CHAT_MAX_LEN = 2000;

/** One persisted community-chat message (mirrors the DB row shape). */
export interface UserChatMessage {
  id: number;
  user_id: string;
  display_name: string;
  content: string;
  lang: string;
  created_at: string;
}

/** A run of consecutive messages from the same author, Discord-style:
 *  the author header (avatar + name + time) is shown once, then the
 *  following messages stack underneath. */
export interface UserChatGroup {
  userId: string;
  displayName: string;
  /** ISO timestamp of the first message in the run (header time). */
  startedAt: string;
  messages: Array<{ id: number; content: string; created_at: string }>;
}

/** Beyond this gap (ms) two messages from the same author start a fresh
 *  group, so a reply hours later doesn't merge into a morning run. */
const GROUP_GAP_MS = 7 * 60_000;

/**
 * Resolves the name shown in the chat from a user's `user_metadata`:
 * nickname first (lets members stay anonymous), then first name, then a
 * localized « Anonymous » fallback. Trimmed; never returns an empty
 * string.
 */
export function resolveChatDisplayName(
  meta: Record<string, unknown> | null | undefined,
  lang: Lang,
): string {
  const pick = (v: unknown): string =>
    typeof v === "string" && v.trim() ? v.trim() : "";
  const nickname = pick(meta?.nickname);
  if (nickname) return nickname;
  const firstName = pick(meta?.first_name);
  if (firstName) return firstName;
  return lang === "fr" ? "Anonyme" : "Anonymous";
}

/** First grapheme-ish character of the name, uppercased, for the avatar
 *  monogram. Falls back to « ? » for an empty name. */
export function chatAvatarInitial(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  return Array.from(trimmed)[0]!.toUpperCase();
}

/** Deterministic avatar background derived from the author seed (user id
 *  or name), so each member keeps a stable colour across the room. The
 *  palette is muted to sit on the black/gold theme without shouting. */
const AVATAR_PALETTE = [
  "#b5892f",
  "#3f7d6e",
  "#7d5ba6",
  "#a65b5b",
  "#4f6fae",
  "#5b8a3c",
  "#a6743f",
  "#5f6b7a",
];

export function chatAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx]!;
}

/** Groups an ASCENDING list of messages into per-author runs (same user,
 *  within `GROUP_GAP_MS`). Returns groups in display order. */
export function groupChatMessages(messages: UserChatMessage[]): UserChatGroup[] {
  const groups: UserChatGroup[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const prevMsg = last?.messages[last.messages.length - 1];
    const sameAuthor = last?.userId === m.user_id;
    const closeInTime =
      prevMsg !== undefined &&
      new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() <
        GROUP_GAP_MS;
    if (last && sameAuthor && closeInTime) {
      last.messages.push({ id: m.id, content: m.content, created_at: m.created_at });
      // Keep the freshest display name for the author in this run.
      last.displayName = m.display_name;
    } else {
      groups.push({
        userId: m.user_id,
        displayName: m.display_name,
        startedAt: m.created_at,
        messages: [{ id: m.id, content: m.content, created_at: m.created_at }],
      });
    }
  }
  return groups;
}

const PLAIN_URL_RE = /https?:\/\/[^\s<>()\][]+/g;

/** Splits a message into plain-text and URL segments so the renderer can
 *  turn bare links into anchors without `dangerouslySetInnerHTML`.
 *  Trailing punctuation stays in the text segment. */
export function splitTextAndUrls(
  text: string,
): Array<{ type: "text" | "url"; value: string }> {
  const out: Array<{ type: "text" | "url"; value: string }> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(PLAIN_URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    const trailing = raw.match(/[.,!?;:]+$/)?.[0] ?? "";
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    out.push({ type: "url", value: url });
    if (trailing) out.push({ type: "text", value: trailing });
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    out.push({ type: "text", value: text.slice(lastIndex) });
  }
  return out;
}

/** Short clock label (HH:MM) for a message timestamp, localized. */
export function formatChatTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
