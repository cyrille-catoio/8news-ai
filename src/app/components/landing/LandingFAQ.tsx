"use client";

import { useState } from "react";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * Accordion FAQ. Client Component because each item can be expanded /
 * collapsed independently. The `.open` class activates the CSS
 * max-height + plus-rotation transitions defined in landing.css.
 */
export function LandingFAQ({ lang }: { lang: LandingLang }) {
  const f = LANDING_CONTENT.faq;
  const items = f.items[lang];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="kicker">{f.kicker[lang]}</div>
        <h2 className="big" style={{ marginTop: 16 }}>
          {f.title[lang]}
        </h2>
        <div className="faq-list">
          {items.map(([q, a], i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`faq-item${isOpen ? " open" : ""}`}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenIndex(isOpen ? null : i);
                  }
                }}
              >
                <div className="faq-q">
                  <div className="q">{q}</div>
                  <div className="plus" aria-hidden>+</div>
                </div>
                <div className="faq-a">{a}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
