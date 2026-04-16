"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import {
  color,
  sectionCard,
  formInputStyle,
  primaryButtonStyle,
  dangerButtonStyle,
  spinnerStyle,
} from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

interface Channel {
  id: string;
  channel_id: string;
  handle: string | null;
  title: string;
  thumbnail_url: string | null;
  topic_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface TopicOption {
  id: string;
  label: string;
}

export function YouTubeChannelsPage({ lang }: { lang: Lang }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube-channels", { cache: "no-store" });
      if (res.ok) {
        const data: Channel[] = await res.json();
        setChannels(data);
        return data;
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  useEffect(() => {
    fetch("/api/topics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((tps: Array<{ id: string; labelEn: string; labelFr: string }>) => {
        setTopics(tps.map((t) => ({ id: t.id, label: lang === "fr" ? t.labelFr : t.labelEn })));
      })
      .catch(() => {});
  }, [lang]);

  useEffect(() => {
    (async () => {
      const data = await fetchChannels();
      if (!data) return;
      const needsRefresh = data.some(
        (ch) => !ch.thumbnail_url || ch.title === ch.handle,
      );
      if (needsRefresh) {
        setRefreshing(true);
        try {
          await fetch("/api/youtube-channels", { method: "PATCH" });
          await fetchChannels();
        } catch { /* ignore */ }
        finally { setRefreshing(false); }
      }
    })();
  }, [fetchChannels]);

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim();
    if (!h) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: h }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      setHandle("");
      await fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  async function updateTopic(channelId: string, topicId: string | null) {
    try {
      await fetch(`/api/youtube-channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId }),
      });
      setChannels((prev) =>
        prev.map((ch) => (ch.id === channelId ? { ...ch, topic_id: topicId } : ch)),
      );
    } catch {
      /* ignore */
    }
  }

  async function removeChannel(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/youtube-channels/${id}`, { method: "DELETE" });
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  const headingStyle: CSSProperties = {
    color: color.gold,
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 16,
    marginTop: 0,
  };

  const tableHeaderStyle: CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    color: color.textMuted,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderBottom: `1px solid ${color.border}`,
  };

  const cellStyle: CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: color.textSecondary,
    borderBottom: `1px solid ${color.border}`,
    verticalAlign: "middle",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <span style={spinnerStyle(28)} />
      </div>
    );
  }

  return (
    <div>
      <h2 style={headingStyle}>
        {lang === "fr" ? "Chaînes YouTube" : "YouTube Channels"}
      </h2>

      {/* Add form */}
      <div style={{ ...sectionCard, marginBottom: 24 }}>
        <form onSubmit={addChannel} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={lang === "fr" ? "@handle ou URL de la chaîne" : "@handle or channel URL"}
            style={{ ...formInputStyle, flex: 1, minWidth: 200 }}
            disabled={adding}
          />
          <button type="submit" disabled={adding || !handle.trim()} style={{ ...primaryButtonStyle, opacity: adding || !handle.trim() ? 0.5 : 1 }}>
            {adding ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={spinnerStyle(14, { borderWidth: 2 })} />
                {lang === "fr" ? "Ajout…" : "Adding…"}
              </span>
            ) : (
              lang === "fr" ? "Ajouter" : "Add"
            )}
          </button>
        </form>
        {refreshing && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <span style={spinnerStyle(12, { borderWidth: 2 })} />
            <span style={{ color: color.textMuted, fontSize: 12 }}>
              {lang === "fr" ? "Actualisation des métadonnées…" : "Refreshing metadata…"}
            </span>
          </div>
        )}
        {error && (
          <p style={{ color: color.errorText, fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>
        )}
      </div>

      {/* Channels list */}
      {channels.length === 0 ? (
        <p style={{ color: color.textMuted, fontSize: 14, textAlign: "center", padding: "32px 0" }}>
          {lang === "fr" ? "Aucune chaîne configurée" : "No channels configured"}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>{lang === "fr" ? "Chaîne" : "Channel"}</th>
                <th style={tableHeaderStyle}>Topic</th>
                <th style={tableHeaderStyle}>Handle</th>
                <th style={tableHeaderStyle}>Channel ID</th>
                <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => (
                <tr key={ch.id}>
                  <td style={cellStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {ch.thumbnail_url ? (
                        <img
                          src={ch.thumbnail_url}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 4, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.textDim} strokeWidth="1.5">
                            <polygon points="5,3 19,12 5,21" />
                          </svg>
                        </div>
                      )}
                      <span style={{ color: color.text, fontWeight: 500 }}>{ch.title}</span>
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <select
                      value={ch.topic_id ?? ""}
                      onChange={(e) => updateTopic(ch.id, e.target.value || null)}
                      style={{ ...formInputStyle, maxWidth: 160, padding: "5px 8px", fontSize: 12, background: color.surface }}
                    >
                      <option value="">—</option>
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={cellStyle}>{ch.handle ?? "—"}</td>
                  <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: 11 }}>{ch.channel_id}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => removeChannel(ch.id)}
                      disabled={deleting === ch.id}
                      style={dangerButtonStyle}
                    >
                      {deleting === ch.id ? (
                        <span style={spinnerStyle(14, { borderWidth: 2 })} />
                      ) : (
                        lang === "fr" ? "Supprimer" : "Delete"
                      )}
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
