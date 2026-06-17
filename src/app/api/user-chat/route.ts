import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, requireSession } from "@/lib/auth-api";
import {
  deleteUserChatMessage,
  getRecentUserChatMessages,
  insertUserChatMessage,
} from "@/lib/supabase";
import { NO_STORE_HEADERS, parseLang, parsePositiveInt } from "@/lib/api-helpers";
import { resolveChatDisplayName, USER_CHAT_MAX_LEN } from "@/lib/user-chat";
import {
  detectObviousOffTopic,
  isTriviallyAllowed,
  runUserChatModeration,
} from "@/lib/user-chat-moderation";

/**
 * Community chat (v2.14+). Backs the global user-to-user room shown in
 * the left-side panel.
 *
 *  GET  /api/user-chat[?limit=50]
 *    → { messages: [{ id, user_id, display_name, content, lang, created_at }, …] }
 *    Public history hydration (oldest → newest). No auth required: the
 *    room is readable by everyone (RLS `SELECT USING (true)`), and the
 *    panel also subscribes to Supabase Realtime for live INSERTs.
 *
 *  POST /api/user-chat   body: { content, lang }
 *    → { message } — the persisted row. Requires a signed-in session.
 *      The display name is resolved server-side from `user_metadata`
 *      (nickname → first name → « Anonymous ») so the client cannot
 *      spoof another member's name. Realtime fans the INSERT out to
 *      every connected client (the poster included).
 *
 *  DELETE /api/user-chat?id=123
 *    → { ok: true } — owner/admin moderation action. Deletes one message
 *      via service role; regular members cannot call it.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = parsePositiveInt(req.nextUrl.searchParams.get("limit"), 50);
  const messages = await getRecentUserChatMessages(limit);
  return NextResponse.json({ messages }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let body: { content?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", reason: "bad_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json(
      { error: "content is required", reason: "bad_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (content.length > USER_CHAT_MAX_LEN) {
    return NextResponse.json(
      { error: "content too long", reason: "too_long" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const lang = parseLang(typeof body.lang === "string" ? body.lang : null);

  // Moderation gate (respect + tech-only-but-lenient). Trivial social
  // messages (greetings, yes/no, thanks, emoji) skip the LLM call. The
  // gate is fail-open: it only ever rejects on an explicit verdict.
  if (!isTriviallyAllowed(content)) {
    if (detectObviousOffTopic(content)) {
      return NextResponse.json(
        { error: "Message rejected by moderation", reason: "off_topic" },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }
    const verdict = await runUserChatModeration(content);
    if (verdict.decision === "reject") {
      return NextResponse.json(
        { error: "Message rejected by moderation", reason: verdict.reason },
        { status: 422, headers: NO_STORE_HEADERS },
      );
    }
  }

  const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName = resolveChatDisplayName(meta, lang);

  const message = await insertUserChatMessage({
    userId: auth.user.id,
    displayName,
    content,
    lang,
  });

  if (!message) {
    return NextResponse.json(
      { error: "Failed to post message", reason: "db_error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ message }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  const messageId = parsePositiveInt(req.nextUrl.searchParams.get("id"), 0);
  if (messageId <= 0) {
    return NextResponse.json(
      { error: "id is required", reason: "bad_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const ok = await deleteUserChatMessage(messageId);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to delete message", reason: "db_error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
