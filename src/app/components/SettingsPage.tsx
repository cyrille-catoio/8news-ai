"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { color, sectionCard as sectionStyle, formSectionTitle as sectionTitle, primaryButtonStyle, spinnerStyle } from "@/lib/theme";
import { VoiceAccordion, TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";
import { TopicToggle } from "@/app/components/app-shell/TopicToggle";
import type { useUserTopics } from "@/hooks/useUserTopics";
import { useAuth } from "@/app/providers";
import { MyAccountSection } from "@/app/components/MyAccountSection";
import { CryptoTickerSettingsSection } from "@/app/components/CryptoTickerSettingsPage";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { trackEvent } from "@/lib/track";

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
  topics,
  topicsLoading,
  draftTopicIds,
  topicsSaveStatus,
  onToggleTopicPreference,
  onCreateTopic,
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
  topics: TopicLabel[];
  topicsLoading: boolean;
  draftTopicIds: string[] | null;
  topicsSaveStatus: ReturnType<typeof useUserTopics>["saveStatus"];
  onToggleTopicPreference: (id: string) => void;
  onCreateTopic: () => void;
  onRequestAuth?: () => void;
}) {
  const { session } = useAuth();
  const user = session?.user ?? null;
  const isSignedIn = Boolean(user);
  const [voiceEnOpen, setVoiceEnOpen] = useState(false);
  const [voiceFrOpen, setVoiceFrOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("settingsTitle", lang)}
      </h2>

          {/* ── My account (signed-in users) ─────────────── */}
          {isSignedIn && <MyAccountSection lang={lang} />}

          <SubscriptionPanel lang={lang} onRequestAuth={onRequestAuth} />

          {/* ── My topics (moved here from the general menu) ── */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>{t("myTopicsMenuBtn", lang)}</h4>
            {!isSignedIn ? (
              <>
                <p style={{ color: color.textMuted, fontSize: 13, lineHeight: 1.6, margin: "0 0 14px", maxWidth: 640 }}>
                  {t("myTopicsSignInBody", lang)}
                </p>
                <button
                  type="button"
                  onClick={() => onRequestAuth?.()}
                  style={{ ...primaryButtonStyle, padding: "9px 16px", fontSize: 13, fontWeight: 700 }}
                >
                  {t("authSignIn", lang)}
                </button>
              </>
            ) : topicsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                <span style={spinnerStyle(24)} />
              </div>
            ) : (
              <>
                <p style={{ color: color.textMuted, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px", maxWidth: 680 }}>
                  {t("myTopicsPageSubtitle", lang)}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={onCreateTopic}
                    style={{
                      border: `1px solid ${color.gold}`,
                      background: "#000",
                      color: color.gold,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: "10px 18px",
                      fontSize: 14,
                      fontWeight: 800,
                      borderRadius: 999,
                    }}
                  >
                    {t("myTopicsAddNew", lang)}
                  </button>
                  {topicsSaveStatus !== "idle" && (
                    <span
                      style={{
                        color:
                          topicsSaveStatus === "error"
                            ? color.errorText
                            : topicsSaveStatus === "saved"
                            ? "#4ade80"
                            : color.textMuted,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {topicsSaveStatus === "saving"
                        ? t("myTopicsSaving", lang)
                        : topicsSaveStatus === "saved"
                        ? t("myTopicsSaved", lang)
                        : t("myAccountSaveError", lang)}
                    </span>
                  )}
                </div>
                <TopicToggle
                  topics={topics}
                  topic={null}
                  lang={lang}
                  disabled={false}
                  onChange={() => {}}
                  personalizationMode
                  preferredTopicIds={draftTopicIds}
                  onTogglePreference={onToggleTopicPreference}
                />
              </>
            )}
          </div>

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
                onChange={(e) => {
                  const next = Number(e.target.value);
                  trackEvent("settings.tts_speed_change", { lang, meta: { speed: next } });
                  onTtsSpeedChange(next);
                }}
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
              onChange={(v) => {
                trackEvent("settings.tts_voice_change", {
                  target_id: v,
                  lang,
                  meta: { voiceLang: "en" },
                });
                onTtsVoiceChange(v);
              }}
              open={voiceEnOpen}
              onToggle={() => setVoiceEnOpen(!voiceEnOpen)}
            />
            <VoiceAccordion
              label={lang === "fr" ? "Voix FR" : "Voice FR"}
              voices={TTS_VOICES_FR}
              selected={ttsVoiceFr}
              onChange={(v) => {
                trackEvent("settings.tts_voice_change", {
                  target_id: v,
                  lang,
                  meta: { voiceLang: "fr" },
                });
                onTtsVoiceFrChange(v);
              }}
              open={voiceFrOpen}
              onToggle={() => setVoiceFrOpen(!voiceFrOpen)}
            />
          </div>

          {isSignedIn && <CryptoTickerSettingsSection lang={lang} />}

          {/* Users admin moved to its own owner-only SPA page in v2.7.x —
              reachable from the AppHeader's user-menu dropdown. Keeping the
              Settings page focused on per-account preferences (account
              info, max articles, home thresholds, voice, crypto ticker). */}

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
      trackEvent("pro.reserve", { lang });
      setReserved(true);
      setNewsletterEnabled(true);
      setMessage(
        lang === "fr"
          ? "Pro Early Adopter réservé. Aucun paiement ne sera lancé sans validation."
          : "Pro Early Adopter reserved. No payment will start without your confirmation.",
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
      trackEvent(next ? "newsletter.subscribe" : "newsletter.unsubscribe", {
        lang,
        meta: { source: "settings" },
      });
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
          "Prix Early Adopter 28 € / an au lieu de 88 €, paiement annuel en une fois.",
          "50+ chaînes YouTube incluses par défaut avec résumés IA et transcriptions en anglais et en français — ajoutez jusqu'à 5 chaînes personnelles au choix.",
          "Ajoutez vos propres topics avec découverte IA de flux.",
          "Chat IA ancré dans votre flux d'actualité — posez vos questions sur le briefing du jour, ses notes et ses sources.",
        ]
      : [
          "Early Adopter price €28/year instead of €88, billed annually in one payment.",
          "50+ YouTube channels included by default with AI summaries and transcripts in English and French — add up to 5 personal channels of your choice.",
          "Add your own topics with AI feed discovery.",
          "AI chat grounded in your live news feed — ask anything about today's briefing, notes and source links.",
        ];

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={eyebrowStyle}>{lang === "fr" ? "Abonnement" : "Subscription"}</div>
          <h3 style={titleStyle}>
            {lang === "fr" ? "Réservez Pro Early Adopter." : "Reserve Pro Early Adopter."}
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
                ? "Newsletter quotidienne ON"
                : "Daily newsletter ON"
              : lang === "fr"
              ? "Activer la newsletter quotidienne"
              : "Enable daily newsletter"}
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
