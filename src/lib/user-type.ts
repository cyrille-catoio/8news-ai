import type { User } from "@supabase/supabase-js";

/** Stored in Supabase `raw_app_meta_data.user_type`. Set with the service role only. */
export type AppUserType = "member" | "owner";

const USER_TYPE_METADATA_KEY = "user_type" as const;

/** Missing key is treated as `member`; never trust client-writable `user_metadata` for roles. */
export function getAppUserType(user: User | null | undefined): AppUserType {
  const raw = user?.app_metadata?.[USER_TYPE_METADATA_KEY];
  return raw === "owner" ? "owner" : "member";
}

export function isOwnerUser(user: User | null | undefined): boolean {
  return getAppUserType(user) === "owner";
}
