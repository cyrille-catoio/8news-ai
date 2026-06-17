import { describe, it, expect } from "vitest";
import {
  resolveChatDisplayName,
  chatAvatarInitial,
  chatAvatarColor,
  groupChatMessages,
  splitTextAndUrls,
  type UserChatMessage,
} from "@/lib/user-chat";

function msg(over: Partial<UserChatMessage>): UserChatMessage {
  return {
    id: 1,
    user_id: "u1",
    display_name: "Alice",
    content: "hi",
    lang: "en",
    created_at: "2026-06-17T10:00:00.000Z",
    ...over,
  };
}

describe("resolveChatDisplayName", () => {
  it("prefers the nickname when present", () => {
    expect(
      resolveChatDisplayName({ nickname: "nightowl", first_name: "Bob" }, "en"),
    ).toBe("nightowl");
  });

  it("falls back to the first name when no nickname", () => {
    expect(resolveChatDisplayName({ first_name: "Bob" }, "en")).toBe("Bob");
  });

  it("trims values and ignores blanks / non-strings", () => {
    expect(
      resolveChatDisplayName({ nickname: "  ", first_name: "  Bob  " }, "en"),
    ).toBe("Bob");
    expect(resolveChatDisplayName({ nickname: 42 as unknown }, "en")).toBe(
      "Anonymous",
    );
  });

  it("falls back to a localized Anonymous label", () => {
    expect(resolveChatDisplayName({}, "en")).toBe("Anonymous");
    expect(resolveChatDisplayName(null, "fr")).toBe("Anonyme");
  });
});

describe("chatAvatarInitial", () => {
  it("returns the uppercased first character", () => {
    expect(chatAvatarInitial("alice")).toBe("A");
    expect(chatAvatarInitial("  émile")).toBe("É");
  });

  it("returns ? for an empty name", () => {
    expect(chatAvatarInitial("")).toBe("?");
    expect(chatAvatarInitial("   ")).toBe("?");
  });
});

describe("chatAvatarColor", () => {
  it("is deterministic for the same seed", () => {
    expect(chatAvatarColor("u1")).toBe(chatAvatarColor("u1"));
  });

  it("returns a colour from the palette", () => {
    expect(chatAvatarColor("u1")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("groupChatMessages", () => {
  it("merges consecutive messages from the same author", () => {
    const groups = groupChatMessages([
      msg({ id: 1, user_id: "u1", created_at: "2026-06-17T10:00:00.000Z" }),
      msg({ id: 2, user_id: "u1", created_at: "2026-06-17T10:00:30.000Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("starts a new group when the author changes", () => {
    const groups = groupChatMessages([
      msg({ id: 1, user_id: "u1" }),
      msg({ id: 2, user_id: "u2", created_at: "2026-06-17T10:00:10.000Z" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].userId).toBe("u2");
  });

  it("splits the same author after a long gap", () => {
    const groups = groupChatMessages([
      msg({ id: 1, user_id: "u1", created_at: "2026-06-17T10:00:00.000Z" }),
      msg({ id: 2, user_id: "u1", created_at: "2026-06-17T10:30:00.000Z" }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("splitTextAndUrls", () => {
  it("keeps plain text as a single segment", () => {
    expect(splitTextAndUrls("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ]);
  });

  it("extracts a URL and keeps trailing punctuation in text", () => {
    expect(splitTextAndUrls("see https://8news.ai.")).toEqual([
      { type: "text", value: "see " },
      { type: "url", value: "https://8news.ai" },
      { type: "text", value: "." },
    ]);
  });
});
