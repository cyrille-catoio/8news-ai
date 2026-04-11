"use client";

import type { CSSProperties } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { SaveStatus } from "@/hooks/useUserTopics";

export function TopicPersonalizationBar({
  lang,
  isAuthenticated,
  hasPreferences,
  preferenceCount,
  isPersonalizationMode,
  saveStatus,
  onEnterEdit,
  onExitEdit,
  onRequestAuth,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  hasPreferences: boolean;
  preferenceCount: number;
  isPersonalizationMode: boolean;
  saveStatus: SaveStatus;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onRequestAuth: () => void;
}) {
  const barWrap: CSSProperties = {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  };

  const badge: CSSProperties = {
    fontSize: 12,
    lineHeight: 1.2,
    color: color.textMuted,
    padding: "5px 9px",
    borderRadius: 999,
    border: `1px solid ${color.border}`,
    background: "rgba(255,255,255,0.02)",
  };

  const statusSlot: CSSProperties = {
    minWidth: 110,
    display: "inline-flex",
  };

  const actionBtn: CSSProperties = {
    border: `1px solid ${color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: color.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    padding: "6px 10px",
    borderRadius: 999,
    fontFamily: "inherit",
    transition: "all .15s ease",
  };

  const primaryBtn: CSSProperties = {
    ...actionBtn,
    border: `1px solid ${color.gold}`,
    color: "#111",
    background: color.gold,
  };

  // ── Mode édition actif ──────────────────────────────────────────────
  if (isPersonalizationMode) {
    const statusLabel =
      saveStatus === "saving"
        ? t("myTopicsSaving", lang)
        : saveStatus === "saved"
        ? t("myTopicsSaved", lang)
        : null;

    const statusColor =
      saveStatus === "saved"
        ? "#4ade80"
        : saveStatus === "error"
        ? color.errorText
        : color.textMuted;

    return (
      <div style={barWrap}>
        <span style={badge}>{t("myTopicsHint", lang)}</span>
        <button type="button" onClick={onExitEdit} style={primaryBtn}>
          {t("myTopicsDone", lang)}
        </button>
        <span style={statusSlot}>
          {statusLabel ? (
            <span style={{ ...badge, color: statusColor }}>
              {statusLabel}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  // ── Préférences actives ─────────────────────────────────────────────
  if (isAuthenticated && hasPreferences) {
    return (
      <div style={barWrap}>
        <span style={badge}>
          {lang === "fr"
            ? `Mes ${preferenceCount} topics`
            : `My ${preferenceCount} topics`}
        </span>
        <button type="button" onClick={onEnterEdit} style={actionBtn}>
          {t("myTopicsEdit", lang)}
        </button>
      </div>
    );
  }

  // ── Lien "Customize" (connecté sans préférences, ou non connecté) ───
  return (
    <div style={barWrap}>
      <button
        type="button"
        onClick={isAuthenticated ? onEnterEdit : onRequestAuth}
        style={primaryBtn}
        title={!isAuthenticated ? t("myTopicsSignInPrompt", lang) : undefined}
      >
        {t("myTopicsCustomize", lang)}
      </button>
    </div>
  );
}
