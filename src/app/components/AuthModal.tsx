"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import { color, font, formInputStyle } from "@/lib/theme";

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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetForm = useCallback(() => {
    setError(null);
    setInfo(null);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      setMode("signin");
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          setError(err.message || t("authErrorGeneric", lang));
          return;
        }
        onClose();
        resetForm();
        return;
      }

      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn || !ln) {
        setError(t("authErrorGeneric", lang));
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          data: { first_name: fn, last_name: ln, user_type: "member" },
        },
      });

      if (err) {
        setError(err.message || t("authErrorGeneric", lang));
        return;
      }

      if (data.session) {
        onClose();
        resetForm();
        return;
      }

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
        if (e.target === e.currentTarget) onClose();
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
          onClick={onClose}
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

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          style={{
            marginTop: 14,
            width: "100%",
            border: "none",
            background: "transparent",
            color: color.gold,
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: font.base,
          }}
        >
          {mode === "signin" ? t("authSwitchToSignUp", lang) : t("authSwitchToSignIn", lang)}
        </button>
      </div>
    </div>
  );
}
