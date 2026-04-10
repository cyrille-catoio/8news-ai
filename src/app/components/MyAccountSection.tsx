"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color } from "@/lib/theme";
import { useAuth } from "@/app/providers";
import { getAppUserType } from "@/lib/user-type";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

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

const labelStyle: CSSProperties = {
  color: color.textMuted,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 2,
};

const valueStyle: CSSProperties = {
  color: color.text,
  fontSize: 14,
  marginBottom: 12,
};

const inputStyle: CSSProperties = {
  width: "100%",
  maxWidth: 300,
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

  const meta = user?.user_metadata ?? {};
  const email = user?.email ?? "";
  const userType = getAppUserType(user);

  const [firstName, setFirstName] = useState(meta.first_name ?? "");
  const [lastName, setLastName] = useState(meta.last_name ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(meta.first_name ?? "");
    setLastName(meta.last_name ?? "");
  }, [meta.first_name, meta.last_name]);

  const hasChanges =
    firstName.trim() !== (meta.first_name ?? "") ||
    lastName.trim() !== (meta.last_name ?? "");

  const handleSave = useCallback(async () => {
    setSaving(true);
    setToast(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { ...meta, first_name: firstName.trim(), last_name: lastName.trim() },
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
  }, [supabase, firstName, lastName, meta, lang]);

  const handleCancel = useCallback(() => {
    setFirstName(meta.first_name ?? "");
    setLastName(meta.last_name ?? "");
    setEditing(false);
    setToast(null);
  }, [meta.first_name, meta.last_name]);

  if (!user) return null;

  return (
    <div style={sectionStyle}>
      <h4 style={sectionTitle}>{t("myAccountSection", lang)}</h4>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px", maxWidth: 500 }}>
        {/* Last name */}
        <div>
          <div style={labelStyle}>{t("usersLastName", lang)}</div>
          {editing ? (
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
              disabled={saving}
            />
          ) : (
            <div style={valueStyle}>{lastName || "—"}</div>
          )}
        </div>

        {/* First name */}
        <div>
          <div style={labelStyle}>{t("usersFirstName", lang)}</div>
          {editing ? (
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
              disabled={saving}
            />
          ) : (
            <div style={valueStyle}>{firstName || "—"}</div>
          )}
        </div>

        {/* Email (read-only) */}
        <div>
          <div style={labelStyle}>{t("usersEmail", lang)}</div>
          <div style={{ ...valueStyle, color: color.textMuted }}>{email}</div>
        </div>

        {/* User type (read-only) */}
        <div>
          <div style={labelStyle}>{t("usersType", lang)}</div>
          <div style={{ ...valueStyle }}>
            <span style={badgeStyle(userType === "owner")}>{userType}</span>
          </div>
        </div>
      </div>

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
