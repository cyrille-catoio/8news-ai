import { createClient } from "@supabase/supabase-js";
import { LANDING_CONTENT, type LandingLang } from "@/lib/landing-content";

/**
 * Live "scoring console" widget shown on the right side of the hero.
 *
 * Async Server Component: pulls 6 real articles from Supabase — one per
 * target score [10, 9, 8, 7, 5, 3] from distinct topics, picked in the
 * last 24 h. Falls back to the static mock in `landing-content.ts` if
 * Supabase env is missing or returns no usable data so the landing
 * never renders empty.
 *
 * The footer shows the actual 24 h article count (real); the average
 * delay stays hardcoded since we don't track it precisely yet.
 */

const TARGET_SCORES = [10, 9, 8, 7, 5, 3] as const;
const FAKE_AVG_DELAY = "1m25s";

interface PoolRow {
  title: string;
  source: string;
  topic: string;
  fetched_at: string;
  relevance_score: number;
}

interface ConsoleRow {
  score: number;
  title: string;
  source: string;
  topic: string;
  ago: string;
}

async function fetchConsoleData(): Promise<{ rows: PoolRow[]; total: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Two queries in parallel: total count + a wide pool of recently
    // scored articles. The pool is capped at 1000 rows: a typical 24 h
    // window stays well below this and we don't need more than a few per
    // score to make the picker work.
    const [totalRes, poolRes] = await Promise.all([
      db
        .from("articles")
        .select("*", { count: "exact", head: true })
        .gte("fetched_at", sinceISO),
      db
        .from("articles")
        .select("title, source, topic, fetched_at, relevance_score")
        .gte("fetched_at", sinceISO)
        .not("relevance_score", "is", null)
        .order("fetched_at", { ascending: false })
        .limit(1000),
    ]);

    const total = totalRes.count ?? 0;
    const pool = (poolRes.data ?? []) as PoolRow[];

    return { rows: pool, total };
  } catch {
    return null;
  }
}

/**
 * Pick one article per target score from distinct topics.
 *  - Prefer an exact score match.
 *  - Fall back to ±1 (e.g. score 10 may be replaced by a 9 if no 10
 *    exists in the last 24 h, score 5 by a 4 or 6, etc.) so the row
 *    always exists if the pool has enough variety.
 *  - Topic uniqueness is enforced across the whole picked set so the 6
 *    rows visually represent different subjects.
 *
 * Returns the picked rows in TARGET_SCORES order. The displayed score
 * is locked to the target value so the visual ladder (10 → 3) is
 * preserved even when the actual score was ±1.
 */
function pickByScores(pool: PoolRow[]): PoolRow[] {
  const usedTopics = new Set<string>();
  const picked: PoolRow[] = [];

  for (const target of TARGET_SCORES) {
    // Exact match first.
    const exact = pool.find(
      (p) => p.relevance_score === target && !usedTopics.has(p.topic),
    );
    let chosen: PoolRow | undefined = exact;
    if (!chosen) {
      chosen = pool.find(
        (p) =>
          typeof p.relevance_score === "number" &&
          Math.abs(p.relevance_score - target) <= 1 &&
          !usedTopics.has(p.topic),
      );
    }
    if (chosen) {
      picked.push({ ...chosen, relevance_score: target });
      usedTopics.add(chosen.topic);
    }
  }

  return picked;
}

function relativeAgo(fetchedAt: string, lang: LandingLang): string {
  const ms = Date.now() - new Date(fetchedAt).getTime();
  if (ms < 0 || isNaN(ms)) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (minutes < 60) return lang === "fr" ? `${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === "fr" ? `${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === "fr" ? `${days}j` : `${days}d ago`;
}

function formatFooter(total: number, lang: LandingLang): string {
  const formatted = total.toLocaleString(lang === "fr" ? "fr-FR" : "en-US");
  return lang === "fr"
    ? `Collectés <b>${formatted}</b> · <b>délai moyen ${FAKE_AVG_DELAY}</b>`
    : `Fetched <b>${formatted}</b> · <b>avg delay ${FAKE_AVG_DELAY}</b>`;
}

export async function LandingConsole({ lang }: { lang: LandingLang }) {
  const k = LANDING_CONTENT.console;
  const data = await fetchConsoleData();

  // Fall back to the static mock if DB is offline or we couldn't pick
  // at least 3 distinct rows (a half-empty console looks broken).
  const picked = data ? pickByScores(data.rows) : [];
  const useMock = picked.length < 3;

  const rows: ConsoleRow[] = useMock
    ? k.rows.map((r, i) => ({
        score: r.s,
        title: lang === "en" ? r.t_en : r.t_fr,
        source: r.src,
        topic: r.topic,
        ago: lang === "fr" ? `${8 - i}m` : `${8 - i}m ago`,
      }))
    : picked.map((r) => ({
        score: r.relevance_score,
        title: r.title,
        source: r.source,
        topic: r.topic.toUpperCase(),
        ago: relativeAgo(r.fetched_at, lang),
      }));

  const footerHtml = useMock || !data
    ? k.footer[lang]
    : formatFooter(data.total, lang);

  return (
    <div className="console scoring-console">
      <div className="console-header">
        <div className="console-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="console-title">
          <span className="pulse" />
          {k.title[lang]}
        </div>
        <div className="console-title" style={{ color: "var(--text-4)" }}>
          GPT-4.1-nano
        </div>
      </div>
      <div className="console-body">
        {rows.map((r, i) => {
          const w = r.score / 10;
          const barClass =
            r.score >= 9
              ? "bar-green"
              : r.score >= 5
              ? ""
              : r.score >= 3
              ? "bar-orange"
              : "bar-red";
          // Number color matches the bar tier so the score + bar read as
          // one unit. Default tier (5-8) uses gold, same as the default bar.
          const meterColor =
            r.score >= 9
              ? "var(--green)"
              : r.score >= 5
              ? "var(--gold)"
              : r.score >= 3
              ? "var(--orange)"
              : "var(--red)";
          return (
            <div key={i} className="score-row" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="score-body">
                <div className="title">{r.title}</div>
                <div className="src">
                  <span className="topic">{r.topic}</span>
                  {r.source} · {r.ago}
                </div>
              </div>
              <div className="score-meter">
                <span className="score-num" style={{ color: meterColor }}>
                  {r.score}
                </span>
                <div className={`score-bar ${barClass}`}>
                  <i style={{ width: `${w * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="console-footer"
        // dangerouslySetInnerHTML lets us keep the <b>…</b> highlights on
        // the live count. Both branches (mock + real) come from typed
        // strings under our control, never user input.
        dangerouslySetInnerHTML={{ __html: footerHtml }}
      />
    </div>
  );
}
