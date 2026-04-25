import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Lang } from "@/lib/i18n";

/**
 * Resolution order for the language used to render any SSR page that
 * is reachable in both EN and FR (`/briefings`, `/summaries`,
 * `/[topic]`, …):
 *
 *   1. Explicit `?lang=fr|en` query string  → wins over everything,
 *      so a shared link in a given language always renders that
 *      language regardless of the visitor's session.
 *   2. Logged-in user's `auth.users.raw_user_meta_data.preferred_lang`
 *      → the « language at launch is the connected user's setting »
 *      requirement.
 *   3. Cookie `lang` (the same cookie the SPA uses) → only consulted
 *      when there is no signed-in user.
 *   4. Caller-provided default (or `en` if none) — best for crawlers
 *      / unknown visitors. The landing page passes `fr` here since
 *      historical behaviour defaulted to French for anonymous
 *      visitors; the rest of the app uses `en`.
 *
 * This helper is safe to call from any Server Component / route
 * handler. It silently falls back to the cookie path if Supabase env
 * vars are missing, never throws.
 *
 * `?lang=` accepts only "fr" or "en" — anything else is ignored and we
 * fall through to the next layer (we don't want a typo in a referrer
 * URL to lock visitors into a default they didn't choose).
 */
export async function resolveServerLang(
  explicitLang?: string | null,
  defaultLang: Lang = "en",
): Promise<Lang> {
  if (explicitLang === "fr" || explicitLang === "en") return explicitLang;

  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const supabase = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              /* ignore: read-only cookie context */
            }
          },
        },
      });
      const { data } = await supabase.auth.getUser();
      const meta = (data.user?.user_metadata ?? {}) as { preferred_lang?: unknown };
      const userLang = meta.preferred_lang;
      if (userLang === "fr" || userLang === "en") return userLang;
    } catch {
      /* ignore: fall through to cookie / default */
    }
  }

  const cookieLang = cookieStore.get("lang")?.value;
  if (cookieLang === "fr" || cookieLang === "en") return cookieLang;

  return defaultLang;
}
