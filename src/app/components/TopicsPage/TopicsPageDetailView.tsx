"use client";

import type { TopicDetail, CategoryItem } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import {
  color,
  ghostOutlineBtn,
  spinnerStyle,
  sectionCard,
  formSectionTitle,
  formInputStyle,
  formTextareaStyle,
  primaryButtonStyle,
  dangerButtonStyle,
} from "@/lib/theme";

export function TopicsPageDetailView({
  lang,
  d,
  error,
  onBack,
  saving,
  editingTopic,
  setEditingTopic,
  editLabelEn,
  setEditLabelEn,
  editLabelFr,
  setEditLabelFr,
  editDomain,
  setEditDomain,
  editT1,
  setEditT1,
  editT2,
  setEditT2,
  editT3,
  setEditT3,
  editT4,
  setEditT4,
  editT5,
  setEditT5,
  categories,
  editCategoryId,
  setEditCategoryId,
  editingPrompt,
  setEditingPrompt,
  promptLang,
  setPromptLang,
  editPromptEn,
  setEditPromptEn,
  editPromptFr,
  setEditPromptFr,
  feedName,
  setFeedName,
  feedUrl,
  setFeedUrl,
  addingFeed,
  discoveringFeeds,
  discoverResult,
  onToggleActive,
  onSaveTopic,
  onDeleteTopic,
  onSavePrompt,
  onAddFeed,
  onDiscoverFeeds,
  onDeleteFeed,
}: {
  lang: Lang;
  d: TopicDetail;
  error: string | null;
  onBack: () => void;
  saving: boolean;
  editingTopic: boolean;
  setEditingTopic: (v: boolean) => void;
  editLabelEn: string;
  setEditLabelEn: (v: string) => void;
  editLabelFr: string;
  setEditLabelFr: (v: string) => void;
  editDomain: string;
  setEditDomain: (v: string) => void;
  editT1: string;
  setEditT1: (v: string) => void;
  editT2: string;
  setEditT2: (v: string) => void;
  editT3: string;
  setEditT3: (v: string) => void;
  editT4: string;
  setEditT4: (v: string) => void;
  editT5: string;
  setEditT5: (v: string) => void;
  categories: CategoryItem[];
  editCategoryId: number;
  setEditCategoryId: (v: number) => void;
  editingPrompt: boolean;
  setEditingPrompt: (v: boolean) => void;
  promptLang: "en" | "fr";
  setPromptLang: (v: "en" | "fr") => void;
  editPromptEn: string;
  setEditPromptEn: (v: string) => void;
  editPromptFr: string;
  setEditPromptFr: (v: string) => void;
  feedName: string;
  setFeedName: (v: string) => void;
  feedUrl: string;
  setFeedUrl: (v: string) => void;
  addingFeed: boolean;
  discoveringFeeds: boolean;
  discoverResult: {
    added: { name: string; url: string }[];
    rejected: { name: string; url: string; reason: string }[];
  } | null;
  onToggleActive: () => void;
  onSaveTopic: () => void;
  onDeleteTopic: (id: string) => void;
  onSavePrompt: () => void;
  onAddFeed: () => void;
  onDiscoverFeeds: () => void;
  onDeleteFeed: (feedId: number) => void;
}) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...ghostOutlineBtn, marginBottom: 16 }}>
        ← {t("back", lang)}
      </button>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 12, marginTop: 0 }}>{lang === "fr" ? d.labelFr : d.labelEn}</h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: d.isActive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${d.isActive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
        }}
      >
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: d.isActive ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ color: d.isActive ? "#22c55e" : "#ef4444", fontSize: 13, fontWeight: 600 }}>
            {d.isActive ? t("statusActive", lang) : t("statusInactive", lang)}
          </span>
          <span style={{ color: color.textDim, fontSize: 11, marginLeft: 8 }}>
            {d.isActive ? t("topicVisibleHome", lang) : t("topicHiddenHome", lang)}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleActive}
          disabled={saving}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            border: `1px solid ${d.isActive ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
            background: "transparent",
            color: d.isActive ? "#ef4444" : "#22c55e",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {d.isActive ? t("disableTopic", lang) : t("enableTopic", lang)}
        </button>
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ ...formSectionTitle, marginBottom: 0 }}>{t("topicInfo", lang)}</h4>
          <button type="button" onClick={() => setEditingTopic(!editingTopic)} style={ghostOutlineBtn}>
            {editingTopic ? t("cancelBtn", lang) : t("editBtn", lang)}
          </button>
        </div>
        {editingTopic ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("labelEn", lang)}</label>
                <input value={editLabelEn} onChange={(e) => setEditLabelEn(e.target.value)} style={formInputStyle} />
              </div>
              <div>
                <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("labelFr", lang)}</label>
                <input value={editLabelFr} onChange={(e) => setEditLabelFr(e.target.value)} style={formInputStyle} />
              </div>
            </div>
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("scoringDomainLabel", lang)}</label>
              <textarea value={editDomain} onChange={(e) => setEditDomain(e.target.value)} style={formTextareaStyle} />
            </div>
            {(
              [
                ["9-10", editT1, setEditT1],
                ["7-8", editT2, setEditT2],
                ["5-6", editT3, setEditT3],
                ["3-4", editT4, setEditT4],
                ["1-2", editT5, setEditT5],
              ] as const
            ).map(([tier, val, setter]) => (
              <div key={tier}>
                <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{tier}</label>
                <textarea value={val} onChange={(e) => setter(e.target.value)} style={formTextareaStyle} />
              </div>
            ))}
            <div>
              <label style={{ color: color.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{t("categoryColumn", lang)}</label>
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(Number(e.target.value))}
                style={{ ...formInputStyle, maxWidth: 220, marginTop: 4 }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{lang === "fr" ? c.labelFr : c.labelEn}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onSaveTopic} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
                {saving ? "..." : t("saveBtn", lang)}
              </button>
              <button type="button" onClick={() => onDeleteTopic(d.id)} style={dangerButtonStyle}>
                {t("deleteBtn", lang)}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <div>
              <span style={{ color: color.textMuted }}>EN:</span> <span style={{ color: color.text }}>{d.labelEn}</span>
            </div>
            <div>
              <span style={{ color: color.textMuted }}>FR:</span> <span style={{ color: color.text }}>{d.labelFr}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ color: color.textMuted, fontWeight: 600 }}>{t("categoryColumn", lang)}:</span>{" "}
              <span style={{ color: color.text }}>{categories.find((c) => c.id === d.categoryId)?.[lang === "fr" ? "labelFr" : "labelEn"] ?? "—"}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ color: color.textMuted, fontWeight: 600 }}>{t("scoringDomainLabel", lang)}:</span>{" "}
              <span style={{ color: color.text }}>{d.scoringDomain}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ color: color.textMuted, fontWeight: 600 }}>{t("scoringCriteria", lang)}:</span>
            </div>
            {([["9-10", d.scoringTier1], ["7-8", d.scoringTier2], ["5-6", d.scoringTier3], ["3-4", d.scoringTier4], ["1-2", d.scoringTier5]] as [string, string][]).map(([tier, val]) => (
              <div key={tier} style={{ paddingLeft: 8, borderLeft: `2px solid ${color.border}` }}>
                <span style={{ color: color.gold, fontSize: 11, fontWeight: 700 }}>{tier}</span>
                <span style={{ color: color.textDim, marginLeft: 8 }}>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ ...formSectionTitle, marginBottom: 0 }}>{t("analysisPrompt", lang)}</h4>
          <button
            type="button"
            onClick={() => {
              if (editingPrompt) {
                setEditPromptEn(d.promptEn);
                setEditPromptFr(d.promptFr);
              }
              setEditingPrompt(!editingPrompt);
            }}
            style={ghostOutlineBtn}
          >
            {editingPrompt ? t("cancelBtn", lang) : t("editBtn", lang)}
          </button>
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
          {(["en", "fr"] as const).map((pl) => (
            <button
              key={pl}
              type="button"
              onClick={() => setPromptLang(pl)}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${color.border}`,
                borderBottom: promptLang === pl ? `2px solid ${color.gold}` : `1px solid ${color.border}`,
                background: promptLang === pl ? color.surface : "transparent",
                color: promptLang === pl ? color.gold : color.textMuted,
                cursor: "pointer",
                borderRadius: pl === "en" ? "6px 0 0 0" : "0 6px 0 0",
              }}
            >
              {pl.toUpperCase()}
            </button>
          ))}
        </div>

        {editingPrompt ? (
          <>
            <textarea
              value={promptLang === "en" ? editPromptEn : editPromptFr}
              onChange={(e) => (promptLang === "en" ? setEditPromptEn(e.target.value) : setEditPromptFr(e.target.value))}
              style={{ ...formInputStyle, minHeight: 200, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
            />
            {!(promptLang === "en" ? editPromptEn : editPromptFr).includes("{{max}}") && (
              <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 6 }}>{t("promptMissingMax", lang)}</div>
            )}
            <div style={{ color: color.textDim, fontSize: 11, marginTop: 4 }}>{t("promptMaxInfo", lang)}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={onSavePrompt} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
                {saving ? "..." : t("saveBtn", lang)}
              </button>
            </div>
          </>
        ) : (
          <>
            <pre
              style={{
                color: color.textDim,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                padding: "10px 12px",
                background: "#0a0a0a",
                borderRadius: 6,
                border: `1px solid ${color.border}`,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {promptLang === "en" ? d.promptEn : d.promptFr}
            </pre>
            {!(promptLang === "en" ? d.promptEn : d.promptFr).includes("{{max}}") && (d.promptEn || d.promptFr) && (
              <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 6 }}>{t("promptMissingMax", lang)}</div>
            )}
            <div style={{ color: color.textDim, fontSize: 11, marginTop: 4 }}>{t("promptMaxInfo", lang)}</div>
          </>
        )}
      </div>

      <div style={sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ ...formSectionTitle, marginBottom: 0 }}>
            {t("feeds", lang)} ({d.feeds.length})
          </h4>
        </div>

        {discoveringFeeds && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", marginBottom: 8 }}>
            <span style={spinnerStyle(18, { borderWidth: 2 })} />
            <span style={{ color: color.gold, fontSize: 13, fontWeight: 500 }}>🔍 {t("discoveringFeeds", lang)}</span>
          </div>
        )}

        {discoverResult && !discoveringFeeds && (
          <div style={{ padding: "10px 12px", borderRadius: 6, background: "#0a0a0a", border: `1px solid ${color.border}`, marginBottom: 10, fontSize: 13 }}>
            {discoverResult.added.length > 0 && (
              <div style={{ color: "#22c55e" }}>
                ✅ {discoverResult.added.length} {t("feedsAdded", lang)}
              </div>
            )}
            {discoverResult.rejected.length > 0 && (
              <div style={{ color: "#f59e0b", marginTop: discoverResult.added.length > 0 ? 4 : 0 }}>
                ❌ {discoverResult.rejected.length} {t("feedsRejected", lang)}
              </div>
            )}
            {discoverResult.added.length === 0 && discoverResult.rejected.length === 0 && (
              <div style={{ color: color.textDim }}>{t("noFeedsFoundAi", lang)}</div>
            )}
          </div>
        )}

        {d.feeds.length === 0 && !discoveringFeeds ? (
          <p style={{ color: color.textDim, fontSize: 13, margin: 0 }}>{t("noFeeds", lang)}</p>
        ) : d.feeds.length > 0 ? (
          <div style={{ display: "grid", gap: 0 }}>
            {d.feeds.map((f, i) => {
              let domain = "";
              try {
                domain = new URL(f.url).hostname.replace("www.", "");
              } catch {
                /* */
              }
              return (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: i < d.feeds.length - 1 ? `1px solid ${color.border}` : "none",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: color.text, fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                    <div style={{ color: color.textDim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: color.textDim, textDecoration: "none" }}>
                        {domain} ↗
                      </a>
                    </div>
                  </div>
                  <button type="button" onClick={() => onDeleteFeed(f.id)} style={{ ...dangerButtonStyle, padding: "4px 8px", fontSize: 12 }}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={feedName} onChange={(e) => setFeedName(e.target.value)} placeholder={t("feedName", lang)} style={{ ...formInputStyle, flex: "1 1 120px" }} />
            <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder={t("feedUrl", lang)} style={{ ...formInputStyle, flex: "2 1 200px" }} />
            <button
              type="button"
              onClick={onAddFeed}
              disabled={addingFeed || discoveringFeeds || !feedName.trim() || !feedUrl.trim()}
              style={{ ...primaryButtonStyle, opacity: addingFeed ? 0.6 : 1, flexShrink: 0 }}
            >
              {addingFeed ? "..." : "+ " + t("addFeed", lang)}
            </button>
          </div>
          <button
            type="button"
            onClick={onDiscoverFeeds}
            disabled={discoveringFeeds || addingFeed}
            style={{
              marginTop: 10,
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${color.gold}`,
              background: "transparent",
              color: color.gold,
              cursor: discoveringFeeds || addingFeed ? "not-allowed" : "pointer",
              opacity: discoveringFeeds || addingFeed ? 0.5 : 1,
              transition: "all 0.15s",
            }}
          >
            {discoveringFeeds ? `⏳ ${t("discoveringFeeds", lang)}` : `✨ ${t("addFeedsByAi", lang)}`}
          </button>
          <div style={{ color: color.textDim, fontSize: 11, marginTop: 6, maxWidth: 420, lineHeight: 1.45 }}>{t("autoFeedSearchDesc", lang)}</div>
        </div>
      </div>
    </div>
  );
}
