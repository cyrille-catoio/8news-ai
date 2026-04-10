"use client";

import { t, type Lang } from "@/lib/i18n";
import {
  color,
  ghostOutlineBtn,
  sectionCard,
  formSectionTitle,
  formInputStyle,
  formTextareaStyle,
  primaryButtonStyle,
} from "@/lib/theme";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

export function TopicsPageCreateView({
  lang,
  error,
  onBack,
  formId,
  setFormId,
  formLabelEn,
  setFormLabelEn,
  formLabelFr,
  setFormLabelFr,
  formDomain,
  setFormDomain,
  formT1,
  setFormT1,
  formT2,
  setFormT2,
  formT3,
  setFormT3,
  formT4,
  setFormT4,
  formT5,
  setFormT5,
  formPromptEn,
  setFormPromptEn,
  formPromptFr,
  setFormPromptFr,
  formPromptLang,
  setFormPromptLang,
  generatingScoring,
  generatingLabels,
  autoFeeds,
  setAutoFeeds,
  saving,
  onGenerateScoring,
  onGenerateLabels,
  onCreate,
}: {
  lang: Lang;
  error: string | null;
  onBack: () => void;
  formId: string;
  setFormId: (v: string) => void;
  formLabelEn: string;
  setFormLabelEn: (v: string) => void;
  formLabelFr: string;
  setFormLabelFr: (v: string) => void;
  formDomain: string;
  setFormDomain: (v: string) => void;
  formT1: string;
  setFormT1: (v: string) => void;
  formT2: string;
  setFormT2: (v: string) => void;
  formT3: string;
  setFormT3: (v: string) => void;
  formT4: string;
  setFormT4: (v: string) => void;
  formT5: string;
  setFormT5: (v: string) => void;
  formPromptEn: string;
  setFormPromptEn: (v: string) => void;
  formPromptFr: string;
  setFormPromptFr: (v: string) => void;
  formPromptLang: "en" | "fr";
  setFormPromptLang: (v: "en" | "fr") => void;
  generatingScoring: boolean;
  generatingLabels: boolean;
  autoFeeds: boolean;
  setAutoFeeds: (v: boolean) => void;
  saving: boolean;
  onGenerateScoring: () => void;
  onGenerateLabels: () => void;
  onCreate: () => void;
}) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...ghostOutlineBtn, marginBottom: 16 }}>
        ← {t("back", lang)}
      </button>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>{t("newTopic", lang)}</h2>
      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={sectionCard}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("labelEn", lang)}</label>
              <input
                value={formLabelEn}
                onChange={(e) => {
                  setFormLabelEn(e.target.value);
                  if (!formId || formId === slugify(formLabelEn)) setFormId(slugify(e.target.value));
                }}
                placeholder="My Topic"
                style={formInputStyle}
              />
            </div>
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("labelFr", lang)}</label>
              <input value={formLabelFr} onChange={(e) => setFormLabelFr(e.target.value)} placeholder="Mon topic" style={formInputStyle} />
            </div>
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("topicSlug", lang)}
              </label>
              <input value={formId} onChange={(e) => setFormId(slugify(e.target.value))} placeholder="my-topic" style={formInputStyle} />
            </div>
          </div>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("scoringDomainLabel", lang)}</label>
            <textarea value={formDomain} onChange={(e) => setFormDomain(e.target.value)} style={formTextareaStyle} placeholder="Description of the domain..." />
          </div>
          <div>
            <button
              type="button"
              onClick={onGenerateLabels}
              disabled={generatingLabels || !formLabelEn.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${color.gold}`,
                background: "transparent",
                color: color.gold,
                cursor: generatingLabels || !formLabelEn.trim() ? "not-allowed" : "pointer",
                opacity: generatingLabels || !formLabelEn.trim() ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {generatingLabels ? `⏳ ${t("generatingAi", lang)}` : `✨ ${t("generateAi", lang)}`}
            </button>
          </div>
        </div>
      </div>

      <div style={sectionCard}>
        <h4 style={formSectionTitle}>{t("scoringCriteria", lang)}</h4>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <button
              type="button"
              onClick={onGenerateScoring}
              disabled={generatingScoring || !formDomain.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${color.gold}`,
                background: "transparent",
                color: color.gold,
                cursor: generatingScoring || !formDomain.trim() ? "not-allowed" : "pointer",
                opacity: generatingScoring || !formDomain.trim() ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {generatingScoring ? `⏳ ${t("generatingAi", lang)}` : `✨ ${t("generateAi", lang)}`}
            </button>
          </div>
          {(
            [
              ["9-10", formT1, setFormT1],
              ["7-8", formT2, setFormT2],
              ["5-6", formT3, setFormT3],
              ["3-4", formT4, setFormT4],
              ["1-2", formT5, setFormT5],
            ] as const
          ).map(([tier, val, setter]) => (
            <div key={tier}>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{tier}</label>
              <textarea value={val} onChange={(e) => setter(e.target.value)} style={formTextareaStyle} />
            </div>
          ))}
        </div>
      </div>

      <div style={sectionCard}>
        <h4 style={formSectionTitle}>
          {t("analysisPrompt", lang)} ({lang === "fr" ? "optionnel" : "optional"})
        </h4>
        <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
          {(["en", "fr"] as const).map((pl) => (
            <button
              key={pl}
              type="button"
              onClick={() => setFormPromptLang(pl)}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${color.border}`,
                borderBottom: formPromptLang === pl ? `2px solid ${color.gold}` : `1px solid ${color.border}`,
                background: formPromptLang === pl ? color.surface : "transparent",
                color: formPromptLang === pl ? color.gold : color.textMuted,
                cursor: "pointer",
                borderRadius: pl === "en" ? "6px 0 0 0" : "0 6px 0 0",
              }}
            >
              {pl.toUpperCase()}
            </button>
          ))}
        </div>
        <textarea
          value={formPromptLang === "en" ? formPromptEn : formPromptFr}
          onChange={(e) => (formPromptLang === "en" ? setFormPromptEn(e.target.value) : setFormPromptFr(e.target.value))}
          placeholder={t("promptPlaceholder", lang)}
          style={{ ...formInputStyle, minHeight: 120, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
        />
        <div style={{ color: color.textDim, fontSize: 11, marginTop: 4 }}>{t("promptMaxInfo", lang)}</div>
      </div>

      <div
        style={{ ...sectionCard, cursor: formDomain.trim() ? "pointer" : "default", opacity: formDomain.trim() ? 1 : 0.5 }}
        onClick={() => {
          if (formDomain.trim()) setAutoFeeds(!autoFeeds);
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <input
            type="checkbox"
            checked={autoFeeds && !!formDomain.trim()}
            disabled={!formDomain.trim()}
            onChange={(e) => setAutoFeeds(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 20,
              height: 20,
              marginTop: 2,
              accentColor: color.gold,
              cursor: formDomain.trim() ? "pointer" : "not-allowed",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ color: color.text, fontSize: 14, fontWeight: 600 }}>🔍 {t("autoFeedSearch", lang)}</div>
            <div style={{ color: color.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{t("autoFeedSearchDesc", lang)}</div>
          </div>
        </div>
      </div>

      <button type="button" onClick={onCreate} disabled={saving || !formId || !formLabelEn || !formLabelFr || !formDomain} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
        {saving ? "..." : t("createBtn", lang)}
      </button>
    </div>
  );
}
