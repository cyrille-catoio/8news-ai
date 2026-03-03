"use client";

import { useState } from "react";
import type { SummaryResponse } from "@/lib/types";

const PERIODS = [
  { label: "1 h", hours: 1 },
  { label: "6 h", hours: 6 },
  { label: "12 h", hours: 12 },
  { label: "24 h", hours: 24 },
  { label: "48 h", hours: 48 },
] as const;

export default function Home() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchNews(h: number) {
    setHours(h);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news?hours=${h}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Erreur ${res.status}`);
      }
      const json: SummaryResponse = await res.json();
      setData(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      const isConnectionFailed =
        msg === "Failed to fetch" ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed");
      setError(
        isConnectionFailed
          ? "Connexion impossible. Vérifiez que le serveur tourne (npm run dev) et ouvrez http://localhost:3000"
          : msg
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-10 border-b border-[#2a2a2a] pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[#c9a227] sm:text-3xl">
            NewsRead — Conflit USA / Israël vs Iran
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Résumé des dernières actualités issues de 10 flux RSS, filtrées par IA.
          </p>
        </header>

        <section className="mb-8">
          <p className="mb-3 text-sm font-medium text-zinc-400">Période</p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(({ label, hours: h }) => (
              <button
                key={h}
                onClick={() => fetchNews(h)}
                disabled={loading}
                className={
                  "rounded-lg border px-4 py-2 text-sm font-medium transition-colors " +
                  (hours === h
                    ? "border-[#c9a227] bg-[#c9a227] text-black"
                    : "border-[#2a2a2a] bg-[#141414] text-zinc-300 hover:border-[#9a7b1a] hover:text-[#e6c84e]")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-[#c9a227]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#c9a227] border-t-transparent" />
            Chargement des flux RSS et analyse par IA…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        {!loading && data && (
          <div className="space-y-8">
            <div className="rounded-xl border border-[#2a2a2a] bg-[#111] p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#c9a227]">
                Résumé
              </h2>
              <p className="whitespace-pre-wrap text-zinc-200">{data.summary}</p>
              <p className="mt-3 text-xs text-zinc-500">
                {new Date(data.period.from).toLocaleString("fr-FR")} →{" "}
                {new Date(data.period.to).toLocaleString("fr-FR")}
              </p>
            </div>

            {data.articles.length > 0 && (
              <div>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#c9a227]">
                  Articles retenus ({data.articles.length})
                </h2>
                <ul className="space-y-4">
                  {data.articles.map((art, i) => (
                    <li
                      key={`${art.link}-${i}`}
                      className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4 transition-colors hover:border-[#3a3a2a]"
                    >
                      <a
                        href={art.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <span className="font-medium text-zinc-100 hover:text-[#e6c84e]">
                          {art.title}
                        </span>
                        <p className="mt-1 text-sm text-zinc-500">{art.snippet}</p>
                        <p className="mt-2 text-xs text-[#c9a227]">
                          {art.source} · {art.pubDate ? new Date(art.pubDate).toLocaleString("fr-FR") : ""}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && data && data.articles.length === 0 && (
              <p className="text-zinc-500">
                Aucun article lié au conflit USA/Israël vs Iran sur cette période.
              </p>
            )}
          </div>
        )}

        {!loading && !data && !error && (
          <p className="py-8 text-zinc-500">
            Choisissez une période (1 h, 6 h, 12 h, 24 h ou 48 h) pour charger les derniers articles
            et afficher le résumé.
          </p>
        )}
      </div>
    </div>
  );
}
