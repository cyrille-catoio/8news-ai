"use client";

import ReactMarkdown from "react-markdown";
import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import { CopyTextButton } from "@/app/components/CopyLinkButton";
import { videoPageMdComponents } from "@/app/components/video-page-markdown";
import { trackEvent } from "@/lib/track";

/**
 * AI summary block for per-video SSR pages — markdown body with copy
 * affordances top-right and bottom-right (same placement as the full
 * transcript panel below).
 */
export function VideoPageSummary({
  summaryMd,
  videoId,
  lang,
}: {
  summaryMd: string;
  videoId: string;
  lang: Lang;
}) {
  const copyTitle = lang === "fr" ? "Copier le résumé" : "Copy summary";
  const copyProps = {
    text: summaryMd,
    title: copyTitle,
    onCopied: () => trackEvent("share.copy_summary", { target_id: videoId, lang }),
  };

  return (
    <section
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 10,
        padding: "16px 24px 20px",
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          marginBottom: 4,
        }}
      >
        <CopyTextButton {...copyProps} />
      </div>
      <ReactMarkdown components={videoPageMdComponents}>{summaryMd}</ReactMarkdown>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <CopyTextButton {...copyProps} />
      </div>
    </section>
  );
}
