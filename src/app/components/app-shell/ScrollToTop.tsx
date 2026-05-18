"use client";

import { useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { color } from "@/lib/theme";

/**
 * Floating circular « back to top » button, appears once the user has
 * scrolled past ~400 px. Smooth-scrolls back to the top of the page.
 *
 * v2.12 extracted from `src/app/app/page.tsx`. No behavior change.
 */
export function ScrollToTop({ lang }: { lang: Lang }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t("scrollToTopAria", lang)}
      style={{
        position: "fixed",
        bottom: 32,
        left: 27,
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: `1px solid ${color.border}`,
        background: color.surface,
        color: color.gold,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
        transition: "opacity 0.2s",
        zIndex: 998,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
