import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isOwnerUser } from "@/lib/user-type";

export async function getSessionUser(): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = await cookies();
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Signed-in **owner** only (Topics / Feed management APIs). */
export async function requireOwnerSession(): Promise<
  { ok: true; user: User } | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: unauthorizedResponse() };
  if (!isOwnerUser(user)) return { ok: false, response: forbiddenResponse() };
  return { ok: true, user };
}

/** Any signed-in user (member or owner). Used for personalization APIs. */
export async function requireSession(): Promise<
  { ok: true; user: User } | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: unauthorizedResponse() };
  return { ok: true, user };
}
