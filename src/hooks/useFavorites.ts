"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface FavoriteArticle {
  url: string;
  title: string;
  source: string;
  pubDate?: string;
  sourceType?: "article" | "video";
}

export function useFavorites(isAuthenticated: boolean) {
  const [favoriteUrls, setFavoriteUrls] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setFavoriteUrls(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/user/favorites?urls=1", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { urls: string[] }) => {
        if (!cancelled) setFavoriteUrls(new Set(json.urls));
      })
      .catch(() => {
        if (!cancelled) setFavoriteUrls(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const toggleFavorite = useCallback(
    (article: FavoriteArticle) => {
      const url = article.url;
      const wasFavorite = favoriteUrls.has(url);

      setFavoriteUrls((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(url);
        else next.add(url);
        return next;
      });

      const request = wasFavorite
        ? fetch("/api/user/favorites", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })
        : fetch("/api/user/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: article.url,
              title: article.title,
              source: article.source,
              pubDate: article.pubDate,
              sourceType: article.sourceType ?? "article",
            }),
          });

      request.then((r) => {
        if (!r.ok) throw new Error();
      }).catch(() => {
        if (mountedRef.current) {
          setFavoriteUrls((prev) => {
            const rollback = new Set(prev);
            if (wasFavorite) rollback.add(url);
            else rollback.delete(url);
            return rollback;
          });
        }
      });
    },
    [favoriteUrls],
  );

  return { favoriteUrls, toggleFavorite, loading };
}
