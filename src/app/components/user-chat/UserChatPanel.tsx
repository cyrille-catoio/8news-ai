"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  chatAvatarColor,
  chatAvatarInitial,
  formatChatTime,
  groupChatMessages,
  splitTextAndUrls,
  USER_CHAT_MAX_LEN,
  type UserChatMessage,
} from "@/lib/user-chat";
import { EmojiPicker } from "@/app/components/user-chat/EmojiPicker";

/**
 * Community chat side panel (v2.14+). Docked full-height on the LEFT
 * (mirrors the Daily Podcast chat, which sits on the right). The
 * open/closed state is controlled by the parent (`src/app/app/page.tsx`)
 * so the layout pushes the interface to the right while it's open — no
 * backdrop, the app stays usable.
 *
 * A single global public room. Reads + the live INSERT subscription go
 * straight through the browser Supabase client (RLS `SELECT USING(true)`
 * + Realtime); posting goes through `/api/user-chat`, which validates the
 * message and stamps a trusted display name from the session metadata.
 */

const MAX_VISIBLE = 200;

function mergeMessage(
  prev: UserChatMessage[],
  next: UserChatMessage,
): UserChatMessage[] {
  if (prev.some((m) => m.id === next.id)) return prev;
  const merged = [...prev, next].sort((a, b) => a.id - b.id);
  return merged.length > MAX_VISIBLE ? merged.slice(-MAX_VISIBLE) : merged;
}

interface ContextMenuState {
  messageId: number;
  x: number;
  y: number;
}

export function UserChatPanel({
  lang,
  open,
  onOpenChange,
  isAuthenticated,
  canModerate,
  onRequestAuth,
  onWidthChange,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAuthenticated: boolean;
  canModerate: boolean;
  onRequestAuth: () => void;
  onWidthChange: (width: number) => void;
}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [messages, setMessages] = useState<UserChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Hydrate recent history + subscribe to live INSERTs while open. The
  // room is public, so this runs for anonymous visitors too (they just
  // can't post). Re-subscribes are cheap; we tear the channel down on
  // close / unmount.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadMessages = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const res = await fetch("/api/user-chat?limit=50", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { messages: UserChatMessage[] };
        if (cancelled) return;
        setMessages(json.messages ?? []);
      } catch {
        if (!cancelled && showLoading) setError(t("userChatError", lang));
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void loadMessages(true);

    // Reconcile with the DB periodically and whenever the tab becomes
    // visible again. This is a safety net for missed Realtime DELETE
    // events (e.g. another already-open production tab, network blip,
    // or an older deployed bundle): a deleted row disappears everywhere
    // on the next refresh even if the live event was not received.
    const reconcile = () => {
      if (document.visibilityState === "visible") void loadMessages(false);
    };
    const interval = window.setInterval(reconcile, 30_000);
    document.addEventListener("visibilitychange", reconcile);

    const channel = supabase
      .channel("user-chat-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_chat_messages" },
        (payload) => {
          const row = payload.new as UserChatMessage;
          setMessages((prev) => mergeMessage(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_chat_messages" },
        (payload) => {
          const oldRow = payload.old as Partial<UserChatMessage>;
          if (typeof oldRow.id !== "number") return;
          setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", reconcile);
      void supabase.removeChannel(channel);
    };
  }, [open, supabase, lang]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  useEffect(() => {
    if (!open || !contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, contextMenu]);

  // Esc closes the panel (unless the emoji picker is open — close that first).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (contextMenu) setContextMenu(null);
      else if (emojiOpen) setEmojiOpen(false);
      else onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, emojiOpen, contextMenu]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;
    if (!isAuthenticated) {
      onRequestAuth();
      return;
    }
    setInput("");
    setEmojiOpen(false);
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/user-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, lang }),
      });
      // Moderation rejection — surface a calm, localized reason and let
      // the member rephrase (the message is kept in the composer).
      if (res.status === 422) {
        const json = (await res.json().catch(() => ({}))) as { reason?: string };
        setError(
          json.reason === "disrespect"
            ? t("userChatRejectedDisrespect", lang)
            : json.reason === "off_topic"
              ? t("userChatRejectedOffTopic", lang)
              : t("userChatRejectedGeneric", lang),
        );
        setInput(content);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { message: UserChatMessage };
      if (json.message) setMessages((prev) => mergeMessage(prev, json.message));
    } catch {
      setError(t("userChatError", lang));
      setInput(content);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [input, sending, isAuthenticated, onRequestAuth, lang]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const insertEmoji = useCallback((emoji: string) => {
    const el = inputRef.current;
    if (!el) {
      setInput((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setInput((prev) => prev.slice(0, start) + emoji + prev.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  }, []);

  const openMessageMenu = useCallback(
    (e: React.MouseEvent, messageId: number) => {
      if (!canModerate) return;
      e.preventDefault();
      setEmojiOpen(false);
      const menuWidth = 190;
      const menuHeight = 44;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
      setContextMenu({ messageId, x: Math.max(8, x), y: Math.max(8, y) });
    },
    [canModerate],
  );

  const deleteMessage = useCallback(async () => {
    const messageId = contextMenu?.messageId;
    if (!messageId || deletingId !== null) return;
    setDeletingId(messageId);
    setContextMenu(null);
    setError(null);
    try {
      const res = await fetch(`/api/user-chat?id=${messageId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic local removal; Realtime DELETE will dedupe naturally.
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      setError(t("userChatDeleteError", lang));
    } finally {
      setDeletingId(null);
    }
  }, [contextMenu?.messageId, deletingId, lang]);

  // Drag-to-resize from the RIGHT edge. The panel is anchored left, so
  // the requested width is simply the cursor's distance from the left
  // edge of the viewport. The parent clamps it.
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      document.body.classList.add("user-chat-resizing");
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => onWidthChange(ev.clientX);
      const onUp = () => {
        document.body.classList.remove("user-chat-resizing");
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

  const groups = useMemo(() => groupChatMessages(messages), [messages]);

  if (!open) return null;

  const iconBtnStyle: CSSProperties = {
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
  };

  return (
    <aside
      className="user-chat-panel"
      role="dialog"
      aria-label={t("userChatTitle", lang)}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 71,
        display: "flex",
        flexDirection: "column",
        background: color.bg,
        borderRight: `1px solid ${color.gold}`,
        boxShadow: "12px 0 40px rgba(0,0,0,0.55)",
        animation: "userChatSlideIn 220ms ease",
      }}
    >
      {/* Right-edge resize handle (desktop). */}
      <div
        className="user-chat-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("userChatResize", lang)}
        title={t("userChatResize", lang)}
        onPointerDown={startResize}
        style={{
          position: "absolute",
          right: -4,
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
          alignItems: "center",
          gap: 8,
          background: color.surface,
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
            <UsersGlyph />
          </span>
          {t("userChatTitle", lang)}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "0.04em",
            color: color.gold,
            border: `1px solid ${color.border}`,
            borderRadius: 999,
            padding: "2px 9px",
          }}
        >
          {t("userChatSubtitle", lang)}
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t("userChatClose", lang)}
          title={t("userChatClose", lang)}
          style={{ ...iconBtnStyle, marginLeft: "auto" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* Pinned room notice — always visible above the scrollable thread. */}
      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px",
          borderBottom: `1px solid ${color.border}`,
          background:
            "linear-gradient(90deg, rgba(201,162,39,0.10), rgba(201,162,39,0.03) 70%, transparent), " +
            color.bg,
        }}
      >
        <p
          style={{
            margin: 0,
            color: color.textSecondary,
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          {t("userChatPinnedNotice", lang)}
        </p>
      </div>

      {/* Message list. */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {loading && messages.length === 0 ? (
          <p style={mutedTextStyle}>{t("userChatLoading", lang)}</p>
        ) : messages.length === 0 ? (
          <p style={mutedTextStyle}>{t("userChatEmpty", lang)}</p>
        ) : (
          groups.map((g) => (
            <div key={`${g.userId}-${g.messages[0].id}`} style={{ display: "flex", gap: 10 }}>
              <div
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: chatAvatarColor(g.userId),
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {chatAvatarInitial(g.displayName)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ color: color.text, fontWeight: 600, fontSize: 14 }}>
                    {g.displayName}
                  </span>
                  <span style={{ color: color.textDim, fontSize: 11 }}>
                    {formatChatTime(g.startedAt, lang)}
                  </span>
                </div>
                {g.messages.map((m) => (
                  <p
                    key={m.id}
                    onContextMenu={(e) => openMessageMenu(e, m.id)}
                    title={canModerate ? t("userChatAdminContextHint", lang) : undefined}
                    style={{
                      margin: "2px 0 0",
                      color: color.textSecondary,
                      fontSize: 14,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      cursor: canModerate ? "context-menu" : "default",
                      opacity: deletingId === m.id ? 0.45 : 1,
                    }}
                  >
                    {splitTextAndUrls(m.content).map((seg, i) =>
                      seg.type === "url" ? (
                        <a
                          key={i}
                          href={seg.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: color.gold, textDecoration: "underline", wordBreak: "break-word" }}
                        >
                          {seg.value}
                        </a>
                      ) : (
                        <span key={i}>{seg.value}</span>
                      ),
                    )}
                  </p>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {contextMenu && canModerate && (
        <div
          role="menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 90,
            width: 190,
            padding: 4,
            borderRadius: 8,
            border: `1px solid ${color.border}`,
            background: color.surface,
            boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void deleteMessage()}
            disabled={deletingId !== null}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: color.errorText,
              cursor: deletingId !== null ? "wait" : "pointer",
              padding: "8px 10px",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            {t("userChatDeleteMessage", lang)}
          </button>
        </div>
      )}

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

      {/* Sign-in hint for anonymous visitors. */}
      {!isAuthenticated && (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            color: color.gold,
            borderTop: `1px solid ${color.border}`,
            fontSize: 12,
          }}
        >
          {t("userChatSignInToPost", lang)}
        </div>
      )}

      {/* Composer. */}
      <div
        style={{
          flexShrink: 0,
          position: "relative",
          borderTop: `1px solid ${color.border}`,
          padding: 12,
          background: color.surface,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        {emojiOpen && (
          <div style={{ position: "absolute", bottom: 60, left: 12, zIndex: 5 }}>
            <EmojiPicker lang={lang} onSelect={insertEmoji} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label={t("userChatEmoji", lang)}
          title={t("userChatEmoji", lang)}
          style={{
            flexShrink: 0,
            height: 40,
            width: 40,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            border: `1px solid ${color.border}`,
            background: color.bg,
            color: emojiOpen ? color.gold : color.textMuted,
            cursor: "pointer",
            fontSize: 18,
          }}
        >
          <SmileyGlyph />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          rows={1}
          maxLength={USER_CHAT_MAX_LEN}
          placeholder={t("userChatPlaceholder", lang)}
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
          disabled={sending || !input.trim()}
          aria-label={t("userChatSend", lang)}
          title={t("userChatSend", lang)}
          style={{
            flexShrink: 0,
            height: 40,
            width: 40,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            border: "none",
            background: sending || !input.trim() ? color.borderLight : color.gold,
            color: sending || !input.trim() ? color.textMuted : "#000",
            cursor: sending || !input.trim() ? "default" : "pointer",
            transition: "background 140ms ease",
          }}
        >
          <SendGlyph />
        </button>
      </div>
    </aside>
  );
}

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: color.textMuted,
  fontSize: 13,
  lineHeight: 1.55,
};

function UsersGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function SmileyGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
