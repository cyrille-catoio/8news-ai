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

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
  const [saving, setSaving] = useState(false);

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
  }

  function cancelEdit() {
    setEditingId(null);
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("usersLastName", lang)}</th>
                  <th style={thStyle}>{t("usersFirstName", lang)}</th>
                  <th style={thStyle}>{t("usersEmail", lang)}</th>
                  <th style={thStyle}>{t("usersType", lang)}</th>
                  <th style={thStyle}>{t("usersCreatedAt", lang)}</th>
                  <th style={{ ...thStyle, textAlign: "center", width: 60 }}>{t("usersActions", lang)}</th>
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
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            aria-label={t("usersActions", lang)}
                            style={iconBtnStyle}
                          >
                            <PencilIcon />
                          </button>
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
