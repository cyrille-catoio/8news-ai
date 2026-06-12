"use client";

import { useState } from "react";
import { FavoriteButton } from "@/app/components/FavoriteButton";
import { AuthModal } from "@/app/components/AuthModal";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/app/providers";
import type { Lang } from "@/lib/i18n";

export function VideoPageFavoriteButton({
  url,
  title,
  source,
  pubDate,
  lang,
  variant,
}: {
  url: string;
  title: string;
  source: string;
  pubDate?: string;
  lang: Lang;
  variant?: "icon" | "pill";
}) {
  const { session } = useAuth();
  const isAuthenticated = Boolean(session?.user);
  const { favoriteUrls, toggleFavorite } = useFavorites(isAuthenticated);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <FavoriteButton
        url={url}
        title={title}
        source={source}
        pubDate={pubDate}
        sourceType="video"
        isFavorite={favoriteUrls.has(url)}
        lang={lang}
        onToggle={toggleFavorite}
        onRequestAuth={() => setAuthOpen(true)}
        isAuthenticated={isAuthenticated}
        variant={variant}
        size={variant === "pill" ? 14 : undefined}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} lang={lang} />
    </>
  );
}
