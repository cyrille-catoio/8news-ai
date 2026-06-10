"use client";

import { useState } from "react";
import { color } from "@/lib/theme";
import { trackEvent } from "@/lib/track";

const copyBtnStyle = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 4,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  transition: "color 0.15s",
} as const;

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      trackEvent("share.copy_link", { target_id: url });
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? "✓" : "Copy link"}
      style={{ ...copyBtnStyle, color: copied ? "#22c55e" : color.textDim }}
    >
      <CopyIcon copied={copied} />
    </button>
  );
}

export function CopyTextButton({
  text,
  title,
  copiedTitle = "✓",
  onCopied,
}: {
  text: string;
  title: string;
  copiedTitle?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      onCopied?.();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      onMouseDown={(e) => e.stopPropagation()}
      title={copied ? copiedTitle : title}
      aria-label={copied ? copiedTitle : title}
      style={{ ...copyBtnStyle, color: copied ? "#22c55e" : color.textDim }}
    >
      <CopyIcon copied={copied} />
    </button>
  );
}
