"use client";

import type { TopicItem } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import {
  color,
  ghostBtn,
  ghostOutlineBtn,
  spinnerStyle,
  sectionCard,
  primaryButtonStyle,
} from "@/lib/theme";

export function TopicsPageListView({
  lang,
  topics,
  loading,
  error,
  onNewTopic,
  onLoadDetail,
  onReorder,
  onToggleDisplay,
}: {
  lang: Lang;
  topics: TopicItem[];
  loading: boolean;
  error: string | null;
  onNewTopic: () => void;
  onLoadDetail: (id: string) => void;
  onReorder: (idA: string, idB: string) => void;
  onToggleDisplay: (id: string, value: boolean) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, margin: 0 }}>{t("topicsTitle", lang)}</h2>
        <button type="button" onClick={onNewTopic} style={primaryButtonStyle}>
          + {t("newTopic", lang)}
        </button>
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <span style={spinnerStyle(24)} />
        </div>
      ) : topics.length === 0 ? (
        <p style={{ color: color.textDim, fontSize: 14, textAlign: "center", padding: "40px 0" }}>{t("topicsEmptyList", lang)}</p>
      ) : (
        <div style={sectionCard}>
          <table className="tp-tb">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>#</th>
                <th>Topic</th>
                <th>{t("feeds", lang)}</th>
                <th className="col-hide">Status</th>
                <th className="col-hide" style={{ textAlign: "center" }}>{t("displayColumn", lang)}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {topics.map((tp, i) => (
                <tr key={tp.id}>
                  <td style={{ whiteSpace: "nowrap", padding: "4px 2px" }}>
                    {i > 0 && (
                      <button type="button" onClick={() => onReorder(tp.id, topics[i - 1].id)} title={t("moveUp", lang)} style={ghostBtn}>
                        ↑
                      </button>
                    )}
                    {i < topics.length - 1 && (
                      <button type="button" onClick={() => onReorder(tp.id, topics[i + 1].id)} title={t("moveDown", lang)} style={ghostBtn}>
                        ↓
                      </button>
                    )}
                  </td>
                  <td style={{ color: color.textDim, fontSize: 11 }}>{i + 1}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => onLoadDetail(tp.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: tp.isActive ? color.gold : color.textDim,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                        padding: 0,
                        textAlign: "left",
                      }}
                    >
                      {lang === "fr" ? tp.labelFr : tp.labelEn}
                    </button>
                  </td>
                  <td>{tp.feedCount}</td>
                  <td className="col-hide">
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: tp.isActive ? "#22c55e" : "#666",
                        marginRight: 6,
                      }}
                    />
                    {tp.isActive ? t("statusActive", lang) : t("statusInactive", lang)}
                  </td>
                  <td className="col-hide" style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => onToggleDisplay(tp.id, !tp.isDisplayed)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 16,
                        padding: "2px 6px",
                        opacity: tp.isDisplayed ? 1 : 0.4,
                      }}
                      title={tp.isDisplayed ? "Visible on homepage" : "Hidden from homepage"}
                    >
                      {tp.isDisplayed ? "👁" : "👁‍🗨"}
                    </button>
                  </td>
                  <td>
                    <button type="button" onClick={() => onLoadDetail(tp.id)} style={ghostOutlineBtn}>
                      {t("editBtn", lang)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
