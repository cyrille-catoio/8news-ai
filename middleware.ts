import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SPA_PATHS = new Set([
  "/stats",
  "/crons",
  "/topics",
  "/settings",
  "/changelog",
  "/feeds",
  "/categories",
  "/favorites",
  "/daily-summaries",
  "/videos",
  "/youtube-channels",
  "/top-articles",
  "/summaries-browse",
]);

export async function middleware(request: NextRequest) {
  const isSpaPath = SPA_PATHS.has(request.nextUrl.pathname);

  let supabaseResponse: NextResponse;
  if (isSpaPath) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/";
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
          rewriteUrl.pathname = "/";
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

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
