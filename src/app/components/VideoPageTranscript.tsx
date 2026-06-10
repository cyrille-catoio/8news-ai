"use client";

import { useState } from "react";
import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";
import { CopyTextButton } from "@/app/components/CopyLinkButton";
import { trackEvent } from "@/lib/track";

/**
 * Lazy-loaded full transcript for SSR video pages. The transcript text is
 * fetched on first expand so crawlers indexing the initial HTML only see
 * the AI summary above, not the raw YouTube transcript.
 */
export function VideoPageTranscript({
  videoId,
  lang,
}: {
  videoId: string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyTitle =
    lang === "fr" ? "Copier la transcription" : "Copy transcript";

  async function loadTranscript() {
    if (transcript || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-transcript?videoId=${encodeURIComponent(videoId)}`);
      if (!res.ok) {
        throw new Error(res.status === 404 ? "not_found" : "fetch_failed");
      }
      const data = (await res.json()) as { transcript?: string };
      setTranscript((data.transcript ?? "").trim() || null);
    } catch {
      setError(lang === "fr" ? "Impossible de charger la transcription." : "Could not load transcript.");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const nextOpen = e.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen) void loadTranscript();
  }

  function trackCopy() {
    trackEvent("share.copy_transcript", { target_id: videoId, lang });
  }

  const copyProps = transcript
    ? { text: transcript, title: copyTitle, onCopied: trackCopy }
    : null;

  return (
    <details
      open={open}
      onToggle={handleToggle}
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 10,
        padding: "16px 24px",
        marginBottom: 24,
      }}
    >
      <summary
        style={{
          color: color.gold,
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          cursor: "pointer",
          outline: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          listStyle: "none",
        }}
      >
        <span>{lang === "fr" ? "Transcription complète" : "Full transcript"}</span>
        {open && copyProps && <CopyTextButton {...copyProps} />}
      </summary>
      <div
        data-nosnippet
        style={{ marginTop: 16 }}
      >
        {loading && (
          <p style={{ color: color.textMuted, fontSize: 14, margin: 0 }}>
            {lang === "fr" ? "Chargement…" : "Loading…"}
          </p>
        )}
        {error && (
          <p style={{ color: color.errorText, fontSize: 14, margin: 0 }}>{error}</p>
        )}
        {transcript && (
          <>
            <p style={{
              color: color.textSecondary,
              fontSize: 14,
              lineHeight: 1.6,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}>
              {transcript}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              {copyProps && <CopyTextButton {...copyProps} />}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
