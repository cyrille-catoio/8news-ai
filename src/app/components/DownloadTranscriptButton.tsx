"use client";

import { useEffect, useRef, useState } from "react";
import { color } from "@/lib/theme";
import type { Lang } from "@/lib/i18n";

/**
 * Small icon-only download button placed next to the favorite control on
 * each video card. Clicking opens a tiny popover with two choices:
 *   - "Summary" → downloads the AI Markdown summary as `<title>.md`.
 *   - "Full transcript" → downloads the raw transcript as `<title>.txt`
 *     via `GET /api/youtube-channels/transcript?videoId=...`.
 * Renders nothing when the video has no stored transcript yet.
 */
export function DownloadTranscriptButton({
  videoId,
  hasTranscription,
  summaryMd,
  title,
  lang,
}: {
  videoId: string;
  hasTranscription: boolean;
  summaryMd: string | null;
  title: string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hasTranscription) return null;

  const labels = lang === "fr"
    ? {
        tooltip: "Télécharger…",
        summary: "Résumé (.md)",
        transcript: "Transcription complète (.txt)",
        downloading: "Téléchargement…",
        downloaded: "Téléchargé",
      }
    : {
        tooltip: "Download…",
        summary: "Summary (.md)",
        transcript: "Full transcript (.txt)",
        downloading: "Downloading…",
        downloaded: "Downloaded",
      };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const slug = (s: string): string =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .toLowerCase() || videoId;

  const flashDone = () => {
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };

  const handleSummary = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    if (!summaryMd) return;
    setBusy(true);
    try {
      const blob = new Blob([summaryMd], { type: "text/markdown;charset=utf-8" });
      triggerBlobDownload(blob, `${slug(title)}.md`);
      flashDone();
    } finally {
      setBusy(false);
    }
  };

  const handleTranscript = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/youtube-channels/transcript?videoId=${encodeURIComponent(videoId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const filename = parseFilenameFromHeaders(res.headers) ?? `${slug(title)}.txt`;
      triggerBlobDownload(blob, filename);
      flashDone();
    } catch {
      // silent fail; the button just resets
    } finally {
      setBusy(false);
    }
  };

  const tooltip = busy ? labels.downloading : done ? labels.downloaded : labels.tooltip;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          setOpen((x) => !x);
        }}
        title={tooltip}
        aria-label={tooltip}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy}
        style={{
          background: "transparent",
          border: "none",
          cursor: busy ? "wait" : "pointer",
          padding: 4,
          color: done ? "#22c55e" : color.textDim,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          transition: "color 0.15s",
        }}
      >
        {done ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12" />
            <polyline points="7 10 12 15 17 10" />
            <path d="M5 21h14" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            // Open upward so the popover stays inside the card (which uses
            // overflow: hidden for its rounded corners) — opening downward
            // would be clipped by the collapsed summary panel below.
            bottom: "calc(100% + 4px)",
            right: 0,
            zIndex: 30,
            minWidth: 220,
            background: color.surface,
            border: `1px solid ${color.gold}`,
            borderRadius: 8,
            boxShadow: `0 -8px 24px rgba(0,0,0,0.55), 0 0 0 1px ${color.gold}33`,
            padding: 4,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <MenuItem onClick={handleSummary} disabled={!summaryMd}>
            <DownloadIcon />
            {labels.summary}
          </MenuItem>
          <MenuItem onClick={handleTranscript}>
            <DownloadIcon />
            {labels.transcript}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: hover && !disabled ? color.surfaceHover : "transparent",
        border: "none",
        color: disabled ? color.textDim : color.text,
        fontSize: 13,
        padding: "8px 12px",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 6,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M5 21h14" />
    </svg>
  );
}

function parseFilenameFromHeaders(headers: Headers): string | null {
  const cd = headers.get("Content-Disposition");
  if (!cd) return null;
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through
    }
  }
  const plain = cd.match(/filename="?([^"]+)"?/i);
  return plain ? plain[1].trim() : null;
}
