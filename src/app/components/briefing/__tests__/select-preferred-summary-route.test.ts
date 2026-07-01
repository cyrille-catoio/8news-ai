import { describe, expect, it } from "vitest";
import { selectPreferredSummaryRoute } from "../utils";

interface Route {
  topic_id: string;
  summary_date: string;
  slug_keywords: string;
  lang: string;
}

function r(topic_id: string, summary_date: string, lang: string): Route {
  return { topic_id, summary_date, slug_keywords: `${topic_id}-slug`, lang };
}

// Routes arrive pre-sorted by summary_date DESC (see getAllSummaryRoutes).
const routes: Route[] = [
  r("crypto", "2026-06-30", "en"),
  r("ai", "2026-06-30", "en"),
  r("ai", "2026-06-29", "en"),
  r("crypto", "2026-06-30", "fr"),
  r("ai", "2026-06-30", "fr"),
];

describe("selectPreferredSummaryRoute", () => {
  it("returns the preferred topic's most recent route in the current lang", () => {
    const picked = selectPreferredSummaryRoute(routes, "en", "ai");
    expect(picked).toEqual(r("ai", "2026-06-30", "en"));
  });

  it("falls back to the most recent route across topics when no preference", () => {
    const picked = selectPreferredSummaryRoute(routes, "en", null);
    expect(picked).toEqual(r("crypto", "2026-06-30", "en"));
  });

  it("falls back when the preferred topic has no recent summary", () => {
    const picked = selectPreferredSummaryRoute(routes, "en", "gaming");
    expect(picked).toEqual(r("crypto", "2026-06-30", "en"));
  });

  it("honours the language filter", () => {
    const picked = selectPreferredSummaryRoute(routes, "fr", "ai");
    expect(picked).toEqual(r("ai", "2026-06-30", "fr"));
  });

  it("returns null when no route matches the language", () => {
    expect(selectPreferredSummaryRoute(routes, "fr", null)).not.toBeNull();
    expect(selectPreferredSummaryRoute([], "en", "ai")).toBeNull();
  });
});
