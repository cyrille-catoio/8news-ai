"use client";

import { type CSSProperties, useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import type { TopicLabel } from "@/lib/types";
import { color } from "@/lib/theme";

const MOBILE_TOPIC_PAGE_SIZE = 16;

/**
 * Pill grid letting the user pick a single « topic » to fetch news for,
 * or — when `personalizationMode` is on — toggle a topic's membership in
 * the user's preferred-topics list.
 *
 * On mobile (≤ 640 px) the grid paginates 16 topics at a time so we
 * never blow up the toolbar height; the page auto-scrolls to the page
 * containing the selected topic on toggle/lang change.
 *
 * v2.12 extracted from `src/app/app/page.tsx`. No behavior change.
 */
export function TopicToggle({
  topics,
  topic,
  lang,
  disabled,
  onChange,
  personalizationMode = false,
  preferredTopicIds,
  onTogglePreference,
}: {
  topics: TopicLabel[];
  topic: string | null;
  lang: Lang;
  disabled: boolean;
  onChange: (t: string) => void;
  personalizationMode?: boolean;
  preferredTopicIds: string[] | null;
  onTogglePreference: (id: string) => void;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [page, setPage] = useState(0);
  const pageCount = isMobile ? Math.max(1, Math.ceil(topics.length / MOBILE_TOPIC_PAGE_SIZE)) : 1;
  const visibleTopics = isMobile
    ? topics.slice(page * MOBILE_TOPIC_PAGE_SIZE, (page + 1) * MOBILE_TOPIC_PAGE_SIZE)
    : topics;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (!isMobile || !topic) return;
    const selectedIndex = topics.findIndex((tp) => tp.id === topic);
    if (selectedIndex >= 0) {
      setPage(Math.floor(selectedIndex / MOBILE_TOPIC_PAGE_SIZE));
    }
  }, [isMobile, topic, topics]);

  const btnStyle = (value: string): CSSProperties => {
    if (personalizationMode) {
      const inPrefs = preferredTopicIds === null || preferredTopicIds.includes(value);
      return {
        padding: "8px 0",
        fontSize: 14,
        fontWeight: 600,
        border: `1px solid ${color.gold}`,
        cursor: "pointer",
        background: inPrefs ? color.gold : "transparent",
        color: inPrefs ? "#000" : color.gold,
        transition: "all 0.15s",
        opacity: inPrefs ? 1 : 0.45,
        borderRadius: 6,
        textAlign: "center",
      };
    }
    return {
      padding: "8px 0",
      fontSize: 14,
      fontWeight: 600,
      border: `1px solid ${color.gold}`,
      cursor: disabled ? "wait" : "pointer",
      background: topic === value ? color.gold : "transparent",
      color: topic === value ? "#000" : color.gold,
      transition: "all 0.15s",
      opacity: disabled ? 0.6 : 1,
      borderRadius: 6,
      textAlign: "center",
    };
  };

  return (
    <>
      <div
        className={`topic-grid${isMobile && pageCount > 1 ? " topic-grid-paginated" : ""}`}
        style={{ ["--topic-grid-cols" as string]: Math.min(visibleTopics.length || 8, 8) } as CSSProperties}
      >
        {visibleTopics.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => personalizationMode ? onTogglePreference(id) : onChange(id)}
            disabled={!personalizationMode && disabled}
            style={btnStyle(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {isMobile && pageCount > 1 && (
        <div className="topic-pagination" aria-label={lang === "fr" ? "Pagination des topics" : "Topic pagination"}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label={lang === "fr" ? "Page précédente" : "Previous page"}
          >
            ←
          </button>
          <span>
            {page + 1}/{pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            aria-label={lang === "fr" ? "Page suivante" : "Next page"}
          >
            →
          </button>
        </div>
      )}
    </>
  );
}
