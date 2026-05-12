"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { t, dateLocale, type Lang } from "@/lib/i18n";
import { color, spinnerStyle } from "@/lib/theme";
import type { AppUserType } from "@/lib/user-type";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: AppUserType;
  /**
   * v2.6.12+ — default UI language used on the user's next sign-in.
   * Source of truth: `auth.users.user_metadata.preferred_lang`. `null`
   * when no preference has been saved yet (the user falls back through
   * `resolveServerLang()`'s default chain: cookie → app default).
   */
  preferredLang: "en" | "fr" | null;
  /**
   * v2.6.12+ — opt-in for the morning daily newsletter. Source of
   * truth: `auth.users.user_metadata.daily_newsletter` (boolean,
   * defaults to false when unset).
   */
  dailyNewsletter: boolean;
  createdAt: string;
}

const sectionStyle: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: "16px 20px",
  marginBottom: 16,
};

const sectionTitle: CSSProperties = {
  color: color.gold,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 14,
  marginTop: 0,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 11,
  fontWeight: 600,
  color: color.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderBottom: `1px solid ${color.border}`,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 8px",
  fontSize: 13,
  color: color.text,
  borderBottom: `1px solid ${color.border}`,
  verticalAlign: "middle",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  borderRadius: 4,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.text,
  fontSize: 13,
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  width: "auto",
  cursor: "pointer",
};

const iconBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ stroke = color.textMuted }: { stroke?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Daily newsletter opt-in status: green check when enabled, red X
 *  when disabled. Replaces the previous checkbox in read mode; in
 *  edit mode the same glyph is clickable to flip the draft value. */
function DailyNewsletterStatus({
  enabled,
  interactive,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean;
  interactive?: boolean;
  onToggle?: () => void;
  ariaLabel: string;
}) {
  const glyph = enabled ? <CheckIcon /> : <XIcon stroke="#ef4444" />;
  if (!interactive) {
    return (
      <span
        role="img"
        aria-label={ariaLabel}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        {glyph}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-pressed={enabled}
      style={{
        ...iconBtnStyle,
        padding: 2,
        borderRadius: 4,
      }}
    >
      {glyph}
    </button>
  );
}

/** Paper-plane glyph used by the « send latest newsletter » action
 *  (v2.6.13+). Same outline weight as the pencil so the row of icons
 *  reads as a single visual family despite the colour differences. */
function PaperPlaneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function UsersSection({ lang }: { lang: Lang }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editType, setEditType] = useState<AppUserType>("member");
  const [editLang, setEditLang] = useState<"en" | "fr">("en");
  const [editDailyNewsletter, setEditDailyNewsletter] = useState(false);
  const [saving, setSaving] = useState(false);
  /** One-click newsletter opt-in from the read-mode newsletter cell.
   *  Keeps the common path (subscribe a user) out of the heavier
   *  pencil-edit flow while preserving edit mode for full metadata
   *  changes and unsubscribe. */
  const [enrollingNewsletterId, setEnrollingNewsletterId] = useState<string | null>(null);
  /** Per-row spinner for the « send newsletter » action — the row's
   *  paper-plane icon spins while the request is in flight so the
   *  operator can't double-fire. */
  const [sendingId, setSendingId] = useState<string | null>(null);
  /** Transient banner displayed above the table after a send completes.
   *  Self-clears after 6 s. `tone` drives the color. */
  const [notice, setNotice] = useState<
    { tone: "ok" | "error"; message: string } | null
  >(null);

  const locale = dateLocale(lang);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError(t("usersLoadError", lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEditFirstName(u.firstName);
    setEditLastName(u.lastName);
    setEditType(u.userType);
    // Default to "en" when the user has no saved preference — the
    // dropdown is binary, no « auto » option exposed to the admin
    // (matches the API which also accepts en|fr only).
    setEditLang(u.preferredLang ?? "en");
    setEditDailyNewsletter(u.dailyNewsletter);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  /** Owner-only test send: POST /api/users/[id]/send-newsletter. Fires
   *  the same renderer as the daily cron against a real inbox.
   *  Confirm-gated so a misclick doesn't email the user. The notice
   *  banner shows for 6 s, then fades. */
  async function sendTestNewsletter(u: UserRow) {
    if (sendingId) return;
    const ok = window.confirm(
      t("usersSendNewsletterConfirm", lang).replace("{email}", u.email),
    );
    if (!ok) return;
    setSendingId(u.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/users/${u.id}/send-newsletter`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        summaryDate?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        const detail = json.error || `HTTP ${res.status}`;
        setNotice({
          tone: "error",
          message: t("usersSendNewsletterError", lang).replace(
            "{detail}",
            detail,
          ),
        });
      } else {
        setNotice({
          tone: "ok",
          message: t("usersSendNewsletterSuccess", lang)
            .replace("{email}", u.email)
            .replace("{date}", json.summaryDate ?? "—"),
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      setNotice({
        tone: "error",
        message: t("usersSendNewsletterError", lang).replace(
          "{detail}",
          detail,
        ),
      });
    } finally {
      setSendingId(null);
      // Self-clear after 6 s so a stale banner doesn't linger when the
      // operator moves on to other rows.
      window.setTimeout(() => setNotice(null), 6_000);
    }
  }

  async function enrollNewsletter(u: UserRow) {
    if (u.dailyNewsletter || enrollingNewsletterId) return;
    setEnrollingNewsletterId(u.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyNewsletter: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUsers((cur) =>
        cur.map((row) =>
          row.id === u.id ? { ...row, dailyNewsletter: true } : row,
        ),
      );
      setNotice({
        tone: "ok",
        message: t("usersNewsletterSubscribeSuccess", lang).replace(
          "{email}",
          u.email,
        ),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      setNotice({
        tone: "error",
        message: t("usersNewsletterSubscribeError", lang).replace(
          "{detail}",
          detail,
        ),
      });
    } finally {
      setEnrollingNewsletterId(null);
      window.setTimeout(() => setNotice(null), 6_000);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          userType: editType,
          preferredLang: editLang,
          dailyNewsletter: editDailyNewsletter,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      await loadUsers();
    } catch {
      setError(t("usersSaveError", lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={sectionStyle}>
      <h4 style={sectionTitle}>{t("usersSection", lang)}</h4>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
          <span style={spinnerStyle(16)} />
          <span style={{ color: color.textMuted, fontSize: 13 }}>{t("usersLoading", lang)}</span>
        </div>
      ) : error && users.length === 0 ? (
        <p style={{ color: color.errorText, fontSize: 13 }}>{error}</p>
      ) : (
        <>
          {error && <p style={{ color: color.errorText, fontSize: 13, marginBottom: 8 }}>{error}</p>}
          {notice && (
            <div
              role="status"
              style={{
                marginBottom: 10,
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 13,
                lineHeight: 1.4,
                color:
                  notice.tone === "ok" ? "#4ade80" : color.errorText,
                background:
                  notice.tone === "ok"
                    ? "rgba(74, 222, 128, 0.08)"
                    : "rgba(239, 68, 68, 0.08)",
                border: `1px solid ${
                  notice.tone === "ok"
                    ? "rgba(74, 222, 128, 0.35)"
                    : "rgba(239, 68, 68, 0.35)"
                }`,
              }}
            >
              {notice.message}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("usersLastName", lang)}</th>
                  <th style={thStyle}>{t("usersFirstName", lang)}</th>
                  <th style={thStyle}>{t("usersEmail", lang)}</th>
                  <th style={thStyle}>{t("usersType", lang)}</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>{t("usersLanguage", lang)}</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>{t("usersDailyNewsletter", lang)}</th>
                  <th style={thStyle}>{t("usersCreatedAt", lang)}</th>
                  <th style={{ ...thStyle, textAlign: "center", width: 88 }}>{t("usersActions", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isEditing = editingId === u.id;
                  return (
                    <tr key={u.id} style={{ background: isEditing ? "rgba(201,162,39,0.06)" : "transparent" }}>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <input
                            value={editLastName}
                            onChange={(e) => setEditLastName(e.target.value)}
                            style={inputStyle}
                            disabled={saving}
                          />
                        ) : (
                          u.lastName
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <input
                            value={editFirstName}
                            onChange={(e) => setEditFirstName(e.target.value)}
                            style={inputStyle}
                            disabled={saving}
                          />
                        ) : (
                          u.firstName
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: color.textMuted, fontSize: 12 }}>{u.email}</td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as AppUserType)}
                            style={selectStyle}
                            disabled={saving}
                          >
                            <option value="member">member</option>
                            <option value="owner">owner</option>
                          </select>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: u.userType === "owner" ? "rgba(201,162,39,0.15)" : "rgba(255,255,255,0.06)",
                              color: u.userType === "owner" ? color.gold : color.textMuted,
                              border: `1px solid ${u.userType === "owner" ? color.gold : color.border}`,
                            }}
                          >
                            {u.userType}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {isEditing ? (
                          <select
                            value={editLang}
                            onChange={(e) => setEditLang(e.target.value as "en" | "fr")}
                            style={selectStyle}
                            disabled={saving}
                            aria-label={t("usersLanguage", lang)}
                          >
                            <option value="en">EN</option>
                            <option value="fr">FR</option>
                          </select>
                        ) : (
                          // `—` for users who never picked a language —
                          // `resolveServerLang()` will fall back to
                          // cookie / app default until the admin (or
                          // the user themselves via the SeoNavBar /
                          // SPA toggle) writes one.
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: u.preferredLang
                                ? "rgba(201,162,39,0.10)"
                                : "transparent",
                              color: u.preferredLang ? color.gold : color.textMuted,
                              border: `1px solid ${
                                u.preferredLang ? color.gold : color.border
                              }`,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              fontFamily: "ui-monospace, Menlo, monospace",
                            }}
                          >
                            {u.preferredLang ?? "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          <DailyNewsletterStatus
                            enabled={isEditing ? editDailyNewsletter : u.dailyNewsletter}
                            interactive={isEditing && !saving}
                            onToggle={
                              isEditing && !saving
                                ? () => setEditDailyNewsletter((v) => !v)
                                : undefined
                            }
                            ariaLabel={t("usersDailyNewsletter", lang)}
                          />
                          {!isEditing && u.dailyNewsletter && (
                            <span
                              style={{
                                color: "#4ade80",
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                              }}
                            >
                              {t("usersNewsletterSubscribed", lang)}
                            </span>
                          )}
                          {!isEditing && !u.dailyNewsletter && (
                            <button
                              type="button"
                              onClick={() => void enrollNewsletter(u)}
                              disabled={enrollingNewsletterId === u.id}
                              aria-label={t("usersNewsletterSubscribeAria", lang).replace(
                                "{email}",
                                u.email,
                              )}
                              style={{
                                border: `1px solid ${color.gold}`,
                                borderRadius: 999,
                                background: "rgba(201,162,39,0.10)",
                                color: color.gold,
                                cursor:
                                  enrollingNewsletterId === u.id
                                    ? "wait"
                                    : "pointer",
                                fontSize: 11,
                                fontWeight: 700,
                                lineHeight: 1,
                                padding: "5px 9px",
                                minWidth: 66,
                              }}
                            >
                              {enrollingNewsletterId === u.id ? (
                                <span style={spinnerStyle(11)} />
                              ) : (
                                t("usersNewsletterSubscribeButton", lang)
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: color.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>
                        {new Date(u.createdAt).toLocaleDateString(locale)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            <button
                              type="button"
                              onClick={() => void saveEdit(u.id)}
                              disabled={saving}
                              aria-label={t("usersSaveAria", lang)}
                              style={{ ...iconBtnStyle, opacity: saving ? 0.5 : 1 }}
                            >
                              <CheckIcon />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={saving}
                              aria-label={t("usersCancelAria", lang)}
                              style={iconBtnStyle}
                            >
                              <XIcon />
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              aria-label={t("usersActions", lang)}
                              style={iconBtnStyle}
                            >
                              <PencilIcon />
                            </button>
                            {/* Test send: only enabled when the user has an
                                email on file (auth users without one are
                                technically possible via OAuth-only flows).
                                Spinner replaces the icon while the request
                                is in flight; disabled to prevent double
                                fires. */}
                            <button
                              type="button"
                              onClick={() => void sendTestNewsletter(u)}
                              disabled={!u.email || sendingId === u.id}
                              aria-label={t("usersSendNewsletterIconTitle", lang)}
                              title={t("usersSendNewsletterIconTitle", lang)}
                              style={{
                                ...iconBtnStyle,
                                opacity:
                                  !u.email || sendingId === u.id ? 0.5 : 1,
                                cursor:
                                  !u.email || sendingId === u.id
                                    ? "default"
                                    : "pointer",
                              }}
                            >
                              {sendingId === u.id ? (
                                <span style={spinnerStyle(13)} />
                              ) : (
                                <PaperPlaneIcon />
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
