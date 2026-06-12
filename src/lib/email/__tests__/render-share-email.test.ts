import { describe, expect, it } from "vitest";
import { renderShareEmail } from "../render-share-email";

const BASE = {
  url: "https://8news.ai/ai/v/2026-06-12/openai-gpt-6-launch",
  title: "OpenAI launches GPT-6",
  lang: "en" as const,
};

describe("renderShareEmail", () => {
  it("builds a localized subject containing the page title", () => {
    const en = renderShareEmail(BASE);
    expect(en.subject).toBe("Shared with you: OpenAI launches GPT-6");

    const fr = renderShareEmail({ ...BASE, lang: "fr" });
    expect(fr.subject).toBe("Partagé avec vous : OpenAI launches GPT-6");
  });

  it("includes the URL in both the HTML CTA and the plain text", () => {
    const { html, text } = renderShareEmail(BASE);
    expect(html).toContain(`href="${BASE.url}"`);
    expect(text).toContain(BASE.url);
  });

  it("renders the optional personal message when provided", () => {
    const { html, text } = renderShareEmail({ ...BASE, message: "Tu vas adorer cette vidéo" });
    expect(html).toContain("Tu vas adorer cette vidéo");
    expect(text).toContain("Tu vas adorer cette vidéo");
  });

  it("omits the message block when the message is empty or whitespace", () => {
    const without = renderShareEmail({ ...BASE, message: "   " });
    expect(without.html).not.toContain("border-left");
  });

  it("escapes HTML in user-provided title and message", () => {
    const { html } = renderShareEmail({
      ...BASE,
      title: 'Hello <script>alert("x")</script>',
      message: "a & b <img src=x>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt;img src=x&gt;");
  });

  it("localizes intro and CTA per lang", () => {
    const fr = renderShareEmail({ ...BASE, lang: "fr" });
    expect(fr.html).toContain("Lire sur 8news.ai");
    expect(fr.text).toContain("Quelqu'un souhaite partager");

    const en = renderShareEmail(BASE);
    expect(en.html).toContain("Read on 8news.ai");
  });
});
