import { describe, it, expect } from "vitest";
import { stripEmojis } from "../VideoCardHelpers";

describe("stripEmojis", () => {
  it("strips common pictographs", () => {
    expect(stripEmojis("🚀 Bitcoin to the moon 🔥")).toBe("Bitcoin to the moon");
  });

  it("strips ZWJ sequences and skin-tone modifiers", () => {
    expect(stripEmojis("Builders 👨‍👩‍👧‍👦 and devs 👍🏽 unite")).toBe("Builders and devs unite");
  });

  it("strips flags and demotes keycaps to their plain digit", () => {
    expect(stripEmojis("Top 3️⃣ news 🇫🇷 today")).toBe("Top 3 news today");
  });

  it("strips variation-selector emoji like ⚠️ and ▶️", () => {
    expect(stripEmojis("⚠️ Warning ▶️ watch now")).toBe("Warning watch now");
  });

  it("keeps © ® ™ text symbols", () => {
    expect(stripEmojis("Acme™ © 2026, Roadster®")).toBe("Acme™ © 2026, Roadster®");
  });

  it("collapses leftover double spaces and orphan punctuation spacing", () => {
    expect(stripEmojis("Big 🚀 news 🔥 !")).toBe("Big news!");
  });

  it("leaves plain text and accents untouched", () => {
    expect(stripEmojis("Résumé complet — l'IA en 2026")).toBe("Résumé complet — l'IA en 2026");
  });

  it("returns empty string for emoji-only input", () => {
    expect(stripEmojis("🚀🔥👇")).toBe("");
  });
});
