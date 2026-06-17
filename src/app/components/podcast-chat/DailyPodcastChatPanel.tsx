"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { getCookie } from "@/lib/cookies";
import { TTS_TEXT_MAX_CHARS } from "@/lib/tts";
import { TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";
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
 * The clear and close actions live in the panel title row so they stay
 * aligned inside the chat panel on desktop and mobile.
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** localStorage key for the per-day « hidden up to » cut-off used by the
 *  « Clear » action (hide-only — the DB keeps every message). */
function hiddenKey(summaryDate: string): string {
  return `podcastChatHiddenUntil:${summaryDate}`;
}

function readHiddenUntil(summaryDate: string | null): string | null {
  if (!summaryDate || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(hiddenKey(summaryDate));
  } catch {
    return null;
  }
}

function writeHiddenUntil(summaryDate: string | null, iso: string): void {
  if (!summaryDate || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hiddenKey(summaryDate), iso);
  } catch {
    /* storage disabled — the in-session clear still works */
  }
}

export function DailyPodcastChatPanel({
  lang,
  open,
  onOpenChange,
  isAuthenticated,
  onRequestAuth,
  onWidthChange,
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
  /** Reports a requested panel width (px) while the left-edge handle is
   *  dragged. The parent clamps to its min/max and applies it. */
  onWidthChange: (width: number) => void;
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
        messages: Array<{ role: "user" | "assistant"; content: string; created_at: string }>;
        reason?: string;
      };
      setSummaryDate(json.summaryDate);
      setNoSnapshot(json.summaryDate === null);
      // « Clear » hides the thread client-side only — the DB keeps every
      // message. We remember the cut-off timestamp per podcast day in
      // localStorage and drop anything at or before it, so a cleared
      // conversation stays hidden across reloads while new messages
      // (posted after the cut-off) remain visible.
      const hiddenUntil = readHiddenUntil(json.summaryDate);
      setMessages(
        (json.messages ?? [])
          .filter((m) => !hiddenUntil || m.created_at > hiddenUntil)
          .map((m) => ({ role: m.role, content: m.content })),
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

  // Hides the conversation from the UI WITHOUT deleting anything in the
  // database. We persist the cut-off timestamp per podcast day so the
  // thread stays hidden across reloads; `loadHistory` filters on it.
  const clearConversation = useCallback(() => {
    if (sending) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("podcastChatClearConfirm", lang))
    ) {
      return;
    }
    writeHiddenUntil(summaryDate, new Date().toISOString());
    setMessages([]);
  }, [lang, sending, summaryDate]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // Drag-to-resize from the left edge. The panel is anchored to the
  // right, so the requested width is simply the distance from the
  // cursor to the right edge of the viewport. The parent clamps it.
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      document.body.classList.add("podcast-chat-resizing");
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        onWidthChange(window.innerWidth - ev.clientX);
      };
      const onUp = () => {
        document.body.classList.remove("podcast-chat-resizing");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onWidthChange],
  );

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
          {/* Left-edge resize handle (desktop). Drag to grow/shrink the
              panel; the parent clamps to a coherent min/max and mirrors
              the width onto the interface push. Hidden on phones. */}
          <div
            className="podcast-chat-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("podcastChatResize", lang)}
            title={t("podcastChatResize", lang)}
            onPointerDown={startResize}
            style={{
              position: "absolute",
              left: -4,
              top: 0,
              bottom: 0,
              width: 9,
              cursor: "ew-resize",
              zIndex: 2,
              touchAction: "none",
            }}
          />
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
              <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearConversation()}
                    aria-label={t("podcastChatClear", lang)}
                    title={t("podcastChatClear", lang)}
                    style={{
                      width: 30,
                      height: 30,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      border: `1px solid ${color.border}`,
                      background: color.bg,
                      color: color.textMuted,
                      cursor: "pointer",
                    }}
                  >
                    <TrashGlyph />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label={t("podcastChatClose", lang)}
                  title={t("podcastChatClose", lang)}
                  style={{
                    width: 30,
                    height: 30,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    border: `1px solid ${color.border}`,
                    background: color.bg,
                    color: color.textMuted,
                    cursor: "pointer",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Context chip. */}
            <div style={{ display: "flex", alignItems: "center" }}>
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
                  lang={lang}
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

function readTtsSpeed(): number {
  if (typeof document === "undefined") return 1.05;
  const raw = getCookie("ttsSpeed");
  if (raw && /^[\d.]+$/.test(raw)) return Math.min(1.2, Math.max(0.7, Number(raw)));
  return 1.05;
}

function readTtsVoice(lang: Lang): string {
  if (typeof document === "undefined") return lang === "fr" ? "george" : "sarah";
  const raw = lang === "fr" ? getCookie("ttsVoiceFr") : getCookie("ttsVoice");
  const defaultV = lang === "fr" ? "george" : "sarah";
  const voices = lang === "fr" ? TTS_VOICES_FR : TTS_VOICES_EN;
  return raw && voices.some((v) => v.id === raw) ? raw : defaultV;
}

/** Convert the assistant's Markdown answer into cleaner spoken text. */
function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function MessageBubble({
  role,
  content,
  lang,
  isStreaming,
  thinkingLabel,
}: {
  role: "user" | "assistant";
  content: string;
  lang: Lang;
  isStreaming: boolean;
  thinkingLabel: string;
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const playRequestRef = useRef(0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by browser permissions; keep the UI quiet.
    }
  }

  async function playAnswer() {
    if (playing) {
      playRequestRef.current += 1;
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    audioRef.current?.pause();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const requestId = playRequestRef.current + 1;
    playRequestRef.current = requestId;
    setPlaying(true);
    try {
      const plain = markdownToPlainText(content).slice(0, TTS_TEXT_MAX_CHARS);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: plain,
          lang,
          speed: readTtsSpeed(),
          voice: readTtsVoice(lang),
        }),
      });
      if (!res.ok) throw new Error("tts_failed");
      const blob = await res.blob();
      if (playRequestRef.current !== requestId) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  const showAssistantActions = !isUser && Boolean(content) && !isStreaming;
  const actionButtonStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: color.textDim,
    cursor: "pointer",
    padding: 0,
  };

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
        <>
          <div style={{ fontSize: 14 }}>
            <PodcastChatMarkdown source={content} />
          </div>
          {showAssistantActions && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void copyAnswer()}
                aria-label={copied ? t("podcastChatCopiedAnswer", lang) : t("podcastChatCopyAnswer", lang)}
                title={copied ? t("podcastChatCopiedAnswer", lang) : t("podcastChatCopyAnswer", lang)}
                style={{ ...actionButtonStyle, color: copied ? "#4ade80" : color.textDim }}
              >
                {copied ? <CheckGlyph /> : <CopyGlyph />}
              </button>
              <button
                type="button"
                onClick={() => void playAnswer()}
                aria-label={t("podcastChatPlayAnswer", lang)}
                title={t("podcastChatPlayAnswer", lang)}
                style={{ ...actionButtonStyle, color: playing ? color.gold : color.textDim }}
              >
                <PlayGlyph active={playing} />
              </button>
            </div>
          )}
        </>
      ) : isStreaming ? (
        <p style={mutedTextStyle}>{thinkingLabel}</p>
      ) : null}
    </div>
  );
}

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

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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

function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlayGlyph({ active }: { active: boolean }) {
  return active ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
