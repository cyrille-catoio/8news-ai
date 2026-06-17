"use client";

import { useEffect, useMemo, useState } from "react";
import { color, card, spinnerStyle } from "@/lib/theme";
import { t, type Lang } from "@/lib/i18n";
import { useAuth } from "@/app/providers";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { isOwnerUser } from "@/lib/user-type";
import { trackEvent } from "@/lib/track";

/**
 * Inline gold strip CTA pushing the daily newsletter subscription on
 * the home. Hidden for owners and for users already opted-in. Anonymous
 * visitors get a « create an account → » framing that bounces them to
 * the auth modal via `onRequestAuth`.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function NewsletterSignupPrompt({
  lang,
  onRequestAuth,
}: {
  lang: Lang;
  onRequestAuth: () => void;
}) {
  const { session, loading } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const user = session?.user ?? null;
  const isOwner = isOwnerUser(user);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSubscribed(user?.user_metadata?.daily_newsletter === true);
  }, [user?.id, user?.user_metadata]);

  if (loading || isOwner || subscribed) return null;

  async function subscribe() {
    if (!user) {
      onRequestAuth();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata ?? {}),
          daily_newsletter: true,
        },
      });
      if (error) throw error;
      trackEvent("newsletter.subscribe", { lang, meta: { source: "home_prompt" } });
      setSubscribed(true);
      setMessage(t("newsletterSignupSuccess", lang));
    } catch {
      setMessage(t("newsletterSignupError", lang));
    } finally {
      setBusy(false);
    }
  }

  const anonymous = !user;

  return (
    <section
      style={{
        ...card,
        marginBottom: 24,
        padding: "14px 16px",
        background: color.surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div
            style={{
              color: color.gold,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {t("newsletterSignupKicker", lang)}
          </div>
          <div
            style={{
              color: color.text,
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: 18,
              lineHeight: 1.2,
              marginBottom: 4,
            }}
          >
            {t("newsletterSignupTitle", lang)}
          </div>
          <div style={{ color: color.textMuted, fontSize: 13, lineHeight: 1.45 }}>
            {t(
              anonymous
                ? "newsletterSignupBodyAnonymous"
                : "newsletterSignupBodyMember",
              lang,
            )}
          </div>
          {message && (
            <div
              style={{
                color: message === t("newsletterSignupSuccess", lang)
                  ? "#4ade80"
                  : color.errorText,
                fontSize: 12,
                marginTop: 8,
              }}
            >
              {message}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void subscribe()}
          disabled={busy}
          style={{
            border: "none",
            borderRadius: 999,
            background: color.gold,
            color: "#000",
            cursor: busy ? "wait" : "pointer",
            fontSize: 13,
            fontWeight: 800,
            padding: "10px 14px",
            whiteSpace: "nowrap",
            minWidth: 150,
          }}
        >
          {busy ? (
            <span style={spinnerStyle(13)} />
          ) : (
            t(
              anonymous
                ? "newsletterSignupButtonAnonymous"
                : "newsletterSignupButtonMember",
              lang,
            )
          )}
        </button>
      </div>
    </section>
  );
}
