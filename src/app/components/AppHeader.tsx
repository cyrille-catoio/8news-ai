"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
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

export function AppHeader({
  currentPage,
  lang,
  onNavigate,
  onHomeReset,
  onLangChange,
}: {
  currentPage: AppNavPage;
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
  onHomeReset: () => void;
  onLangChange: (l: Lang) => void;
}) {
  const { session, loading: authLoading, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
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
          {canManageTopicsAndFeeds && (
            <NavIconButton
              active={currentPage === "topics"}
              onClick={() => onNavigate("topics")}
              ariaLabel={t("navTopicsAria", lang)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11a9 9 0 0 1 9 9" />
                <path d="M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1" fill="currentColor" />
              </svg>
            </NavIconButton>
          )}
          {canManageTopicsAndFeeds && (
            <NavIconButton
              active={currentPage === "feeds"}
              onClick={() => onNavigate("feeds")}
              ariaLabel={t("feedsAdminAria", lang)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </NavIconButton>
          )}
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!authLoading && (
            authed ? (
              <button type="button" onClick={() => void signOut()} style={authBtnStyle}>
                {t("authSignOut", lang)}
              </button>
            ) : (
              <button type="button" onClick={() => setAuthModalOpen(true)} style={authBtnStyle}>
                {t("authSignIn", lang)}
              </button>
            )
          )}
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} lang={lang} />
      </div>

      <img
        src="/logo-8news.png"
        alt="8news"
        onClick={onHomeReset}
        style={{ height: "clamp(32px, 5vw, 48px)", width: "auto", display: "block", cursor: "pointer" }}
      />
      <p style={{ color: color.textMuted, fontSize: 15, marginTop: 8 }}>{t("subtitle", lang)}</p>
    </header>
  );
}
