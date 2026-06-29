import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getAppUserType, isOwnerUser } from "@/lib/user-type";

function userWithMetadata({
  app,
  user,
}: {
  app?: Record<string, unknown>;
  user?: Record<string, unknown>;
}): User {
  return {
    app_metadata: app ?? {},
    user_metadata: user ?? {},
  } as User;
}

describe("getAppUserType", () => {
  it("trusts owner only from service-role app_metadata", () => {
    expect(getAppUserType(userWithMetadata({ app: { user_type: "owner" } }))).toBe("owner");
    expect(isOwnerUser(userWithMetadata({ app: { user_type: "owner" } }))).toBe(true);
  });

  it("does not grant owner from client-writable user_metadata", () => {
    const user = userWithMetadata({ user: { user_type: "owner" } });

    expect(getAppUserType(user)).toBe("member");
    expect(isOwnerUser(user)).toBe(false);
  });

  it("defaults missing or unknown roles to member", () => {
    expect(getAppUserType(userWithMetadata({}))).toBe("member");
    expect(getAppUserType(userWithMetadata({ app: { user_type: "admin" } }))).toBe("member");
  });
});
