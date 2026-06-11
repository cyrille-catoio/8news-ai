import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCookie, setCookie } from "../cookies";

// Minimal document.cookie stub — accumulates `name=value` pairs like a
// browser does (ignoring attributes after the first `;`).
function stubDocumentCookie() {
  const jar = new Map<string, string>();
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(str: string) {
      const [pair] = str.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
    },
  });
}

beforeEach(() => {
  stubDocumentCookie();
});

describe("getCookie / setCookie", () => {
  it("round-trips a simple value", () => {
    setCookie("lang", "fr");
    expect(getCookie("lang")).toBe("fr");
  });

  it("URL-encodes special characters on write and decodes on read", () => {
    setCookie("name", "a=b; c");
    expect(getCookie("name")).toBe("a=b; c");
  });

  it("returns null for a missing cookie", () => {
    expect(getCookie("nope")).toBeNull();
  });

  it("returns null for an empty value", () => {
    document.cookie = "empty=";
    expect(getCookie("empty")).toBeNull();
  });

  it("does not confuse cookies whose names share a prefix", () => {
    document.cookie = "language=en";
    expect(getCookie("lang")).toBeNull();
    document.cookie = "lang=fr";
    expect(getCookie("lang")).toBe("fr");
  });

  it("escapes regex metacharacters in the cookie name", () => {
    document.cookie = "a.b=x";
    document.cookie = "aXb=y";
    expect(getCookie("a.b")).toBe("x");
  });

  it("returns the raw value when decodeURIComponent throws", () => {
    document.cookie = "bad=%E0%A4%A"; // malformed percent-encoding
    expect(getCookie("bad")).toBe("%E0%A4%A");
  });
});
