"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color, sectionCard as sectionStyle, formSectionTitle as sectionTitle } from "@/lib/theme";
import { useAuth } from "@/app/providers";
import { getAppUserType } from "@/lib/user-type";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

const labelStyle: CSSProperties = {
  color: color.textMuted,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 2,
};

// Compact read-mode field: label and value share one line, and the
// fields pack horizontally (flex-wrap) so the whole account block is a
// single row on desktop and wraps gracefully on mobile.
const inlineLabelStyle: CSSProperties = {
  color: color.textMuted,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const inlineValueStyle: CSSProperties = {
  color: color.text,
  fontSize: 14,
};

const editFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const editInputStyle: CSSProperties = {
  width: 150,
  padding: "6px 8px",
  borderRadius: 5,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.text,
  fontSize: 13,
  boxSizing: "border-box",
};

const badgeStyle = (isOwner: boolean): CSSProperties => ({
  display: "inline-block",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 4,
  background: isOwner ? "rgba(201,162,39,0.15)" : "rgba(255,255,255,0.06)",
  color: isOwner ? color.gold : color.textMuted,
  border: `1px solid ${isOwner ? color.gold : color.border}`,
});

export function MyAccountSection({ lang }: { lang: Lang }) {
  const { session } = useAuth();
  const user = session?.user;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const meta = useMemo(() => user?.user_metadata ?? {}, [user?.user_metadata]);
  const email = user?.email ?? "";
  const userType = getAppUserType(user);

  const [firstName, setFirstName] = useState(meta.first_name ?? "");
  const [lastName, setLastName] = useState(meta.last_name ?? "");
  const [nickname, setNickname] = useState(meta.nickname ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(meta.first_name ?? "");
    setLastName(meta.last_name ?? "");
    setNickname(meta.nickname ?? "");
  }, [meta.first_name, meta.last_name, meta.nickname]);

  const hasChanges =
    firstName.trim() !== (meta.first_name ?? "") ||
    lastName.trim() !== (meta.last_name ?? "") ||
    nickname.trim() !== (meta.nickname ?? "");

  const handleSave = useCallback(async () => {
    setSaving(true);
    setToast(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...meta,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          nickname: nickname.trim(),
        },
      });
      if (error) throw error;
      setEditing(false);
      setToast(t("myAccountSaveSuccess", lang));
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast(t("myAccountSaveError", lang));
    } finally {
      setSaving(false);
    }
  }, [supabase, firstName, lastName, nickname, meta, lang]);

  const handleCancel = useCallback(() => {
    setFirstName(meta.first_name ?? "");
    setLastName(meta.last_name ?? "");
    setNickname(meta.nickname ?? "");
    setEditing(false);
    setToast(null);
  }, [meta.first_name, meta.last_name, meta.nickname]);

  if (!user) return null;

  return (
    <div style={sectionStyle}>
      <h4 style={sectionTitle}>{t("myAccountSection", lang)}</h4>

      {editing ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 18px", marginBottom: 10 }}>
          {/* Last name */}
          <label style={editFieldStyle}>
            <span style={labelStyle}>{t("usersLastName", lang)}</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={editInputStyle}
              disabled={saving}
            />
          </label>

          {/* First name */}
          <label style={editFieldStyle}>
            <span style={labelStyle}>{t("usersFirstName", lang)}</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={editInputStyle}
              disabled={saving}
            />
          </label>

          {/* Nickname (used in the community chat) */}
          <label style={editFieldStyle}>
            <span style={labelStyle}>{t("nickname", lang)}</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("nicknamePlaceholder", lang)}
              style={editInputStyle}
              disabled={saving}
            />
            <span style={{ color: color.textMuted, fontSize: 11, lineHeight: 1.4, maxWidth: 220 }}>
              {t("nicknameHint", lang)}
            </span>
          </label>

          {/* Email + type (read-only) */}
          <div style={editFieldStyle}>
            <span style={labelStyle}>{t("usersEmail", lang)}</span>
            <span style={{ ...inlineValueStyle, color: color.textMuted }}>{email}</span>
          </div>
          <div style={editFieldStyle}>
            <span style={labelStyle}>{t("usersType", lang)}</span>
            <span style={badgeStyle(userType === "owner")}>{userType}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 22px", marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={inlineLabelStyle}>{t("usersLastName", lang)}</span>
            <span style={inlineValueStyle}>{lastName || "—"}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={inlineLabelStyle}>{t("usersFirstName", lang)}</span>
            <span style={inlineValueStyle}>{firstName || "—"}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={inlineLabelStyle}>{t("nickname", lang)}</span>
            <span style={inlineValueStyle}>{nickname || "—"}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={inlineLabelStyle}>{t("usersEmail", lang)}</span>
            <span style={{ ...inlineValueStyle, color: color.textMuted }}>{email}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={inlineLabelStyle}>{t("usersType", lang)}</span>
            <span style={badgeStyle(userType === "owner")}>{userType}</span>
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !hasChanges}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                borderRadius: 5,
                background: color.gold,
                color: "#000",
                cursor: saving || !hasChanges ? "default" : "pointer",
                opacity: saving || !hasChanges ? 0.5 : 1,
              }}
            >
              {t("usersSaveAria", lang)}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${color.border}`,
                borderRadius: 5,
                background: "transparent",
                color: color.textMuted,
                cursor: "pointer",
              }}
            >
              {t("usersCancelAria", lang)}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${color.gold}`,
              borderRadius: 5,
              background: "transparent",
              color: color.gold,
              cursor: "pointer",
            }}
          >
            {t("usersActions", lang)}
          </button>
        )}
        {toast && (
          <span style={{ fontSize: 12, color: toast === t("myAccountSaveSuccess", lang) ? "#4ade80" : color.errorText }}>
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}
