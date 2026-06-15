import { describe, expect, it } from "vitest";
import { autoLinkPlainUrls } from "@/app/components/podcast-chat/PodcastChatMarkdown";

describe("autoLinkPlainUrls", () => {
  it("turns bare http(s) URLs into markdown links", () => {
    expect(autoLinkPlainUrls("Source: https://8news.ai/ai/v/2026-06-13/foo")).toBe(
      "Source: [https://8news.ai/ai/v/2026-06-13/foo](https://8news.ai/ai/v/2026-06-13/foo)",
    );
  });

  it("keeps trailing sentence punctuation outside the link", () => {
    expect(autoLinkPlainUrls("Read https://example.com/a?x=1.")).toBe(
      "Read [https://example.com/a?x=1](https://example.com/a?x=1).",
    );
  });

  it("does not rewrite existing markdown links or autolinks", () => {
    expect(autoLinkPlainUrls("[8news](https://8news.ai) and <https://8news.ai>")).toBe(
      "[8news](https://8news.ai) and <https://8news.ai>",
    );
  });

  it("does not rewrite inline code or fenced code blocks", () => {
    const source = [
      "Inline `https://example.com/code` stays.",
      "```",
      "https://example.com/fence",
      "```",
      "But https://example.com/live links.",
    ].join("\n");
    expect(autoLinkPlainUrls(source)).toBe([
      "Inline `https://example.com/code` stays.",
      "```",
      "https://example.com/fence",
      "```",
      "But [https://example.com/live](https://example.com/live) links.",
    ].join("\n"));
  });
});
