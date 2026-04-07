"use client";

import { color } from "@/lib/theme";

export const TTS_VOICES_EN = [
  { id: "sarah",   label: "Jade",    desc: "American · Soft",          gender: "F" },
  { id: "alice",   label: "Alice",   desc: "British · Confident",      gender: "F" },
  { id: "rachel",  label: "Rachel",  desc: "American · Calm",          gender: "F" },
  { id: "daniel",  label: "Nicolas", desc: "British · News presenter", gender: "M" },
  { id: "drew",    label: "Drew",    desc: "American · News",          gender: "M" },
  { id: "josh",    label: "Josh",    desc: "American · Deep",          gender: "M" },
] as const;

export const TTS_VOICES_FR = [
  { id: "george",    label: "Tristan",   desc: "Chaleureux · Posé",     gender: "M" },
  { id: "charlotte", label: "Charlotte", desc: "Chaleureuse · Douce",   gender: "F" },
  { id: "lily",      label: "Lily",      desc: "Posée · Naturelle",     gender: "F" },
  { id: "nicole",    label: "Nicole",    desc: "Intime · Calme",        gender: "F" },
  { id: "thomas",    label: "Thomas",    desc: "Calme · Narrateur",     gender: "M" },
  { id: "callum",    label: "Callum",    desc: "Intense · Dynamique",   gender: "M" },
] as const;

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
