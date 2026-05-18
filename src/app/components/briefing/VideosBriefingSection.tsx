"use client";

import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import type { TopicLabel, VideoItem } from "@/lib/types";
import { VideoCard } from "@/app/components/VideoCard";
import { kicker, ctaLink } from "@/app/components/briefing/styles";
import { HistoryArrows } from "@/app/components/briefing/HistoryArrows";

/**
 * Renders the briefing's transcribed-videos block using the same VideoCard
 * component as `/app/videos`, so the play button, summary toggle, audio
 * player and download menu behave identically across the two pages.
 *
 * v2.12 extracted from `BriefingPage.tsx`.
 */
export function VideosBriefingSection({
  videos,
  videoSummaries,
  transcribing,
  onTranscribe,
  lang,
  ttsSpeed,
  ttsVoice,
  favoriteUrls,
  onToggleFavorite,
  isAuthenticated,
  onRequestAuth,
  onSeeAll,
  historyOffset,
  canGoOlder,
  onHistoryPrev,
  onHistoryNext,
  topicLabels,
  onPlaybackChange,
}: {
  videos: VideoItem[];
  videoSummaries: Record<string, string>;
  transcribing: Record<string, boolean>;
  onTranscribe: (v: VideoItem) => void;
  lang: Lang;
  ttsSpeed: number;
  ttsVoice: string;
  favoriteUrls: Set<string>;
  onToggleFavorite: (a: { url: string; title: string; source: string; pubDate?: string; sourceType?: "article" | "video" }) => void;
  isAuthenticated: boolean;
  onRequestAuth: () => void;
  onSeeAll: () => void;
  historyOffset: number;
  canGoOlder: boolean;
  onHistoryPrev: () => void;
  onHistoryNext: () => void;
  topicLabels: TopicLabel[];
  onPlaybackChange: (playing: boolean) => void;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ ...kicker(color.gold) }}>
          {lang === "fr" ? "TOP VIDEO · MAINTENANT" : "TOP VIDEO · NOW"}
        </div>
        <HistoryArrows
          offset={historyOffset}
          canGoOlder={canGoOlder}
          onPrev={onHistoryPrev}
          onNext={onHistoryNext}
          lang={lang}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {videos.map((v) => (
          <VideoCard
            key={v.videoId}
            v={v}
            lang={lang}
            summaryMd={videoSummaries[v.videoId] ?? null}
            transcribing={!!transcribing[v.videoId]}
            onTranscribe={() => onTranscribe(v)}
            speed={ttsSpeed}
            voice={ttsVoice}
            isFavorite={favoriteUrls.has(v.link)}
            isAuthenticated={isAuthenticated}
            onToggleFavorite={onToggleFavorite}
            onRequestAuth={onRequestAuth}
            variant="hero"
            topicLabels={topicLabels}
            onPlaybackChange={onPlaybackChange}
          />
        ))}
      </div>
      <button type="button" onClick={onSeeAll} style={{ ...ctaLink, marginTop: 14 }}>
        {lang === "fr" ? "Toutes les vidéos →" : "All videos →"}
      </button>
    </section>
  );
}
