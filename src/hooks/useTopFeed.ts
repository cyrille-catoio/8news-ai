"use client";

import { useState, useEffect, useCallback } from "react";

export type TopFeedArticle = {
  title: string;
  link: string;
  source: string;
  topic: string;
  pubDate: string;
  score: number;
};

const TOP_FEED_URL = "/api/news/top?limit=20&days=1";
const POLL_MS = 5 * 60_000;

export function useTopFeed(options: { poll: boolean }) {
  const [articles, setArticles] = useState<TopFeedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch(TOP_FEED_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { articles?: TopFeedArticle[] }) => setArticles(json.articles ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(TOP_FEED_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { articles?: TopFeedArticle[] }) => {
        if (!cancelled) setArticles(json.articles ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!options.poll) return;
    const id = setInterval(() => {
      fetch(TOP_FEED_URL, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((json: { articles?: TopFeedArticle[] }) => setArticles(json.articles ?? []))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [options.poll]);

  const clear = useCallback(() => setArticles([]), []);

  return { articles, loading, refresh, clear };
}
