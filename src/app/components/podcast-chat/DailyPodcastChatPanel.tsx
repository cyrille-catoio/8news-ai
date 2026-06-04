"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { formatSummaryDayLabel } from "@/app/components/top24h/Top24hHeroHelpers";
import { PodcastChatMarkdown } from "@/app/components/podcast-chat/PodcastChatMarkdown";

/**
 * Daily Podcast chat side panel (v2.13+). Docked full-height on the
 * right; Cursor-style. The open/closed state is **controlled by the
 * parent** (`src/app/app/page.tsx`) so the layout can push the rest of
 * the interface to the left while it's open — the app stays fully
 * usable (no backdrop, every link clickable). The square open/close
 * toggle lives in the parent (top-right corner).
 *
 * Context model (server-enforced — see `/api/podcast-chat`):
 *  - The grounding is the day's Top 24h podcast snapshot (full text +
 *    per-topic notes + source links), rebuilt server-side on every turn.
 *  - The running conversation of the day (questions + answers) is
 *    persisted in `podcast_chat_messages` and re-injected each turn.
 *
 * This component only renders for authenticated users (the parent gates
 * on session). It hydrates the day's thread on first open, streams the
 * answer token-by-token, and offers a « clear conversation » action.
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function DailyPodcastChatPanel({
  lang,
  open,
  onOpenChange,
  isAuthenticated,
  onRequestAuth,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When false, the user can still type a question, but submitting it
   *  routes them to the auth flow instead of calling the (auth-gated)
   *  API — see `send` below. */
  isAuthenticated: boolean;
  /** Opens the sign-in / create-account modal. */
  onRequestAuth: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [noSnapshot, setNoSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Hydrate the day's conversation the first time the panel opens (and
  // re-hydrate when the UI language flips, since the grounded day/lang
  // changes). Cheap GET; the thread is at most a few dozen turns.
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const res = await fetch(`/api/podcast-chat?lang=${lang}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        summaryDate: string | null;
        messages: ChatMessage[];
        reason?: string;
      };
      setSummaryDate(json.summaryDate);
      setNoSnapshot(json.summaryDate === null);
      setMessages(
        (json.messages ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
    } catch {
      setError(t("podcastChatError", lang));
    } finally {
      setLoadingHistory(false);
    }
  }, [lang]);

  // Reset the hydration latch whenever auth flips so a user who signs in
  // with the panel already open gets their thread loaded.
  useEffect(() => {
    hydratedRef.current = false;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!open) return;
    // Anonymous visitors have no server-side thread (the API is
    // auth-gated). Skip the GET; they can still type, and submitting
    // routes them to sign-in.
    if (!isAuthenticated) {
      hydratedRef.current = true;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void loadHistory();
  }, [open, isAuthenticated, loadHistory]);

  // Re-hydrate on lang change while open (different grounding day/lang).
  useEffect(() => {
    if (!open || !isAuthenticated) return;
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || sending) return;
    // Anonymous: route to sign-in instead of hitting the auth-gated API.
    // Keep the typed text so they can resend right after authenticating.
    if (!isAuthenticated) {
      onRequestAuth();
      return;
    }
    setInput("");
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/podcast-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, lang }),
      });

      if (res.status === 409) {
        setNoSnapshot(true);
        setMessages((prev) => prev.slice(0, -2));
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const headerDate = res.headers.get("X-Summary-Date");
      if (headerDate) {
        setSummaryDate(headerDate);
        setNoSnapshot(false);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return next;
          });
        }
      }
    } catch {
      setError(t("podcastChatError", lang));
      // Drop the empty assistant placeholder on hard failure.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [input, sending, lang, isAuthenticated, onRequestAuth]);

  const clearConversation = useCallback(async () => {
    if (sending) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("podcastChatClearConfirm", lang))
    ) {
      return;
    }
    setMessages([]);
    try {
      await fetch(`/api/podcast-chat?lang=${lang}`, {
        method: "DELETE",
        cache: "no-store",
      });
    } catch {
      /* best-effort — the UI already cleared */
    }
  }, [lang, sending]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const dateLabel = summaryDate ? formatSummaryDayLabel(summaryDate, lang) : "";

  if (!open) return null;

  return (
    <>
      {/* Panel — docked right, no backdrop so the app stays usable. */}
      {
        <aside
          className="podcast-chat-panel"
          role="dialog"
          aria-label={t("podcastChatTitle", lang)}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 71,
            display: "flex",
            flexDirection: "column",
            background: color.bg,
            borderLeft: `1px solid ${color.gold}`,
            boxShadow: "-12px 0 40px rgba(0,0,0,0.55)",
            animation: "podcastChatSlideIn 220ms ease",
          }}
        >
          {/* Header. */}
          <header
            style={{
              flexShrink: 0,
              padding: "14px 16px",
              borderBottom: `1px solid ${color.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: color.surface,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                // Leave room for the parent's top-right square toggle.
                paddingRight: 44,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  color: color.text,
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                <span style={{ color: color.gold, display: "inline-flex" }}>
                  <ChatGlyph />
                </span>
                {t("podcastChatTitle", lang)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  letterSpacing: "0.04em",
                  color: color.gold,
                  border: `1px solid ${color.border}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  maxWidth: "100%",
                }}
              >
                {t("podcastChatContextChip", lang)}
                {dateLabel ? ` · ${dateLabel}` : ""}
              </span>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearConversation()}
                  style={{
                    ...iconBtnStyle,
                    width: "auto",
                    padding: "4px 8px",
                    fontSize: 11,
                  }}
                  title={t("podcastChatClear", lang)}
                >
                  {t("podcastChatClear", lang)}
                </button>
              )}
            </div>
          </header>

          {/* Message list. */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {loadingHistory ? (
              <p style={mutedTextStyle}>{t("podcastChatThinking", lang)}</p>
            ) : noSnapshot ? (
              <p style={mutedTextStyle}>{t("podcastChatNoSnapshot", lang)}</p>
            ) : messages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={mutedTextStyle}>{t("podcastChatEmpty", lang)}</p>
                {!isAuthenticated && (
                  <p style={{ ...mutedTextStyle, color: color.gold }}>
                    {t("podcastChatSignInHint", lang)}
                  </p>
                )}
              </div>
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  role={m.role}
                  content={m.content}
                  thinkingLabel={t("podcastChatThinking", lang)}
                  isStreaming={
                    sending &&
                    i === messages.length - 1 &&
                    m.role === "assistant"
                  }
                />
              ))
            )}
          </div>

          {/* Error line. */}
          {error && (
            <div
              style={{
                flexShrink: 0,
                padding: "8px 16px",
                color: color.errorText,
                background: color.errorBg,
                borderTop: `1px solid ${color.errorBorder}`,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {/* Composer. */}
          <div
            style={{
              flexShrink: 0,
              borderTop: `1px solid ${color.border}`,
              padding: 12,
              background: color.surface,
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              rows={1}
              disabled={noSnapshot}
              placeholder={t("podcastChatPlaceholder", lang)}
              style={{
                flex: 1,
                resize: "none",
                maxHeight: 120,
                minHeight: 40,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${color.border}`,
                background: color.bg,
                color: color.text,
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.4,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim() || noSnapshot}
              aria-label={t("podcastChatSend", lang)}
              title={t("podcastChatSend", lang)}
              style={{
                flexShrink: 0,
                height: 40,
                width: 40,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                border: "none",
                background:
                  sending || !input.trim() || noSnapshot
                    ? color.borderLight
                    : color.gold,
                color:
                  sending || !input.trim() || noSnapshot ? color.textMuted : "#000",
                cursor:
                  sending || !input.trim() || noSnapshot ? "default" : "pointer",
                transition: "background 140ms ease",
              }}
            >
              <SendGlyph />
            </button>
          </div>
        </aside>
      }
    </>
  );
}

function MessageBubble({
  role,
  content,
  isStreaming,
  thinkingLabel,
}: {
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  thinkingLabel: string;
}) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "92%",
        background: isUser ? color.surfaceHover : "transparent",
        border: isUser ? `1px solid ${color.border}` : "none",
        borderRadius: 12,
        padding: isUser ? "8px 12px" : "0",
      }}
    >
      {isUser ? (
        <p
          style={{
            margin: 0,
            color: color.text,
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </p>
      ) : content ? (
        <div style={{ fontSize: 14 }}>
          <PodcastChatMarkdown source={content} />
        </div>
      ) : isStreaming ? (
        <p style={mutedTextStyle}>{thinkingLabel}</p>
      ) : null}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 6,
  border: `1px solid ${color.border}`,
  background: "transparent",
  color: color.textMuted,
  cursor: "pointer",
  fontFamily: "inherit",
};

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  color: color.textMuted,
  fontSize: 13,
  lineHeight: 1.55,
};

function ChatGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z" />
    </svg>
  );
}

function SendGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
