"use client";

import { type CSSProperties, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color } from "@/lib/theme";
import { VoiceAccordion, TTS_VOICES_EN, TTS_VOICES_FR } from "@/app/components/VoiceAccordion";
import { useAuth } from "@/app/providers";
import { isOwnerUser } from "@/lib/user-type";
import { UsersSection } from "@/app/components/UsersSection";
import { MyAccountSection } from "@/app/components/MyAccountSection";

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
}) {
  const { session } = useAuth();
  const user = session?.user ?? null;
  const showUsers = isOwnerUser(user);
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

          {/* ── Users section (owner only) ──────────────────── */}
          {showUsers && <UsersSection lang={lang} />}

    </div>
  );
}
