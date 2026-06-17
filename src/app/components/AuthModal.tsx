"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import { color, font, formInputStyle } from "@/lib/theme";
import { trackEvent } from "@/lib/track";

type Mode = "signin" | "signup";

export function AuthModal({
  open,
  onClose,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Switches the modal content from the form to a welcome screen right
  // after a successful signup (Supabase email confirmation is disabled,
  // so the session is live immediately). Closing the welcome screen
  // navigates the visitor to the videos page.
  const [justSignedUp, setJustSignedUp] = useState(false);

  const resetForm = useCallback(() => {
    setError(null);
    setInfo(null);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setNickname("");
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      setMode("signin");
      setJustSignedUp(false);
    } else {
      trackEvent("auth.modal_open", { lang });
    }
  }, [open, resetForm, lang]);

  // Hard navigation to the Briefing homepage after the welcome screen is
  // dismissed. window.location guarantees the SPA picks up the fresh
  // Supabase session via middleware, regardless of where the modal was
  // mounted (landing, SPA page, SSR page).
  const goToBriefing = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "/app";
    }
  }, []);

  const handleWelcomeClose = useCallback(() => {
    setJustSignedUp(false);
    onClose();
    resetForm();
    goToBriefing();
  }, [goToBriefing, onClose, resetForm]);

  // Single dismiss handler: when the welcome screen is showing we always
  // navigate to /app (Briefing homepage), otherwise we just close the modal.
  const dismiss = useCallback(() => {
    if (justSignedUp) {
      handleWelcomeClose();
    } else {
      trackEvent("auth.modal_dismiss", { lang });
      onClose();
    }
  }, [justSignedUp, handleWelcomeClose, onClose, lang]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          trackEvent("auth.sign_in_error", { lang, meta: { code: err.message } });
          setError(err.message || t("authErrorGeneric", lang));
          return;
        }
        trackEvent("auth.sign_in_success", { lang });
        onClose();
        resetForm();
        return;
      }

      const fn = firstName.trim();
      const ln = lastName.trim();
      const nick = nickname.trim();
      if (!fn || !ln) {
        setError(t("authErrorGeneric", lang));
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          data: {
            first_name: fn,
            last_name: ln,
            user_type: "member",
            ...(nick ? { nickname: nick } : {}),
          },
        },
      });

      if (err) {
        trackEvent("auth.sign_up_error", { lang, meta: { code: err.message } });
        setError(err.message || t("authErrorGeneric", lang));
        return;
      }

      if (data.session) {
        // Email confirmation is disabled in Supabase: the user is live
        // immediately. Show the welcome screen instead of closing.
        trackEvent("auth.sign_up_success", { lang });
        setJustSignedUp(true);
        return;
      }

      // Fallback path: if email confirmation is ever re-enabled, surface
      // the existing "check your inbox" message rather than break.
      setInfo(t("authSignUpCheckEmail", lang));
    } finally {
      setBusy(false);
    }
  }

  const labelStyle = { display: "block" as const, fontSize: 12, color: color.textMuted, marginBottom: 4 };
  const btnPrimary: CSSProperties = {
    width: "100%",
    marginTop: 16,
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

  /** Full-width CTA to switch to sign-up — intentionally high-contrast vs. text link. */
  const btnSignUpCta: CSSProperties = {
    width: "100%",
    marginTop: 18,
    padding: "12px 16px",
    borderRadius: 8,
    border: `2px solid ${color.gold}`,
    background: "rgba(201,162,39,0.14)",
    color: color.gold,
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "0.01em",
    cursor: "pointer",
    fontFamily: font.base,
    transition: "background 0.15s, transform 0.15s",
  };

  const linkToOtherMode: CSSProperties = {
    marginTop: 14,
    width: "100%",
    border: "none",
    background: "transparent",
    color: color.textMuted,
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: font.base,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
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
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
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
          onClick={dismiss}
          aria-label={t("authCloseAria", lang)}
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

        {justSignedUp ? (
          <>
            <h2
              id="auth-modal-title"
              style={{ margin: "0 0 16px", fontSize: 18, color: color.gold, fontWeight: 600 }}
            >
              {t("authWelcomeTitle", lang)}
            </h2>
            <p
              style={{
                color: color.textSecondary,
                fontSize: 14,
                lineHeight: 1.55,
                margin: "0 0 24px",
              }}
            >
              {t("authWelcomeBody", lang)}
            </p>
            <button type="button" onClick={handleWelcomeClose} style={btnPrimary}>
              {t("authWelcomeClose", lang)}
            </button>
          </>
        ) : (
          <>
            <h2
              id="auth-modal-title"
              style={{ margin: "0 0 20px", fontSize: 18, color: color.gold, fontWeight: 600 }}
            >
              {mode === "signin" ? t("authModalTitleSignIn", lang) : t("authModalTitleSignUp", lang)}
            </h2>

            <form onSubmit={handleSubmit}>
              {mode === "signup" && (
                <>
                  <label style={labelStyle}>{t("authFirstName", lang)}</label>
                  <input
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={{ ...formInputStyle, marginBottom: 12 }}
                    disabled={busy}
                  />
                  <label style={labelStyle}>{t("authLastName", lang)}</label>
                  <input
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={{ ...formInputStyle, marginBottom: 12 }}
                    disabled={busy}
                  />
                  <label style={labelStyle}>{t("nickname", lang)}</label>
                  <input
                    type="text"
                    autoComplete="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={t("nicknamePlaceholder", lang)}
                    style={{ ...formInputStyle, marginBottom: 6 }}
                    disabled={busy}
                  />
                  <p style={{ color: color.textMuted, fontSize: 11, lineHeight: 1.4, margin: "0 0 12px" }}>
                    {t("nicknameHint", lang)}
                  </p>
                </>
              )}

              <label style={labelStyle}>{t("authEmail", lang)}</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...formInputStyle, marginBottom: 12 }}
                disabled={busy}
                required
              />

              <label style={labelStyle}>{t("authPassword", lang)}</label>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...formInputStyle, marginBottom: 12 }}
                disabled={busy}
                required
                minLength={6}
              />

              {error && (
                <p style={{ color: color.errorText, fontSize: 13, margin: "8px 0 0" }}>{error}</p>
              )}
              {info && (
                <p style={{ color: color.goldLight, fontSize: 13, margin: "8px 0 0" }}>{info}</p>
              )}

              <button type="submit" style={btnPrimary} disabled={busy}>
                {mode === "signin" ? t("authSubmitSignIn", lang) : t("authSubmitSignUp", lang)}
              </button>
            </form>

            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
                style={btnSignUpCta}
              >
                {t("authSwitchToSignUp", lang)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                style={linkToOtherMode}
              >
                {t("authSwitchToSignIn", lang)}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
