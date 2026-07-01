"use client";

import { color } from "@/lib/theme";

// Voice data moved to `@/lib/tts` (SSR-safe, shared with `readTtsVoice`).
// Re-exported here so existing importers keep working unchanged.
export { TTS_VOICES_EN, TTS_VOICES_FR } from "@/lib/tts";

export function VoiceAccordion({
  label,
  voices,
  selected,
  onChange,
  open,
  onToggle,
}: {
  label: string;
  voices: readonly { id: string; label: string; desc: string; gender: string }[];
  selected: string;
  onChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          color: color.textLabel,
          fontSize: 14,
          fontWeight: 500,
          marginBottom: open ? 8 : 0,
        }}
      >
        {label}
        <span style={{ fontSize: 14, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => onChange(v.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${selected === v.id ? color.gold : color.borderLight}`,
                background: selected === v.id ? color.gold : "transparent",
                color: selected === v.id ? "#000" : color.text,
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                lineHeight: 1.3,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontWeight: 600 }}>{v.label}</span>
              <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>{v.gender}</span>
              <br />
              <span style={{ fontSize: 11, opacity: 0.65 }}>{v.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
