"use client";

import { useState, type CSSProperties } from "react";
import { color } from "@/lib/theme";

/**
 * Lightweight, dependency-free emoji picker for the Community chat.
 *
 * We deliberately do NOT pull in `emoji-mart`: its React adapter pins a
 * `react@^16–18` peer range and refuses to install on this repo's React
 * 19 tree (would force a project-wide `legacy-peer-deps`). Instead we
 * render native Unicode emoji in a Discord-style category grid — which is
 * exactly what the owner asked for: on iPhone these resolve to the Apple
 * emoji set, elsewhere to the platform set, with zero extra bundle weight.
 */

interface EmojiCategory {
  id: string;
  label: { en: string; fr: string };
  emojis: string[];
}

const CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: { en: "Smileys", fr: "Smileys" },
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😋",
      "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
      "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😴", "😪", "😮‍💨",
      "😎", "🤓", "🧐", "🥳", "🤯", "😱", "😭", "😢", "😤", "😡",
    ],
  },
  {
    id: "gestures",
    label: { en: "Gestures", fr: "Gestes" },
    emojis: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘", "👏", "🙌",
      "👐", "🙏", "🤝", "💪", "👋", "🤙", "👆", "👇", "👉", "👈",
      "✍️", "🫶", "👀", "🧠", "👃", "👂", "🦾", "🫡", "🤷", "🤦",
    ],
  },
  {
    id: "hearts",
    label: { en: "Hearts", fr: "Cœurs" },
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "✨", "💯",
      "🔥", "⭐", "🌟", "💫", "⚡", "🎉", "🎊", "🚀", "🏆", "🥇",
    ],
  },
  {
    id: "animals",
    label: { en: "Animals", fr: "Animaux" },
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦄", "🐝",
      "🦋", "🐢", "🐙", "🐳", "🐬", "🦉", "🦕", "🌳", "🌸", "🌍",
    ],
  },
  {
    id: "food",
    label: { en: "Food", fr: "Nourriture" },
    emojis: [
      "🍏", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑",
      "🥑", "🍅", "🌶️", "🌽", "🥕", "🍔", "🍟", "🍕", "🌮", "🍜",
      "🍣", "🍩", "🍪", "🎂", "🍰", "🍫", "🍿", "☕", "🍺", "🥂",
    ],
  },
  {
    id: "objects",
    label: { en: "Objects", fr: "Objets" },
    emojis: [
      "💻", "🖥️", "📱", "⌨️", "🖱️", "🎧", "📷", "🔋", "💡", "🔌",
      "📈", "📉", "📊", "📅", "📌", "📎", "🔒", "🔑", "🛠️", "⚙️",
      "💰", "💸", "💳", "📦", "✅", "❌", "❓", "❗", "💬", "🔔",
    ],
  },
];

export function EmojiPicker({
  onSelect,
  lang,
}: {
  onSelect: (emoji: string) => void;
  lang: "en" | "fr";
}) {
  const [active, setActive] = useState(CATEGORIES[0].id);
  const category = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];

  const tabStyle = (isActive: boolean): CSSProperties => ({
    flex: 1,
    padding: "6px 4px",
    fontSize: 11,
    fontWeight: 600,
    border: "none",
    borderBottom: `2px solid ${isActive ? color.gold : "transparent"}`,
    background: "transparent",
    color: isActive ? color.gold : color.textMuted,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  });

  return (
    <div
      role="dialog"
      aria-label={lang === "fr" ? "Sélecteur d'émojis" : "Emoji picker"}
      style={{
        width: 280,
        maxWidth: "calc(100vw - 40px)",
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${color.border}`,
          overflowX: "auto",
        }}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            style={tabStyle(c.id === active)}
            title={c.label[lang]}
          >
            {c.label[lang]}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 2,
          padding: 8,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {category.emojis.map((emoji, i) => (
          <button
            key={`${category.id}-${i}`}
            type="button"
            onClick={() => onSelect(emoji)}
            aria-label={emoji}
            style={{
              border: "none",
              background: "transparent",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "5px 0",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = color.surfaceHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
