"use client";

import { type CSSProperties, type ReactNode, useMemo, useState, useRef, useEffect } from "react";
import { color } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useAuth } from "@/app/providers";
import { AuthModal } from "@/app/components/AuthModal";
import { CryptoTicker } from "@/app/components/CryptoTicker";
import type { CryptoPrice } from "@/hooks/useCryptoPrices";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { isOwnerUser } from "@/lib/user-type";
import { trackEvent } from "@/lib/track";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  CRYPTO_TICKER_SYMBOLS_EVENT,
  readCryptoTickerSymbols,
  sanitizeCryptoSymbols,
  writeCryptoTickerSymbols,
} from "@/lib/crypto-preferences";

export type AppNavPage =
  | "briefing"
  /** v2.20.x+ — dedicated Top Stories page (`TopStoriesPage.tsx`) hosting
   *  the TOP VIDEO + TOP STORY cards that used to open the home briefing. */
  | "topStories"
  | "home"
  | "stats"
  | "crons"
  | "topics"
  | "settings"
  | "changelog"
  | "feeds"
  | "categories"
  | "favorites"
  | "dailySummaries"
  | "videos"
  /** v2.20+ — fullscreen TikTok-style Shorts feed (`ShortsPage.tsx`). */
  | "shorts"
  | "youtubeChannels"
  | "channels"
  | "users"
  | "userActivity"
  | "topArticles"
  | "summaries"
  | "cryptoChart"
  /** v2.5.17+ — anticipated route for a future SPA-internal landing page
   *  (the public marketing landing already lives at `/` and is rendered
   *  by a separate Next route, not by this component). The CryptoTicker
   *  uses this discriminator to fully unmount itself on landing — both
   *  to keep the marketing surface minimal and to stop the 60 s polling
   *  cycle when no logged-in workflow is in progress. Keep this entry
   *  even if the route doesn't exist yet so the contract is stable. */
  | "landing";

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

  function handleSwitch(next: Lang) {
    if (next !== lang) trackEvent("settings.lang_switch", { lang: next, target_id: next });
    onChange(next);
  }

  return (
    <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${color.gold}` }}>
      <button type="button" onClick={() => handleSwitch("en")} style={btn("en", true)}>
        EN
      </button>
      <button type="button" onClick={() => handleSwitch("fr")} style={btn("fr", false)}>
        FR
      </button>
    </div>
  );
}

function UserMenu({
  lang,
  authed,
  authLoading,
  isOwner,
  currentPage,
  onNavigate,
  onSignIn,
  onSignOut,
}: {
  lang: Lang;
  authed: boolean;
  authLoading: boolean;
  isOwner: boolean;
  currentPage: AppNavPage;
  onNavigate: (page: AppNavPage) => void;
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

  const isAdminPage =
    currentPage === "topics" ||
    currentPage === "feeds" ||
    currentPage === "categories" ||
    currentPage === "dailySummaries" ||
    currentPage === "youtubeChannels" ||
    currentPage === "users" ||
    currentPage === "stats" ||
    currentPage === "userActivity";

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

  const adminItemStyle = (page: AppNavPage): CSSProperties => ({
    ...menuItemStyle,
    background: currentPage === page ? "rgba(201,162,39,0.12)" : "transparent",
    color: currentPage === page ? color.gold : color.textSecondary,
  });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <NavIconButton
        active={isOwner && isAdminPage}
        onClick={() => setOpen((v) => !v)}
        ariaLabel="User"
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
          {isOwner && authed && (
            <>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "topics", lang }); onNavigate("topics"); setOpen(false); }} style={adminItemStyle("topics")}>
                {t("navTopicsAria", lang)}
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "categories", lang }); onNavigate("categories"); setOpen(false); }} style={adminItemStyle("categories")}>
                {t("categoriesAdminAria", lang)}
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "feeds", lang }); onNavigate("feeds"); setOpen(false); }} style={adminItemStyle("feeds")}>
                {t("feedsAdminAria", lang)}
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "dailySummaries", lang }); onNavigate("dailySummaries"); setOpen(false); }} style={adminItemStyle("dailySummaries")}>
                {t("dailySummariesAdmin", lang)}
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "youtubeChannels", lang }); onNavigate("youtubeChannels"); setOpen(false); }} style={adminItemStyle("youtubeChannels")}>
                YouTube Channels
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "stats", lang }); onNavigate("stats"); setOpen(false); }} style={adminItemStyle("stats")}>
                {t("navStatsAria", lang)}
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "users", lang }); onNavigate("users"); setOpen(false); }} style={adminItemStyle("users")}>
                {t("usersAdminAria", lang)}
              </button>
              <button type="button" onClick={() => { trackEvent("nav.user_menu", { target_id: "userActivity", lang }); onNavigate("userActivity"); setOpen(false); }} style={adminItemStyle("userActivity")}>
                {t("userActivityAdminAria", lang)}
              </button>
              <div style={{ height: 1, background: color.border, margin: "4px 0" }} />
            </>
          )}
          {authed ? (
            <>
              <button
                type="button"
                onClick={() => {
                  trackEvent("auth.sign_out", { lang });
                  onSignOut();
                  setOpen(false);
                }}
                style={menuItemStyle}
              >
                {t("authSignOut", lang)}
              </button>
            </>
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

export function AppHeader({
  currentPage,
  lang,
  onNavigate,
  onHomeReset,
  onLangChange,
  authModalOpen,
  onAuthModalChange,
  chatOpen,
  onToggleChat,
  userChatOpen,
  onToggleUserChat,
  onOpenCryptoChart,
}: {
  currentPage: AppNavPage;
  lang: Lang;
  onNavigate: (page: AppNavPage) => void;
  onHomeReset: () => void;
  onLangChange: (l: Lang) => void;
  authModalOpen: boolean;
  onAuthModalChange: (open: boolean) => void;
  /** Daily Podcast chat open state — drives the mobile in-header toggle. */
  chatOpen: boolean;
  /** Toggles the Daily Podcast chat panel. */
  onToggleChat: () => void;
  /** Community (user-to-user) chat open state. */
  userChatOpen: boolean;
  /** Toggles the Community chat side panel. */
  onToggleUserChat: () => void;
  /** Opens the in-app TradingView chart for a ticker coin. */
  onOpenCryptoChart: (coin: CryptoPrice) => void;
}) {
  const { session, loading: authLoading, signOut } = useAuth();
  const authed = Boolean(session?.user);
  const canManageTopicsAndFeeds = isOwnerUser(session?.user);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [cryptoTickerSymbols, setCryptoTickerSymbols] = useState<string[]>(() =>
    readCryptoTickerSymbols(),
  );
  // v2.11.1+ — hide the « Try Pro » CTA once the user has already
  // reserved the Pro plan from /app/settings. Same check pattern as
  // `SettingsPage.SubscriptionPanel` (line ~285): the reservation is
  // mirrored in `user_metadata.plan_intent === 'pro'` OR
  // `user_metadata.pro_interest === true` (legacy flag kept for
  // forward compat). Anonymous visitors never trigger this branch.
  const proMeta = (session?.user?.user_metadata ?? {}) as {
    plan_intent?: unknown;
    pro_interest?: unknown;
  };
  const proReserved =
    authed && (proMeta.plan_intent === "pro" || proMeta.pro_interest === true);

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

  const proBtnStyle: CSSProperties = {
    ...authBtnStyle,
    background: color.gold,
    color: "#000",
  };

  // The CryptoTicker is fully unmounted on the future `/landing` route
  // (no DOM, no hook, no polling) — same exclusion the spec asks for.
  // Everywhere else in the SPA we mount it AND let it poll; if we ever
  // want to keep prices visible without live updates on a specific
  // page, we can switch the prop to `false` for that one surface.
  const showCryptoTicker = currentPage !== "landing";
  const crypto = useCryptoPrices({
    poll: showCryptoTicker,
    selectedSymbols: cryptoTickerSymbols,
  });
  const refreshCrypto = crypto.refresh;
  const cryptoRefreshReadyRef = useRef(false);

  useEffect(() => {
    if (authLoading || !session?.user) return;
    const rawSymbols = session.user.user_metadata?.crypto_ticker_symbols;
    if (Array.isArray(rawSymbols)) {
      const next = sanitizeCryptoSymbols(rawSymbols);
      setCryptoTickerSymbols(next);
      writeCryptoTickerSymbols(next);
      return;
    }
    void supabase.auth.updateUser({
      data: {
        ...(session.user.user_metadata ?? {}),
        crypto_ticker_symbols: cryptoTickerSymbols,
      },
    });
  // Seed once when the authenticated user arrives; user changes go through
  // `handleCryptoTickerSymbolsChange`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setCryptoTickerSymbols(sanitizeCryptoSymbols(detail));
    };
    window.addEventListener(CRYPTO_TICKER_SYMBOLS_EVENT, handler);
    return () => window.removeEventListener(CRYPTO_TICKER_SYMBOLS_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!showCryptoTicker) return;
    if (!cryptoRefreshReadyRef.current) {
      cryptoRefreshReadyRef.current = true;
      return;
    }
    refreshCrypto();
  }, [cryptoTickerSymbols, showCryptoTicker, refreshCrypto]);

  return (
    <header style={{ paddingBottom: 6, marginBottom: 10 }}>
      {/* ── Crypto ticker bandeau (v2.5.17) ─────────────────────────
          The ticker lives in a dedicated full-width strip *above* the
          brand zone, NOT inline with the six nav icons + user menu.
          Tried that placement first — at desktop widths the ticker
          (4 coins × ~85 px) plus the icons cluster pushed left far
          enough to overlap the « 8NEWS » logo. Lifting the ticker
          into its own strip:
            - gives the           brand zone below its full horizontal real
              estate back (no overlap),
            - matches the conventional « news ticker » UX (Bloomberg,
              CNBC, financial sites) which users parse at a glance,
            - works on mobile too — at ≤ 480 px the ticker collapses
              to just BTC + ETH and still looks intentional in the
              strip rather than crammed into a now-cluttered icon row.
          Centered in the same max-width column as the briefing body.
          A thin border-bottom anchors the strip without competing
          with the brand below. */}
      {showCryptoTicker && (
        <div
          className="crypto-ticker-strip"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 8,
            marginBottom: 14,
            borderBottom: `1px solid ${color.border}`,
            minHeight: 22,
          }}
        >
          <CryptoTicker
            lang={lang}
            prices={crypto.prices}
            stale={crypto.stale}
            loading={crypto.loading}
            error={crypto.error}
            onCoinClick={onOpenCryptoChart}
          />
        </div>
      )}

      {/* ── Brand zone ──────────────────────────────────────────────
          Logo + subtitle on the left, icon cluster floating top-right
          *within this zone* (so it aligns with the top of the logo,
          not with the top of the ticker strip above). The wrapper's
          `position: relative` is what scopes the absolute child to
          this zone. */}
      <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavIconButton
            active={currentPage === "briefing"}
            onClick={() => { trackEvent("nav.header_icon", { target_id: "briefing", lang }); onHomeReset(); }}
            ariaLabel={t("navHomeAria", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <polyline points="9 21 9 14 15 14 15 21" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "crons"}
            onClick={() => { trackEvent("nav.header_icon", { target_id: "crons", lang }); onNavigate("crons"); }}
            ariaLabel={t("cronMonitor", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "changelog"}
            onClick={() => { trackEvent("nav.header_icon", { target_id: "changelog", lang }); onNavigate("changelog"); }}
            ariaLabel={t("changelog", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </NavIconButton>
          <NavIconButton
            active={currentPage === "settings"}
            onClick={() => { trackEvent("nav.header_icon", { target_id: "settings", lang }); onNavigate("settings"); }}
            ariaLabel={t("settings", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavIconButton>
          {/* Community chat (user-to-user) — a distinct « users » glyph so
              it doesn't read as the Daily Podcast AI bubble next to it. */}
          <NavIconButton
            active={userChatOpen}
            onClick={() => { trackEvent("nav.header_icon", { target_id: "user_chat", lang }); onToggleUserChat(); }}
            ariaLabel={userChatOpen ? t("userChatClose", lang) : t("userChatOpen", lang)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </NavIconButton>
          {/* Chat toggle — placed between the settings icon and the user
              menu at every viewport size. This replaces the old floating
              top-right bubble so the header has a single chat affordance. */}
          <span className="header-chat-icon-wrap">
            <NavIconButton
              active={chatOpen}
              onClick={() => { trackEvent("nav.header_icon", { target_id: "chat", lang }); onToggleChat(); }}
              ariaLabel={chatOpen ? t("podcastChatClose", lang) : t("podcastChatOpen", lang)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z" />
              </svg>
            </NavIconButton>
          </span>
          <UserMenu
            lang={lang}
            authed={authed}
            authLoading={authLoading}
            isOwner={canManageTopicsAndFeeds}
            currentPage={currentPage}
            onNavigate={onNavigate}
            onSignIn={() => onAuthModalChange(true)}
            onSignOut={() => void signOut()}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!authLoading && !proReserved && (
            <button
              type="button"
              onClick={() => {
                if (authed) onNavigate("settings");
                else onAuthModalChange(true);
              }}
              style={proBtnStyle}
              aria-label={t("headerProCta", lang)}
            >
              {t("headerProCta", lang)}
            </button>
          )}
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
        /**
         * Dev escape hatch: double-click the logo to open the marketing
         * landing page on `/` even when signed in. The middleware normally
         * redirects authenticated users from `/` to `/app`; the `?preview=1`
         * query param bypasses that redirect (see middleware.ts).
         */
        onDoubleClick={(e) => {
          e.preventDefault();
          if (typeof window !== "undefined") {
            window.location.href = "/?preview=1";
          }
        }}
        title="8news"
        style={{ height: "clamp(32px, 5vw, 48px)", width: "auto", display: "block", cursor: "pointer", userSelect: "none" }}
      />
      <p style={{ color: color.textMuted, fontSize: 15, margin: "6px 0 0", marginLeft: 0 }}>{t("subtitle", lang)}</p>
      </div>
    </header>
  );
}
