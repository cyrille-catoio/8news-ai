"use client";

import type { CSSProperties } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { SaveStatus } from "@/hooks/useUserTopics";

export function TopicPersonalizationBar({
  lang,
  isAuthenticated,
  hasPreferences,
  isPersonalizationMode,
  saveStatus,
  onEnterEdit,
  onExitEdit,
  onCreateTopic,
  onRequestAuth,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  hasPreferences: boolean;
  isPersonalizationMode: boolean;
  saveStatus: SaveStatus;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onCreateTopic: () => void;
  onRequestAuth: () => void;
}) {
  const barWrap: CSSProperties = {
    marginBottom: 14,
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

  const editBtn: CSSProperties = {
    border: `1px dashed ${color.borderLight}`,
    background: "transparent",
    color: color.textMuted,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    padding: "5px 10px",
    borderRadius: 999,
    fontFamily: "inherit",
    transition: "all .15s ease",
    letterSpacing: "0.02em",
  };

  const actionBtn: CSSProperties = {
    border: `1px solid ${color.borderLight}`,
    background: "rgba(255,255,255,0.05)",
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
        {isAuthenticated && (
          <button type="button" onClick={onCreateTopic} style={actionBtn}>
            {t("myTopicsAddNew", lang)}
          </button>
        )}
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

  if (isAuthenticated && hasPreferences) {
    return (
      <div style={barWrap}>
        <button type="button" onClick={onEnterEdit} style={editBtn}>
          ✎ {t("myTopicsEditFull", lang)}
        </button>
      </div>
    );
  }

  return (
    <div style={barWrap}>
      <button
        type="button"
        onClick={isAuthenticated ? onEnterEdit : onRequestAuth}
        style={editBtn}
        title={!isAuthenticated ? t("myTopicsSignInPrompt", lang) : undefined}
      >
        ✎ {t("myTopicsCustomize", lang)}
      </button>
    </div>
  );
}
