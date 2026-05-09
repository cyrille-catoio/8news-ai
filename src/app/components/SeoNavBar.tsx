"use client";

import { type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useAuth } from "@/app/providers";
import { isOwnerUser } from "@/lib/user-type";
import { AuthModal } from "@/app/components/AuthModal";
import { setCookie } from "@/lib/cookies";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

function NavLink({ href, ariaLabel, children }: { href: string; ariaLabel: string; children: ReactNode }) {
  const style: CSSProperties = {
    padding: 4,
    border: "none",
    background: "transparent",
    color: color.textMuted,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  };
  return (
    <Link href={href} aria-label={ariaLabel} style={style}>
      {children}
    </Link>
  );
}

function LangToggle({ lang, altLangUrl }: { lang: Lang; altLangUrl?: string }) {
  const { session } = useAuth();
  const supabase = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return createBrowserSupabaseClient(); } catch { return null; }
  }, []);

  const btn = (value: Lang, isLeft: boolean): CSSProperties => ({
    padding: "4px 10px",
    fontSize: 10.4,
    fontWeight: 600,
    border: "none",
    borderLeft: isLeft ? "none" : `1px solid ${color.gold}`,
    cursor: lang === value ? "default" : "pointer",
    background: lang === value ? color.gold : "transparent",
    color: lang === value ? "#000" : color.gold,
    transition: "all 0.15s",
    textDecoration: "none",
    display: "inline-block",
  });

  // When the user clicks the toggle on a SSR page, we have to persist
  // the choice BEFORE the browser navigates — otherwise the next page
  // load (any page, not just the alt-lang URL we're going to) would
  // again resolve through the old cookie / metadata. The cookie write
  // is synchronous and is enough for `resolveServerLang` to pick up the
  // new value on the next request. The user_metadata update is
  // fire-and-forget; if the user is offline the cookie still keeps
  // them in the right language until the next sync.
  const switchTo = (target: Lang) => (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setCookie("lang", target);
    const user = session?.user;
    if (user && supabase) {
      void supabase.auth.updateUser({
        data: { ...user.user_metadata, preferred_lang: target },
      });
    }
    if (altLangUrl) {
      window.location.href = altLangUrl;
    }
  };

  return (
    <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${color.gold}` }}>
      {lang === "en" ? (
        <>
          <span style={btn("en", true)}>EN</span>
          {altLangUrl ? (
            <a href={altLangUrl} onClick={switchTo("fr")} style={btn("fr", false)}>FR</a>
          ) : (
            <span style={{ ...btn("fr", false), opacity: 0.4, cursor: "default" }}>FR</span>
          )}
        </>
      ) : (
        <>
          {altLangUrl ? (
            <a href={altLangUrl} onClick={switchTo("en")} style={btn("en", true)}>EN</a>
          ) : (
            <span style={{ ...btn("en", true), opacity: 0.4, cursor: "default" }}>EN</span>
          )}
          <span style={btn("fr", false)}>FR</span>
        </>
      )}
    </div>
  );
}

function UserMenu({ lang, authed, authLoading, isOwner, onSignIn, onSignOut }: {
  lang: Lang; authed: boolean; authLoading: boolean; isOwner: boolean; onSignIn: () => void; onSignOut: () => void;
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
    display: "block", width: "100%", padding: "8px 14px", border: "none",
    background: "transparent", color: color.textSecondary, fontSize: 12,
    fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "inherit", whiteSpace: "nowrap",
    textDecoration: "none",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        aria-label="User"
        style={{ padding: 4, border: "none", background: "transparent", color: color.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
      >
        {isOwner ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="9" r="3.5" />
            <path d="M7.5 3L9.5 5.5L12 3L14.5 5.5L16.5 3" stroke={color.gold} strokeWidth="1.8" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </a>
      {open && !authLoading && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4,
          background: color.surface, border: `1px solid ${color.border}`,
          borderRadius: 8, overflow: "hidden", zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {isOwner && authed && (
            <>
              <Link href="/app/topics" onClick={() => setOpen(false)} style={menuItemStyle}>{t("navTopicsAria", lang)}</Link>
              <Link href="/app/categories" onClick={() => setOpen(false)} style={menuItemStyle}>{t("categoriesAdminAria", lang)}</Link>
              <Link href="/app/feeds" onClick={() => setOpen(false)} style={menuItemStyle}>{t("feedsAdminAria", lang)}</Link>
              <Link href="/app/daily-summaries" onClick={() => setOpen(false)} style={menuItemStyle}>{t("dailySummariesAdmin", lang)}</Link>
              <Link href="/app" onClick={() => setOpen(false)} style={menuItemStyle}>Videos</Link>
              <div style={{ height: 1, background: color.border, margin: "4px 0" }} />
            </>
          )}
          {authed ? (
            <button type="button" onClick={() => { onSignOut(); setOpen(false); }} style={menuItemStyle}>
              {t("authSignOut", lang)}
            </button>
          ) : (
            <button type="button" onClick={() => { onSignIn(); setOpen(false); }} style={menuItemStyle}>
              {t("authSignIn", lang)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SeoNavBar({ lang, altLangUrl }: { lang: Lang; altLangUrl?: string }) {
  const { session, loading: authLoading, signOut } = useAuth();
  const authed = Boolean(session?.user);
  const isOwner = isOwnerUser(session?.user);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const authBtnStyle: CSSProperties = {
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    border: `1px solid ${color.gold}`, borderRadius: 5,
    background: "transparent", color: color.gold, cursor: "pointer", fontFamily: "inherit",
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
          <NavLink href="/app" ariaLabel={t("navHomeAria", lang)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <polyline points="9 21 9 14 15 14 15 21" />
            </svg>
          </NavLink>
          <NavLink href="/app/stats" ariaLabel={t("navStatsAria", lang)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
          </NavLink>
          <NavLink href="/app/crons" ariaLabel={t("cronMonitor", lang)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </NavLink>
          <NavLink href="/app/changelog" ariaLabel={t("changelog", lang)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </NavLink>
          <NavLink href="/app/settings" ariaLabel={t("settings", lang)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavLink>
          <UserMenu
            lang={lang}
            authed={authed}
            authLoading={authLoading}
            isOwner={isOwner}
            onSignIn={() => setAuthModalOpen(true)}
            onSignOut={() => void signOut()}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!authLoading && !authed && (
            <button type="button" onClick={() => setAuthModalOpen(true)} style={authBtnStyle}>
              {t("authSignIn", lang)}
            </button>
          )}
          <LangToggle lang={lang} altLangUrl={altLangUrl} />
        </div>
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} lang={lang} />
      </div>

      <Link href="/app" style={{ textDecoration: "none", display: "block" }}>
        <img src="/logo-8news.png" alt="8news" style={{ height: "clamp(32px, 5vw, 48px)", width: "auto", display: "block" }} />
      </Link>
      <p style={{ color: color.textMuted, fontSize: 15, marginTop: 8, marginLeft: 0 }}>
        {t("subtitle", lang)}
      </p>
    </header>
  );
}
