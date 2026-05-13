import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SPA_PATHS = new Set([
  "/app",
  "/app/articles",
  "/app/my-topics",
  "/app/stats",
  "/app/crons",
  "/app/topics",
  "/app/settings",
  "/app/changelog",
  "/app/feeds",
  "/app/categories",
  "/app/favorites",
  "/app/daily-summaries",
  "/app/videos",
  "/app/youtube-channels",
  "/app/users",
  "/app/top-articles",
  "/app/summaries-browse",
  "/app/archives",
]);

export async function middleware(request: NextRequest) {
  const isSpaPath = SPA_PATHS.has(request.nextUrl.pathname);

  let supabaseResponse: NextResponse;
  if (isSpaPath) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/app";
    supabaseResponse = NextResponse.rewrite(rewriteUrl);
  } else {
    supabaseResponse = NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        if (isSpaPath) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = "/app";
          supabaseResponse = NextResponse.rewrite(rewriteUrl);
        } else {
          supabaseResponse = NextResponse.next({ request });
        }
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh session cookie. Strict equality on "/" guarantees only the
  // marketing landing route is checked for the auth redirect — every SSR
  // route ("/{topic}", "/{topic}/{date}/{slug}", "/summaries", "/api/**")
  // passes through untouched.
  //
  // Dev escape hatch: `?preview=1` bypasses the auth redirect so signed-in
  // maintainers can still view the landing from within the app (double-
  // click on the in-app 8news logo, see AppHeader.tsx).
  const { data: { user } } = await supabase.auth.getUser();
  const previewLanding = request.nextUrl.searchParams.get("preview") === "1";
  if (request.nextUrl.pathname === "/" && user && !previewLanding) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
