import type { User } from "@supabase/supabase-js";

/** Stored in Supabase `raw_user_meta_data.user_type`. Set to `owner` only via Supabase Dashboard. */
export type AppUserType = "member" | "owner";

export const USER_TYPE_METADATA_KEY = "user_type" as const;

/** New sign-ups set `user_type: "member"` in metadata. Missing key is treated as `member`. */
export function getAppUserType(user: User | null | undefined): AppUserType {
  const raw = user?.user_metadata?.[USER_TYPE_METADATA_KEY];
  return raw === "owner" ? "owner" : "member";
}

export function isOwnerUser(user: User | null | undefined): boolean {
  return getAppUserType(user) === "owner";
}
