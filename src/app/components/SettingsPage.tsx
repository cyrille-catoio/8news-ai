"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color } from "@/lib/theme";
import { VoiceAccordion, TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";
import { useAuth } from "@/app/providers";
import { MyAccountSection } from "@/app/components/MyAccountSection";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type MonetizationMetadata = {
  plan_intent?: unknown;
  pro_interest?: unknown;
  pro_interest_at?: unknown;
  daily_newsletter?: unknown;
};

export function SettingsPage({
  lang,
  maxArticles,
  onMaxArticlesChange,
  ttsSpeed,
  onTtsSpeedChange,
  ttsVoice,
  onTtsVoiceChange,
  ttsVoiceFr,
  onTtsVoiceFrChange,
  homeMinScoreArticle,
  onHomeMinScoreArticleChange,
  homeMinScoreVideo,
  onHomeMinScoreVideoChange,
  onRequestAuth,
}: {
  lang: Lang;
  maxArticles: number;
  onMaxArticlesChange: (v: number) => void;
  ttsSpeed: number;
  onTtsSpeedChange: (v: number) => void;
  ttsVoice: string;
  onTtsVoiceChange: (v: string) => void;
  ttsVoiceFr: string;
  onTtsVoiceFrChange: (v: string) => void;
  homeMinScoreArticle: number;
  onHomeMinScoreArticleChange: (v: number) => void;
  homeMinScoreVideo: number;
  onHomeMinScoreVideoChange: (v: number) => void;
  onRequestAuth?: () => void;
}) {
  const { session } = useAuth();
  const user = session?.user ?? null;
  const isSignedIn = Boolean(user);
  const [voiceEnOpen, setVoiceEnOpen] = useState(false);
  const [voiceFrOpen, setVoiceFrOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const sectionStyle: CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 16,
  };

  const sectionTitle: CSSProperties = {
    color: color.gold,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 14,
    marginTop: 0,
  };

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("settingsTitle", lang)}
      </h2>

          <SubscriptionPanel lang={lang} onRequestAuth={onRequestAuth} />

          {/* ── My account (signed-in users) ─────────────── */}
          {isSignedIn && <MyAccountSection lang={lang} />}

          {/* ── Preferences section ──────────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{t("preferencesSection", lang)}</h4>

            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                {t("maxArticles", lang)}
                <button
                  onClick={() => setInfoOpen(!infoOpen)}
                  style={{
                    background: "none",
                    border: `1.5px solid ${color.gold}`,
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    color: color.gold,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: "16px",
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                  aria-label="Info"
                >
                  i
                </button>
              </label>
              <input
                type="range"
                min={3}
                max={100}
                step={1}
                value={maxArticles}
                onChange={(e) => onMaxArticlesChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: color.gold, cursor: "pointer" }}
              />
              <span style={{ color: color.gold, fontSize: 15, fontWeight: 600, minWidth: 28, textAlign: "center" }}>
                {maxArticles}
              </span>
              {infoOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    background: color.surface,
                    border: `1px solid ${color.gold}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: color.text,
                    zIndex: 10,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  {t("maxArticlesInfo", lang)}
                </div>
              )}
            </div>

          </div>

          {/* ── Home thresholds section ──────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>
              {lang === "fr" ? "Page d'accueil" : "Home page"}
            </h4>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {lang === "fr" ? "Score min. articles" : "Min. article score"}
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={homeMinScoreArticle}
                onChange={(e) => onHomeMinScoreArticleChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: color.gold, cursor: "pointer" }}
              />
              <span style={{ color: color.gold, fontSize: 15, fontWeight: 600, minWidth: 36, textAlign: "center" }}>
                {homeMinScoreArticle}/10
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {lang === "fr" ? "Score min. vidéos" : "Min. video score"}
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={homeMinScoreVideo}
                onChange={(e) => onHomeMinScoreVideoChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: color.gold, cursor: "pointer" }}
              />
              <span style={{ color: color.gold, fontSize: 15, fontWeight: 600, minWidth: 36, textAlign: "center" }}>
                {homeMinScoreVideo}/10
              </span>
            </div>

            <p style={{ color: color.textMuted, fontSize: 12, lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
              {lang === "fr"
                ? "Filtre minimum pour le top story et la top vidéo de la home. Défauts : 9 / 8."
                : "Minimum filter for the home page's top story and top video. Defaults: 9 / 8."}
            </p>
          </div>

          {/* ── Voice section ─────────────────────────────── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{lang === "fr" ? "Voix" : "Voice"}</h4>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ color: color.textLabel, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {lang === "fr" ? "Vitesse" : "Speed"}
              </label>
              <input
                type="range"
                min={0.7}
                max={1.2}
                step={0.05}
                value={ttsSpeed}
                onChange={(e) => onTtsSpeedChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: color.gold, cursor: "pointer" }}
              />
              <span style={{ color: color.gold, fontSize: 15, fontWeight: 600, minWidth: 40, textAlign: "center" }}>
                {ttsSpeed.toFixed(2)}x
              </span>
            </div>

            <VoiceAccordion
              label={lang === "fr" ? "Voix EN" : "Voice EN"}
              voices={TTS_VOICES_EN}
              selected={ttsVoice}
              onChange={onTtsVoiceChange}
              open={voiceEnOpen}
              onToggle={() => setVoiceEnOpen(!voiceEnOpen)}
            />
            <VoiceAccordion
              label={lang === "fr" ? "Voix FR" : "Voice FR"}
              voices={TTS_VOICES_FR}
              selected={ttsVoiceFr}
              onChange={onTtsVoiceFrChange}
              open={voiceFrOpen}
              onToggle={() => setVoiceFrOpen(!voiceFrOpen)}
            />
          </div>

          {/* Users admin moved to its own owner-only SPA page in v2.7.x —
              reachable from the AppHeader's user-menu dropdown. Keeping the
              Settings page focused on per-account preferences (account
              info, max articles, home thresholds, voice). */}

    </div>
  );
}

function SubscriptionPanel({
  lang,
  onRequestAuth,
}: {
  lang: Lang;
  onRequestAuth?: () => void;
}) {
  const { session } = useAuth();
  const user = session?.user ?? null;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [reserved, setReserved] = useState(false);
  const [newsletterEnabled, setNewsletterEnabled] = useState(false);
  const [busy, setBusy] = useState<"reserve" | "newsletter" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const meta = (user?.user_metadata ?? {}) as MonetizationMetadata;
    setReserved(meta.plan_intent === "pro" || meta.pro_interest === true);
    setNewsletterEnabled(meta.daily_newsletter === true);
  }, [user?.id, user?.user_metadata]);

  const persistMetadata = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!user) {
        onRequestAuth?.();
        return false;
      }

      const { error } = await supabase.auth.updateUser({
        data: { ...(user.user_metadata ?? {}), ...patch },
      });
      if (error) throw error;
      return true;
    },
    [onRequestAuth, supabase, user],
  );

  const reservePro = useCallback(async () => {
    if (!user) {
      onRequestAuth?.();
      return;
    }
    setBusy("reserve");
    setMessage(null);
    try {
      await persistMetadata({
        plan_intent: "pro",
        pro_interest: true,
        pro_interest_at: new Date().toISOString(),
        daily_newsletter: true,
      });
      setReserved(true);
      setNewsletterEnabled(true);
      setMessage(
        lang === "fr"
          ? "Pro fondateur réservé. Aucun paiement ne sera lancé sans validation."
          : "Founder Pro reserved. No payment will start without your confirmation.",
      );
    } catch {
      setMessage(lang === "fr" ? "Impossible d'enregistrer la réservation." : "Could not save the reservation.");
    } finally {
      setBusy(null);
    }
  }, [lang, onRequestAuth, persistMetadata, user]);

  const toggleNewsletter = useCallback(async () => {
    if (!user) {
      onRequestAuth?.();
      return;
    }
    const next = !newsletterEnabled;
    setBusy("newsletter");
    setMessage(null);
    try {
      await persistMetadata({ daily_newsletter: next });
      setNewsletterEnabled(next);
      setMessage(
        next
          ? lang === "fr"
            ? "Brief quotidien activé."
            : "Daily brief enabled."
          : lang === "fr"
          ? "Brief quotidien désactivé."
          : "Daily brief disabled.",
      );
    } catch {
      setMessage(lang === "fr" ? "Impossible de mettre à jour le brief." : "Could not update the brief.");
    } finally {
      setBusy(null);
    }
  }, [lang, newsletterEnabled, onRequestAuth, persistMetadata, user]);

  const panelStyle: CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(201,162,39,0.10), rgba(201,162,39,0.02) 42%, rgba(255,255,255,0.02)), #111",
    border: `1px solid ${reserved ? color.gold : "rgba(201,162,39,0.34)"}`,
    borderRadius: 8,
    padding: "18px 20px",
    marginBottom: 16,
  };

  const eyebrowStyle: CSSProperties = {
    color: color.gold,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    marginBottom: 8,
  };

  const titleStyle: CSSProperties = {
    color: color.text,
    fontFamily: "ui-serif, Georgia, serif",
    fontSize: 24,
    fontWeight: 400,
    lineHeight: 1.16,
    letterSpacing: 0,
    margin: 0,
  };

  const primaryButton: CSSProperties = {
    border: "none",
    borderRadius: 6,
    background: reserved ? "rgba(74,222,128,0.16)" : color.gold,
    color: reserved ? "#4ade80" : "#000",
    cursor: busy ? "wait" : reserved ? "default" : "pointer",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 14px",
    whiteSpace: "nowrap",
  };

  const secondaryButton: CSSProperties = {
    border: `1px solid ${newsletterEnabled ? color.gold : color.border}`,
    borderRadius: 6,
    background: newsletterEnabled ? "rgba(201,162,39,0.12)" : "transparent",
    color: newsletterEnabled ? color.gold : color.textMuted,
    cursor: busy ? "wait" : "pointer",
    fontSize: 12,
    fontWeight: 700,
    padding: "9px 12px",
    whiteSpace: "nowrap",
  };

  const benefits =
    lang === "fr"
      ? [
          "Prix fondateur 88 € / an, facturation annuelle uniquement.",
          "Topics sur mesure avec découverte IA des flux.",
          "Plus de résumés YouTube et suivi de chaînes favorites.",
        ]
      : [
          "Founder price $88/year, annual billing only.",
          "Custom topics with AI feed discovery.",
          "More YouTube summaries and favorite channel monitoring.",
        ];

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={eyebrowStyle}>{lang === "fr" ? "Abonnement" : "Subscription"}</div>
          <h3 style={titleStyle}>
            {lang === "fr" ? "Réservez le Pro fondateur." : "Reserve Founder Pro."}
          </h3>
          <p style={{ color: color.textSecondary, fontSize: 14, lineHeight: 1.55, margin: "10px 0 0", maxWidth: 680 }}>
            {lang === "fr"
              ? "Le gratuit reste parfait pour tester. Pro est pensé pour ceux qui veulent faire de 8news leur cockpit quotidien de veille."
              : "Free is perfect for trying the product. Pro is for people who want 8news as their daily intelligence cockpit."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => void reservePro()}
            disabled={busy !== null || reserved}
            style={primaryButton}
          >
            {reserved
              ? lang === "fr"
                ? "Pro réservé"
                : "Pro reserved"
              : busy === "reserve"
              ? lang === "fr"
                ? "Réservation..."
                : "Reserving..."
              : lang === "fr"
              ? "Réserver Pro"
              : "Reserve Pro"}
          </button>
          <button
            type="button"
            onClick={() => void toggleNewsletter()}
            disabled={busy !== null}
            style={secondaryButton}
          >
            {newsletterEnabled
              ? lang === "fr"
                ? "Brief quotidien ON"
                : "Daily brief ON"
              : lang === "fr"
              ? "Activer le brief quotidien"
              : "Enable daily brief"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 16 }}>
        {benefits.map((benefit) => (
          <div
            key={benefit}
            style={{
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              color: color.textSecondary,
              fontSize: 12,
              lineHeight: 1.4,
              padding: "10px 11px",
            }}
          >
            {benefit}
          </div>
        ))}
      </div>

      <p style={{ color: color.textMuted, fontSize: 12, lineHeight: 1.45, margin: "12px 0 0" }}>
        {message ??
          (user
            ? lang === "fr"
              ? "Réserver inscrit votre intérêt dans le compte. Aucune carte bancaire n'est demandée aujourd'hui."
              : "Reserving stores your interest on the account. No card is requested today."
            : lang === "fr"
            ? "Connectez-vous ou créez un compte pour réserver votre place Pro."
            : "Sign in or create an account to reserve your Pro spot.")}
      </p>
    </section>
  );
}
