"use client";

import { useState, useEffect } from "react";
import type { ChangelogEntry } from "@/lib/types";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, spinnerStyle } from "@/lib/theme";

export function ChangelogPage({ lang }: { lang: Lang }) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const locale = dateLocale(lang);

  useEffect(() => {
    fetch("/api/changelog", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setEntries(json.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("changelog", lang)}
      </h2>

      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <span style={spinnerStyle(28)} />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center" }}>{t("changelogEmpty", lang)}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {entries.map((e, i) => (
            <div
              key={e.id}
              style={{
                padding: "16px 0",
                borderBottom: i < entries.length - 1 ? `1px solid ${color.border}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{
                  display: "inline-block", padding: "2px 10px", borderRadius: 4,
                  fontSize: 13, fontWeight: 700, color: "#000", background: color.gold,
                }}>
                  v{e.version}
                </span>
                <span style={{ color: color.textMuted, fontSize: 12 }}>
                  {new Date(e.created_at).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
              <div style={{ color: color.text, fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                {lang === "fr" ? e.title_fr : e.title_en}
              </div>
              {(lang === "fr" ? e.body_fr : e.body_en) && (
                <div style={{ color: color.textMuted, fontSize: 13, lineHeight: 1.5 }}>
                  {lang === "fr" ? e.body_fr : e.body_en}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
