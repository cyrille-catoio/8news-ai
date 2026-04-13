"use client";

import type { CategoryItem } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import {
  color,
  ghostOutlineBtn,
  sectionCard,
  formSectionTitle,
  formInputStyle,
  formTextareaStyle,
  primaryButtonStyle,
  spinnerStyle,
} from "@/lib/theme";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

const aiBtnStyle = (disabled: boolean) => ({
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600 as const,
  border: `1px solid ${color.gold}`,
  background: "transparent",
  color: color.gold,
  cursor: disabled ? "not-allowed" as const : "pointer" as const,
  opacity: disabled ? 0.5 : 1,
  transition: "all 0.15s",
});

export function TopicsPageCreateView({
  lang,
  error,
  onBack,
  backLabel,
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
  categories,
  formCategoryId,
  setFormCategoryId,
  saving,
  discoveringFeeds,
  addingCreateFeed,
  draftTopicId,
  createFeedName,
  setCreateFeedName,
  createFeedUrl,
  setCreateFeedUrl,
  discoverResult,
  onGenerateScoring,
  onGenerateLabels,
  onGeneratePrompts,
  onCreate,
  onDiscoverFeeds,
  onAddManualFeed,
}: {
  lang: Lang;
  error: string | null;
  onBack: () => void;
  backLabel?: string;
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
  categories: CategoryItem[];
  formCategoryId: number;
  setFormCategoryId: (v: number) => void;
  saving: boolean;
  discoveringFeeds: boolean;
  addingCreateFeed: boolean;
  draftTopicId: string | null;
  createFeedName: string;
  setCreateFeedName: (v: string) => void;
  createFeedUrl: string;
  setCreateFeedUrl: (v: string) => void;
  discoverResult: { added: { name: string; url: string }[]; rejected: { name: string; url: string; reason: string }[] } | null;
  onGenerateScoring: () => void;
  onGenerateLabels: () => void;
  onGeneratePrompts: () => void;
  onCreate: () => Promise<string | null>;
  onDiscoverFeeds: () => void;
  onAddManualFeed: () => void;
}) {
  const canCreateTopic = Boolean(
    formId.trim() &&
      formLabelEn.trim() &&
      formLabelFr.trim() &&
      formDomain.trim() &&
      formT1.trim() &&
      formT2.trim() &&
      formT3.trim() &&
      formT4.trim() &&
      formT5.trim(),
  );

  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...ghostOutlineBtn, marginBottom: 16 }}>
        ← {backLabel ?? t("back", lang)}
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
            <button
              type="button"
              onClick={onGenerateLabels}
              disabled={generatingLabels || !formLabelEn.trim()}
              style={aiBtnStyle(generatingLabels || !formLabelEn.trim())}
            >
              {generatingLabels ? `⏳ ${t("generatingAi", lang)}` : `✨ ${t("generateAi", lang)}`}
            </button>
          </div>
          <div>
            <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("scoringDomainLabel", lang)}</label>
            <textarea value={formDomain} onChange={(e) => setFormDomain(e.target.value)} style={formTextareaStyle} placeholder="Description of the domain..." />
          </div>
        </div>
      </div>

      <div style={sectionCard}>
        <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("categoryColumn", lang)}</label>
        <select
          value={formCategoryId}
          onChange={(e) => setFormCategoryId(Number(e.target.value))}
          style={{ ...formInputStyle, maxWidth: 220, marginTop: 4 }}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{lang === "fr" ? c.labelFr : c.labelEn}</option>
          ))}
        </select>
      </div>

      <div style={sectionCard}>
        <h4 style={formSectionTitle}>{t("scoringCriteria", lang)}</h4>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <button
              type="button"
              onClick={onGenerateScoring}
              disabled={generatingScoring || !formDomain.trim()}
              style={aiBtnStyle(generatingScoring || !formDomain.trim())}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ ...formSectionTitle, marginBottom: 0 }}>{t("analysisPrompt", lang)}</h4>
          <button
            type="button"
            onClick={onGeneratePrompts}
            disabled={!formLabelEn.trim()}
            style={aiBtnStyle(!formLabelEn.trim())}
          >
            ✨ {t("generateAi", lang)}
          </button>
        </div>
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

      <div style={sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h4 style={{ ...formSectionTitle, marginBottom: 0 }}>{t("rssFeedsBoxTitle", lang)}</h4>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: color.gold,
                border: `1px solid ${color.gold}`,
                borderRadius: 999,
                padding: "2px 8px",
                letterSpacing: "0.04em",
              }}
            >
              ✨ {t("generateAi", lang)}
            </span>
          </div>
          {draftTopicId && <span style={{ color: color.gold, fontSize: 11, fontWeight: 600 }}>{t("draftTopicReady", lang)}</span>}
        </div>
        <div style={{ color: color.textDim, fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>{t("rssFeedsBoxDesc", lang)}</div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: "12px", border: `1px solid ${color.border}`, borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ color: color.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              ✨ {t("rssAutoDiscoveryTitle", lang)}
            </div>
            <button
              type="button"
              onClick={onDiscoverFeeds}
              disabled={discoveringFeeds || saving || addingCreateFeed}
              style={aiBtnStyle(discoveringFeeds || saving || addingCreateFeed)}
            >
              {discoveringFeeds ? `⏳ ${t("discoveringFeeds", lang)}` : `✨ ${t("addFeedsByAi", lang)}`}
            </button>
            <div style={{ color: color.textDim, fontSize: 11, marginTop: 6, maxWidth: 520, lineHeight: 1.45 }}>{t("autoFeedSearchDesc", lang)}</div>

            {discoveringFeeds && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={spinnerStyle(14)} />
                <span style={{ color: color.gold, fontSize: 12 }}>{t("discoveringFeeds", lang)}</span>
              </div>
            )}

            {discoverResult && !discoveringFeeds && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${color.border}`,
                  background: "#0a0a0a",
                }}
              >
                {discoverResult.added.length > 0 && (
                  <div style={{ marginBottom: discoverResult.rejected.length > 0 ? 8 : 0 }}>
                    <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 600 }}>
                      {discoverResult.added.length} {t("feedsAdded", lang)}
                    </span>
                    <ul style={{ margin: "6px 0 0 0", paddingLeft: 16 }}>
                      {discoverResult.added.map((f, i) => (
                        <li key={i} style={{ color: color.textSecondary, fontSize: 12, marginBottom: 2 }}>
                          {f.name} — <span style={{ color: color.textDim }}>{f.url}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {discoverResult.rejected.length > 0 && (
                  <div>
                    <span style={{ color: color.textDim, fontSize: 13 }}>
                      {discoverResult.rejected.length} {t("feedsRejected", lang)}
                    </span>
                    <ul style={{ margin: "6px 0 0 0", paddingLeft: 16 }}>
                      {discoverResult.rejected.map((f, i) => (
                        <li key={i} style={{ color: color.textDim, fontSize: 11, marginBottom: 2 }}>
                          {f.name} — {f.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {discoverResult.added.length === 0 && discoverResult.rejected.length === 0 && (
                  <span style={{ color: color.textDim, fontSize: 13 }}>{t("noFeedsFoundAi", lang)}</span>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: "12px", border: `1px solid ${color.border}`, borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ color: color.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {t("rssManualAddTitle", lang)}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={createFeedName}
                onChange={(e) => setCreateFeedName(e.target.value)}
                placeholder={t("feedName", lang)}
                style={{ ...formInputStyle, flex: "1 1 140px" }}
              />
              <input
                value={createFeedUrl}
                onChange={(e) => setCreateFeedUrl(e.target.value)}
                placeholder={t("feedUrl", lang)}
                style={{ ...formInputStyle, flex: "2 1 240px" }}
              />
              <button
                type="button"
                onClick={onAddManualFeed}
                disabled={addingCreateFeed || discoveringFeeds || saving || !createFeedName.trim() || !createFeedUrl.trim()}
                style={{ ...primaryButtonStyle, opacity: addingCreateFeed ? 0.6 : 1, flexShrink: 0 }}
              >
                {addingCreateFeed ? "..." : `+ ${t("addFeed", lang)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button type="button" onClick={onCreate} disabled={saving || !canCreateTopic} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
          {saving ? "..." : t("createBtn", lang)}
        </button>
      </div>
    </div>
  );
}
