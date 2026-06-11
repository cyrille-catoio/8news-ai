import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireSession } from "@/lib/auth-api";
import {
  getTopSummaryLiveLatest,
  getTopSummaryByDate,
  getTopSummaryBulletsByDate,
  getPodcastChatMessages,
  insertPodcastChatMessages,
  deletePodcastChatMessages,
} from "@/lib/supabase";
import { buildPodcastSystemPrompt } from "@/lib/podcast-chat-context";
import { NO_STORE_HEADERS, parseLang } from "@/lib/api-helpers";
import type { Lang } from "@/lib/i18n";
import type { TopSummaryRow } from "@/lib/supabase/top-summaries";

/**
 * Daily Podcast chat (v2.13+). Backs the collapsible side panel.
 *
 *  GET  /api/podcast-chat?lang=fr[&date=YYYY-MM-DD]
 *    → { summaryDate, messages: [{ role, content, created_at }, …] }
 *    Hydrates the panel with the user's conversation for the active
 *    podcast day (today's snapshot, or the explicit `date`).
 *
 *  POST /api/podcast-chat   body: { question, lang }
 *    → streamed text/plain answer. Resolves the day's snapshot, grounds
 *      the model in it + the running conversation, streams the answer,
 *      then persists the user question + assistant answer. The resolved
 *      podcast day is echoed in the `X-Summary-Date` response header.
 *    409 when no snapshot exists for the day.
 *
 *  DELETE /api/podcast-chat?lang=fr[&date=YYYY-MM-DD]
 *    → { ok: true } after clearing the day's thread.
 *
 * All verbs require an authenticated session (members + owner). The
 * answer is grounded server-side so the client cannot spoof the
 * briefing. Model is OpenAI `PODCAST_CHAT_MODEL` (default `gpt-5.5`),
 * reusing the existing `OPENAI_API_KEY`.
 */

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_QUESTION_LEN = 4000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolves the podcast day to operate on: an explicit valid `date`
 *  (history), otherwise the live-latest snapshot for the lang. Returns
 *  `null` when no snapshot exists at all. */
async function resolveSnapshot(
  lang: Lang,
  explicitDate: string | null,
): Promise<TopSummaryRow | null> {
  if (explicitDate && DATE_RE.test(explicitDate)) {
    return getTopSummaryByDate(lang, explicitDate);
  }
  const { snapshot } = await getTopSummaryLiveLatest(lang);
  return snapshot;
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const explicitDate = req.nextUrl.searchParams.get("date");
  const snapshot = await resolveSnapshot(lang, explicitDate);

  if (!snapshot) {
    return NextResponse.json(
      { summaryDate: null, messages: [], reason: "no_snapshot" },
      { headers: NO_STORE_HEADERS },
    );
  }

  const messages = await getPodcastChatMessages(
    auth.user.id,
    snapshot.summary_date,
  );
  return NextResponse.json(
    { summaryDate: snapshot.summary_date, messages },
    { headers: NO_STORE_HEADERS },
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const explicitDate = req.nextUrl.searchParams.get("date");
  const snapshot = await resolveSnapshot(lang, explicitDate);
  if (!snapshot) {
    return NextResponse.json(
      { ok: true, summaryDate: null },
      { headers: NO_STORE_HEADERS },
    );
  }

  const ok = await deletePodcastChatMessages(auth.user.id, snapshot.summary_date);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to clear conversation", reason: "db_error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { ok: true, summaryDate: snapshot.summary_date },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured", reason: "openai_missing" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  let body: { question?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", reason: "bad_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "question is required", reason: "bad_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      { error: "question too long", reason: "too_long" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const lang = parseLang(typeof body.lang === "string" ? body.lang : null);

  // Always ground on the live-latest snapshot (today's podcast). We do
  // not let the client pick the day for a POST — the conversation is
  // « du jour ».
  const { snapshot } = await getTopSummaryLiveLatest(lang);
  if (!snapshot) {
    return NextResponse.json(
      { error: "No podcast snapshot available", reason: "no_snapshot" },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const summaryDate = snapshot.summary_date;
  const bullets = await getTopSummaryBulletsByDate(lang, summaryDate);
  const systemPrompt = buildPodcastSystemPrompt({ snapshot, bullets, lang });
  const history = await getPodcastChatMessages(auth.user.id, summaryDate);

  const chatMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  const model = process.env.PODCAST_CHAT_MODEL?.trim() || DEFAULT_MODEL;
  const openai = new OpenAI({ apiKey });

  const userId = auth.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages: chatMessages,
          stream: true,
        });
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            answer += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        // Surface a short inline error so the panel shows something
        // rather than an empty bubble; the answer is not persisted.
        controller.enqueue(
          encoder.encode(
            (answer ? "\n\n" : "") +
              (lang === "fr"
                ? `⚠️ Erreur lors de la génération de la réponse (${msg}).`
                : `⚠️ Error while generating the answer (${msg}).`),
          ),
        );
        controller.close();
        return;
      }

      // Persist the turn only when we got a non-empty answer.
      if (answer.trim()) {
        await insertPodcastChatMessages(userId, summaryDate, lang, [
          { role: "user", content: question },
          { role: "assistant", content: answer },
        ]);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Summary-Date": summaryDate,
    },
  });
}
