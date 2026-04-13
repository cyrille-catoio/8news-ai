"use client";

import { type CSSProperties, type ReactNode, useState, useRef, useEffect } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useAuth } from "@/app/providers";
import { AuthModal } from "@/app/components/AuthModal";
import { isOwnerUser } from "@/lib/user-type";

export type AppNavPage =
  | "home"
  | "stats"
  | "crons"
  | "topics"
  | "settings"
  | "changelog"
  | "feeds";

function NavIconButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    padding: 4,
    border: "none",
    background: "transparent",
    color: active ? color.gold : color.textMuted,
    cursor: active ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} style={style}>
      {children}
    </button>
  );
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const btn = (value: Lang, isLeft: boolean): CSSProperties => ({
    padding: "4px 10px",
    fontSize: 10.4,
    fontWeight: 600,
    border: "none",
    borderLeft: isLeft ? "none" : `1px solid ${color.gold}`,
    cursor: "pointer",
    background: lang === value ? color.gold : "transparent",
    color: lang === value ? "#000" : color.gold,
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${color.gold}` }}>
      <button type="button" onClick={() => onChange("en")} style={btn("en", true)}>
        EN
      </button>
      <button type="button" onClick={() => onChange("fr")} style={btn("fr", false)}>
        FR
      </button>
    </div>
  );
}

function UserMenu({
  lang,
  authed,
  authLoading,
  onSignIn,
  onSignOut,
}: {
  lang: Lang;
  authed: boolean;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const menuItemStyle: CSSProperties = {
    display: "block",
    width: "100%",
    padding: "8px 14px",
    border: "none",
    background: "transparent",
    color: color.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <NavIconButton
        active={false}
        onClick={() => setOpen((v) => !v)}
        ariaLabel="User"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </NavIconButton>
      {open && !authLoading && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            overflow: "hidden",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {authed ? (
            <button
              type="button"
              onClick={() => { onSignOut(); setOpen(false); }}
              style={menuItemStyle}
            >
              {t("authSignOut", lang)}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { onSignIn(); setOpen(false); }}
              style={menuItemStyle}
            >
              {t("authSignIn", lang)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AdminMenu({
  currentPage,
  lang,
  onNavigate,
}: {
  currentPage: AppNavPage;
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isAdminPage = currentPage === "topics" || currentPage === "feeds";

  const menuItemStyle = (page: AppNavPage): CSSProperties => ({
    display: "block",
    width: "100%",
    padding: "8px 14px",
    border: "none",
    background: currentPage === page ? "rgba(201,162,39,0.12)" : "transparent",
    color: currentPage === page ? color.gold : color.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <NavIconButton
        active={isAdminPage}
        onClick={() => setOpen((v) => !v)}
        ariaLabel="Admin"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </NavIconButton>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            overflow: "hidden",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <button
            type="button"
            onClick={() => { onNavigate("topics"); setOpen(false); }}
            style={menuItemStyle("topics")}
          >
            {t("navTopicsAria", lang)}
          </button>
          <button
            type="button"
            onClick={() => { onNavigate("feeds"); setOpen(false); }}
            style={menuItemStyle("feeds")}
          >
            {t("feedsAdminAria", lang)}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppHeader({
  currentPage,
  lang,
  onNavigate,
  onHomeReset,
  onLangChange,
  authModalOpen,
  onAuthModalChange,
}: {
  currentPage: AppNavPage;
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
  onHomeReset: () => void;
  onLangChange: (l: Lang) => void;
  authModalOpen: boolean;
  onAuthModalChange: (open: boolean) => void;
}) {
  const { session, loading: authLoading, signOut } = useAuth();
  const authed = Boolean(session?.user);
  const canManageTopicsAndFeeds = isOwnerUser(session?.user);

  const authBtnStyle: CSSProperties = {
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    border: `1px solid ${color.gold}`,
    borderRadius: 5,
    background: "transparent",
    color: color.gold,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <header style={{ paddingBottom: 12, marginBottom: 20, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavIconButton
            active={currentPage === "home"}
            onClick={onHomeReset}
            ariaLabel={t("navHomeAria", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <polyline points="9 21 9 14 15 14 15 21" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "stats"}
            onClick={() => onNavigate("stats")}
            ariaLabel={t("navStatsAria", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "crons"}
            onClick={() => onNavigate("crons")}
            ariaLabel={t("cronMonitor", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "changelog"}
            onClick={() => onNavigate("changelog")}
            ariaLabel={t("changelog", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "settings"}
            onClick={() => onNavigate("settings")}
            ariaLabel={t("settings", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavIconButton>
          {canManageTopicsAndFeeds && (
            <AdminMenu
              currentPage={currentPage}
              lang={lang}
              onNavigate={onNavigate}
            />
          )}
          <UserMenu
            lang={lang}
            authed={authed}
            authLoading={authLoading}
            onSignIn={() => onAuthModalChange(true)}
            onSignOut={() => void signOut()}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!authLoading && !authed && (
            <button type="button" onClick={() => onAuthModalChange(true)} style={authBtnStyle}>
              {t("authSignIn", lang)}
            </button>
          )}
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>
        <AuthModal open={authModalOpen} onClose={() => onAuthModalChange(false)} lang={lang} />
      </div>

      <img
        src="/logo-8news.png"
        alt="8news"
        onClick={onHomeReset}
        style={{ height: "clamp(32px, 5vw, 48px)", width: "auto", display: "block", cursor: "pointer" }}
      />
      <p style={{ color: color.textMuted, fontSize: 15, marginTop: 8, marginLeft: lang === "fr" ? 7 : 17 }}>{t("subtitle", lang)}</p>
    </header>
  );
}
