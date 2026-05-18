"use client";

import { t, type Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { color, card, primaryButtonStyle } from "@/lib/theme";
import { useUserTopics } from "@/hooks/useUserTopics";
import { TopicToggle } from "@/app/components/app-shell/TopicToggle";

/**
 * « Mes topics » SPA page — visible only to authenticated members.
 *
 * Anonymous users see a sign-in CTA. Members see the topic grid in
 * personalization mode (every topic is a togglable pill) and a « +
 * Nouveau topic » action that bounces back to the Topics admin in
 * create mode.
 *
 * `saveStatus` is mirrored as a small label next to the create button
 * so users get immediate feedback the moment a toggle persists to the
 * server.
 *
 * v2.12 extracted from `src/app/app/page.tsx`. No behavior change.
 */
export function MyTopicsPage({
  lang,
  isAuthenticated,
  topics,
  draftTopicIds,
  saveStatus,
  onTogglePreference,
  onCreateTopic,
  onRequestAuth,
}: {
  lang: Lang;
  isAuthenticated: boolean;
  topics: TopicLabel[];
  draftTopicIds: string[] | null;
  saveStatus: ReturnType<typeof useUserTopics>["saveStatus"];
  onTogglePreference: (id: string) => void;
  onCreateTopic: () => void;
  onRequestAuth: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <section style={{ ...card, padding: "28px 24px", marginTop: 16 }}>
        <h1
          style={{
            color: color.text,
            fontFamily: "ui-serif, Georgia, serif",
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.14,
            margin: "0 0 10px",
          }}
        >
          {t("myTopicsSignInTitle", lang)}
        </h1>
        <p style={{ color: color.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 18px", maxWidth: 640 }}>
          {t("myTopicsSignInBody", lang)}
        </p>
        <button
          type="button"
          onClick={onRequestAuth}
          style={{
            ...primaryButtonStyle,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {t("authSignIn", lang)}
        </button>
      </section>
    );
  }

  return (
    <section>
      <h1
        style={{
          color: color.text,
          fontFamily: "ui-serif, Georgia, serif",
          fontSize: 30,
          fontWeight: 400,
          lineHeight: 1.14,
          marginBottom: 8,
          marginTop: 0,
        }}
      >
        {t("myTopicsPageTitle", lang)}
      </h1>
      <p
        style={{
          color: color.textMuted,
          fontSize: 14,
          marginTop: 0,
          marginBottom: 22,
          lineHeight: 1.6,
          maxWidth: 680,
        }}
      >
        {t("myTopicsPageSubtitle", lang)}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
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
        {saveStatus !== "idle" && (
          <span
            style={{
              color: saveStatus === "error"
                ? color.errorText
                : saveStatus === "saved"
                ? "#4ade80"
                : color.textMuted,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {saveStatus === "saving"
              ? t("myTopicsSaving", lang)
              : saveStatus === "saved"
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
        onTogglePreference={onTogglePreference}
      />
    </section>
  );
}
