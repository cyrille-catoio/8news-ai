"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color, font, formInputStyle, formTextareaStyle } from "@/lib/theme";
import { trackEvent } from "@/lib/track";

/**
 * « Share » button + modal for the SSR detail pages (video page,
 * daily summary, video roundup). Sits next to the page title.
 *
 * The modal offers two paths:
 *  - send the page link by email (recipient + optional personal note)
 *    via `POST /api/share` (Resend behind the scenes);
 *  - copy the URL to the clipboard for people who'd rather paste it
 *    themselves.
 *
 * Same overlay pattern as `AuthModal` (fixed backdrop, Escape +
 * click-outside dismiss, gold-on-black panel).
 */

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SharePageButton({
  url,
  title,
  lang,
}: {
  /** Absolute canonical URL of the page being shared. */
  url: string;
  /** Page title shown in the email subject/body. */
  title: string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const openModal = () => {
    setOpen(true);
    trackEvent("share.modal_open", { target_id: url, lang });
  };

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSent(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    const to = email.trim();
    if (!EMAIL_RE.test(to)) {
      setError(t("shareErrorInvalidEmail", lang));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, url, title, message: message.trim(), lang }),
      });
      if (res.status === 429) {
        setError(t("shareErrorRateLimited", lang));
        return;
      }
      if (!res.ok) {
        setError(t("shareErrorGeneric", lang));
        return;
      }
      trackEvent("share.email_sent", { target_id: url, lang });
      setSent(true);
      setEmail("");
      setMessage("");
    } catch {
      setError(t("shareErrorGeneric", lang));
    } finally {
      setBusy(false);
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      trackEvent("share.copy_link", { target_id: url, lang });
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: 12,
    color: color.textMuted,
    marginBottom: 4,
  };

  const sendBtn: CSSProperties = {
    width: "100%",
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 6,
    border: "none",
    background: color.gold,
    color: "#000",
    fontWeight: 600,
    fontSize: 14,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    fontFamily: font.base,
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 999,
          border: `1px solid ${color.gold}`,
          background: "transparent",
          color: color.gold,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: font.base,
          flexShrink: 0,
        }}
      >
        <ShareIcon />
        {t("shareButton", lang)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: 12,
              padding: "24px 22px",
              position: "relative",
              fontFamily: font.base,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label={t("shareCloseAria", lang)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                border: "none",
                background: "transparent",
                color: color.textMuted,
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>

            <h2
              id="share-modal-title"
              style={{ margin: "0 0 6px", fontSize: 18, color: color.gold, fontWeight: 600 }}
            >
              {t("shareModalTitle", lang)}
            </h2>
            <p
              style={{
                color: color.textSecondary,
                fontSize: 13,
                lineHeight: 1.5,
                margin: "0 0 18px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title}
            </p>

            <form onSubmit={handleSubmit}>
              <label style={labelStyle} htmlFor="share-recipient">
                {t("shareRecipientLabel", lang)}
              </label>
              <input
                id="share-recipient"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...formInputStyle, marginBottom: 12 }}
                disabled={busy}
                required
              />

              <label style={labelStyle} htmlFor="share-message">
                {t("shareMessageLabel", lang)}
              </label>
              <textarea
                id="share-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("shareMessagePlaceholder", lang)}
                maxLength={1000}
                style={{ ...formTextareaStyle, minHeight: 72 }}
                disabled={busy}
              />

              {error && (
                <p style={{ color: color.errorText, fontSize: 13, margin: "8px 0 0" }}>{error}</p>
              )}
              {sent && (
                <p style={{ color: "#4ade80", fontSize: 13, margin: "8px 0 0" }}>
                  {t("shareSent", lang)}
                </p>
              )}

              <button type="submit" style={sendBtn} disabled={busy}>
                {busy ? t("shareSending", lang) : t("shareSend", lang)}
              </button>
            </form>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
              <label style={labelStyle} htmlFor="share-url">
                {t("shareLinkLabel", lang)}
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="share-url"
                  type="text"
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  style={{ ...formInputStyle, fontSize: 12, color: color.textMuted, flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    flexShrink: 0,
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: `1px solid ${color.gold}`,
                    background: "transparent",
                    color: copied ? "#4ade80" : color.gold,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: font.base,
                  }}
                >
                  {copied ? t("shareCopied", lang) : t("shareCopy", lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
