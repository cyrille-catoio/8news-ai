"use client";

import { useState, type CSSProperties } from "react";
import { color, font, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import type { TopicItem } from "@/lib/types";

export function TopicOnboardingModal({
  open,
  topics,
  lang,
  onComplete,
}: {
  open: boolean;
  topics: TopicItem[];
  lang: Lang;
  onComplete: (topicIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const techTopics = topics.filter((tp) => tp.categoryId === 1 || tp.categoryId === null);

  if (!open || techTopics.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleContinue() {
    setSaving(true);
    // Small delay so the spinner is visible, then hand off to parent
    await new Promise((r) => setTimeout(r, 80));
    onComplete(selected);
    setSaving(false);
  }

  const topicBtn = (id: string): CSSProperties => {
    const active = selected.includes(id);
    return {
      padding: "10px 14px",
      fontSize: 14,
      fontWeight: 600,
      border: `1px solid ${color.gold}`,
      borderRadius: 8,
      cursor: "pointer",
      background: active ? color.gold : "transparent",
      color: active ? "#000" : color.gold,
      transition: "all 0.15s",
      textAlign: "center",
    };
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2100,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: 14,
          padding: "32px 28px",
          fontFamily: font.base,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="onboarding-title"
          style={{ margin: "0 0 10px", fontSize: 20, color: color.gold, fontWeight: 700 }}
        >
          {t("onboardingTitle", lang)}
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: color.textMuted, lineHeight: 1.5 }}>
          {t("onboardingSubtitle", lang)}
        </p>

        {/* Topic grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 10,
            marginBottom: 28,
          }}
        >
          {techTopics.map((tp) => (
            <button
              key={tp.id}
              type="button"
              onClick={() => toggle(tp.id)}
              style={topicBtn(tp.id)}
            >
              {lang === "fr" ? tp.labelFr : tp.labelEn}
            </button>
          ))}
        </div>

        {/* Selected count indicator */}
        <p style={{ margin: "0 0 16px", fontSize: 13, color: color.textMuted }}>
          {selected.length === 0
            ? (lang === "fr" ? "Aucun topic sélectionné — vous verrez tous les topics" : "No topic selected — you'll see all topics")
            : lang === "fr"
            ? `${selected.length} topic${selected.length > 1 ? "s" : ""} sélectionné${selected.length > 1 ? "s" : ""}`
            : `${selected.length} topic${selected.length > 1 ? "s" : ""} selected`}
        </p>

        <button
          type="button"
          onClick={handleContinue}
          disabled={saving}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "none",
            background: color.gold,
            color: "#000",
            fontWeight: 700,
            fontSize: 15,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
            fontFamily: font.base,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {saving && <span style={spinnerStyle(16, { borderWidth: 2 })} />}
          {t("onboardingContinue", lang)}
        </button>
      </div>
    </div>
  );
}
