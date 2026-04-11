"use client";

import { useState, useEffect, useCallback } from "react";
import type { Lang } from "@/lib/i18n";

export type TopFeedArticle = {
  title: string;
  snippet: string;
  link: string;
  source: string;
  topic: string;
  pubDate: string;
  score: number;
};

const POLL_MS = 5 * 60_000;

function buildTopFeedUrl(lang: Lang, preferredTopics: string[] | null): string {
  const base = `/api/news/top?limit=50&days=1&lang=${lang}`;
  if (preferredTopics && preferredTopics.length > 0) {
    return `${base}&topics=${encodeURIComponent(preferredTopics.join(","))}`;
  }
  return base;
}

export function useTopFeed(options: { poll: boolean; lang: Lang; preferredTopics: string[] | null; enabled: boolean }) {
  const { poll, lang, preferredTopics, enabled } = options;
  const [articles, setArticles] = useState<TopFeedArticle[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    fetch(buildTopFeedUrl(lang, preferredTopics), { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { articles?: TopFeedArticle[] }) => {
        setArticles(json.articles ?? []);
        setLastUpdatedAt(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled, lang, preferredTopics]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(buildTopFeedUrl(lang, preferredTopics), { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { articles?: TopFeedArticle[] }) => {
        if (!cancelled) {
          setArticles(json.articles ?? []);
          setLastUpdatedAt(new Date());
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, lang, preferredTopics]);

  useEffect(() => {
    if (!enabled || !poll) return;
    const id = setInterval(() => {
      fetch(buildTopFeedUrl(lang, preferredTopics), { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((json: { articles?: TopFeedArticle[] }) => {
          setArticles(json.articles ?? []);
          setLastUpdatedAt(new Date());
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, poll, lang, preferredTopics]);

  const clear = useCallback(() => {
    setArticles([]);
    setLastUpdatedAt(null);
  }, []);

  return { articles, loading, refresh, clear, lastUpdatedAt };
}
