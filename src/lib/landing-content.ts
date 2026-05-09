// Bilingual landing-page content. Ported from landing-source/assets/*.js
// (window.CONTENT). Kept as a dedicated module rather than added to
// src/lib/i18n.ts to avoid bloating the global translation object — the
// landing has many keys and is consumed by a single page (`src/app/page.tsx`).

export type LandingLang = "en" | "fr";

export interface LandingContent {
  nav: {
    links: { en: [string, string][]; fr: [string, string][] };
    signin: { en: string; fr: string };
    cta: { en: string; fr: string };
  };
  hero: {
    kicker: { en: string; fr: string };
    headline: { en: string; fr: string };
    sub: { en: string; fr: string };
    ctaPrimary: { en: string; fr: string };
    ctaSecondary: { en: string; fr: string };
    hint: { en: string; fr: string };
  };
  console: {
    title: { en: string; fr: string };
    footer: { en: string; fr: string };
    rows: Array<{ s: number; t_en: string; t_fr: string; src: string; topic: string }>;
  };
  scoringSection: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    sub: { en: string; fr: string };
  };
  ticker: {
    items_en: string[];
    items_fr: string[];
  };
  stats: {
    en: Array<{ n: string; unit?: string; l: string }>;
    fr: Array<{ n: string; unit?: string; l: string }>;
  };
  how: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    steps: {
      en: Array<{ num: string; title: string; body: string; viz: "fetch" | "score" | "summary" }>;
      fr: Array<{ num: string; title: string; body: string; viz: "fetch" | "score" | "summary" }>;
    };
  };
  topics: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    sub: { en: string; fr: string };
    list: Array<{ label_en: string; label_fr: string; feeds: number }>;
  };
  pricing: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    plans: {
      en: Array<{ tag: string; name: string; price: string; per: string; priceYear?: string; perYear?: string; saveLabel?: string; desc: string; features: string[]; cta: string; featured: boolean }>;
      fr: Array<{ tag: string; name: string; price: string; per: string; priceYear?: string; perYear?: string; saveLabel?: string; desc: string; features: string[]; cta: string; featured: boolean }>;
    };
  };
  faq: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    items: { en: [string, string][]; fr: [string, string][] };
  };
  ctaStrip: {
    title: { en: string; fr: string };
    primary: { en: string; fr: string };
    secondary: { en: string; fr: string };
  };
  footer: {
    tagline: { en: string; fr: string };
    cols: {
      en: Array<{ h: string; links: string[] }>;
      fr: Array<{ h: string; links: string[] }>;
    };
    copy: { en: string; fr: string };
  };
}

export const LANDING_CONTENT: LandingContent = {
  nav: {
    links: {
      // « videos » entry was removed when LandingYT folded into the hero
      // (v2.6.4) — the hero now showcases the YouTube → AI summary
      // pipeline directly so a separate anchor was redundant.
      en: [["features", "How it works"], ["topics", "Topics"], ["pricing", "Pricing"], ["faq", "FAQ"]],
      fr: [["features", "Fonctionnement"], ["topics", "Topics"], ["pricing", "Tarifs"], ["faq", "FAQ"]],
    },
    signin: { en: "Sign in", fr: "Se connecter" },
    cta: { en: "Try it now", fr: "Essayer" },
  },
  hero: {
    kicker: { en: "Tech · AI · Crypto", fr: "Tech · IA · Crypto" },
    headline: {
      en: "Two hours of YouTube,<br /><em>read in 8 minutes.</em>",
      fr: "2 heures de YouTube,<br /><em>lues en 8 minutes.</em>",
    },
    sub: {
      // Folded the « YouTube intelligence » section copy into the hero
      // so the visitor gets the full pitch in the first viewport
      // (LandingYT was removed in v2.6.4 — its standalone visual
      // becomes the hero illustration).
      en: "A 2-hour podcast, summarized in 8 key points. Pick the YouTube channels you follow. 8news ingests daily uploads, transcribes the ones you click, and returns a structured Markdown summary. Smart bilingual: summary in English and translated to French in under 10 seconds. Download the full transcript as a .txt file or the summary as .md in one click.",
      fr: "Un podcast de 2 heures, résumé en 8 points clés. Choisissez les chaînes YouTube que vous suivez. 8news récupère les uploads du jour, transcrit celles que vous cliquez, et renvoie un résumé Markdown structuré. Bilingue intelligent, résumé en anglais et traduit en français en moins de 10 secondes. Téléchargez la transcription complète au format .txt ou le résumé au format .md en un clic.",
    },
    ctaPrimary: { en: "Try it now →", fr: "Essayer →" },
    ctaSecondary: { en: "See a daily summary", fr: "Voir un résumé du jour" },
    hint: { en: "No sign-up required", fr: "Sans inscription" },
  },
  console: {
    title: { en: "live · scoring console", fr: "live · console de scoring" },
    footer: {
      en: "Fetched <b>4,284</b> · <b>avg delay 1m25s</b>",
      fr: "Collectés <b>4 284</b> · <b>délai moyen 1m25s</b>",
    },
    rows: [
      { s: 10, t_en: "OpenAI announces GPT-5.3 with native agentic memory and 2M-token context", t_fr: "OpenAI annonce GPT-5.3 avec mémoire agentique native et contexte de 2M tokens", src: "bloomberg.com", topic: "AI" },
      { s: 9,  t_en: "Anthropic raises $15B at $250B valuation led by Google and a16z", t_fr: "Anthropic lève 15 Md$ à 250 Md$ de valorisation, menée par Google et a16z", src: "theinformation.com", topic: "ANTHROPIC" },
      { s: 8,  t_en: "Unitree H2 humanoid demonstrates autonomous kitchen work in new demo", t_fr: "Le humanoïde Unitree H2 démontre un travail autonome en cuisine dans une nouvelle démo", src: "techcrunch.com", topic: "ROBOTICS" },
      { s: 7,  t_en: "Bitcoin spot ETFs record $1.4B net inflow following halving cycle", t_fr: "Les ETF Bitcoin spot enregistrent 1,4 Md$ d'entrées nettes après le cycle de halving", src: "reuters.com", topic: "BITCOIN" },
      { s: 5,  t_en: "Tesla delays Optimus Gen-3 reveal to Q3 2026 earnings call", t_fr: "Tesla repousse la présentation d'Optimus Gen-3 à l'appel résultats du T3 2026", src: "reuters.com", topic: "ELON" },
      { s: 3,  t_en: "Op-ed: why AI companies keep naming products after colors", t_fr: "Tribune : pourquoi les boîtes IA nomment leurs produits avec des couleurs", src: "medium.com", topic: "AI" },
    ],
  },
  scoringSection: {
    kicker: { en: "Live · scoring console", fr: "Live · console de scoring" },
    title: {
      en: "Every RSS article scored <em>1 to 10</em> the second it lands.",
      fr: "Chaque article RSS noté <em>1 à 10</em> à la seconde où il tombe.",
    },
    sub: {
      en: "400+ feeds, refreshed every minute. Below is the live ladder of what the AI just scored — same scoring you see inside the app.",
      fr: "400+ flux, rafraîchis chaque minute. Ci-dessous l'échelle live de ce que l'IA vient de scorer — exactement le même score que dans l'app.",
    },
  },
  ticker: {
    items_en: [
      "AI", "CRYPTO", "ROBOTICS", "BITCOIN",
      "ANTHROPIC", "ELON", "AI ENG.", "VIDEO GAMES",
      "IRAN WAR", "400+ RSS FEEDS", "24 YOUTUBE CHANNELS", "EN / FR",
    ],
    items_fr: [
      "IA", "CRYPTO", "ROBOTIQUE", "BITCOIN",
      "ANTHROPIC", "ELON", "AI ENG.", "JEUX VIDÉO",
      "GUERRE IRAN", "400+ FLUX RSS", "24 CHAÎNES YOUTUBE", "EN / FR",
    ],
  },
  stats: {
    en: [
      { n: "400", unit: "+", l: "Curated RSS feeds" },
      { n: "100", unit: "K+", l: "Articles fetched" },
      { n: "90", unit: "%", l: "Time saved" },
      { n: "36", unit: "topics", l: "Plus your own custom ones" },
    ],
    fr: [
      { n: "400", unit: "+", l: "Flux RSS curés" },
      { n: "100", unit: "K+", l: "Articles collectés" },
      { n: "90", unit: "%", l: "Temps gagné" },
      { n: "36", unit: "topics", l: "Plus les vôtres, sur mesure" },
    ],
  },
  how: {
    kicker: { en: "How it works", fr: "Fonctionnement" },
    title: {
      en: "Three steps between a <em>firehose of news</em> and your morning brief.",
      fr: "Trois étapes entre le <em>torrent d'actualités</em> et votre brief du matin.",
    },
    steps: {
      en: [
        { num: "01", title: "Fetch", body: "Every minute, scheduled Netlify functions poll 400+ RSS feeds across 36 topics. Duplicates are dropped. 4,284 articles land in Supabase on an average day.", viz: "fetch" },
        { num: "02", title: "Score", body: "GPT-4.1-nano rates each article 1–10 against the topic's custom scoring tiers. Only 5+ gets summarized. Fresh articles are prioritized with an adaptive budget.", viz: "score" },
        { num: "03", title: "Summarize", body: "GPT-5.3-chat-latest reads the top 20–50 pre-scored articles and returns eight bullet points with source refs. ElevenLabs reads it aloud if you want.", viz: "summary" },
      ],
      fr: [
        { num: "01", title: "Collecte", body: "Chaque minute, des fonctions Netlify interrogent 400+ flux RSS sur 36 topics. Les doublons sont écartés. 4 284 articles atterrissent dans Supabase un jour moyen.", viz: "fetch" },
        { num: "02", title: "Scoring", body: "GPT-4.1-nano note chaque article de 1 à 10 selon les paliers de scoring du topic. Seuls les 5+ sont résumés. Les articles frais sont priorisés.", viz: "score" },
        { num: "03", title: "Résumé", body: "GPT-5.3-chat-latest lit les 20–50 meilleurs articles pré-scorés et renvoie huit puces avec sources. ElevenLabs peut vous le lire à voix haute.", viz: "summary" },
      ],
    },
  },
  topics: {
    kicker: { en: "Topics", fr: "Topics" },
    title: {
      en: "36 topics by default. <em>Infinite custom topics</em> in one click.",
      fr: "36 topics par défaut. <em>Topics personnalisés à l'infini</em> en un clic.",
    },
    sub: {
      en: "Describe a topic in plain English, and 8news auto-discovers RSS feeds and writes the scoring prompt. Takes about 20 seconds.",
      fr: "Décrivez un topic en français simple, et 8news trouve les flux RSS et écrit le prompt de scoring. Environ 20 secondes.",
    },
    list: [
      { label_en: "AI", label_fr: "IA", feeds: 24 },
      { label_en: "AI Eng.", label_fr: "AI Eng.", feeds: 18 },
      { label_en: "Anthropic", label_fr: "Anthropic", feeds: 20 },
      { label_en: "Robotics", label_fr: "Robotique", feeds: 15 },
      { label_en: "Crypto", label_fr: "Crypto", feeds: 22 },
      { label_en: "Bitcoin", label_fr: "Bitcoin", feeds: 19 },
      { label_en: "Elon Musk", label_fr: "Elon Musk", feeds: 16 },
      { label_en: "Video Games", label_fr: "Jeux Vidéo", feeds: 14 },
    ],
  },
  pricing: {
    kicker: { en: "Pricing", fr: "Tarifs" },
    title: {
      en: "Free today. <em>Pro is coming.</em>",
      fr: "Gratuit aujourd'hui. <em>Pro arrive bientôt.</em>",
    },
    plans: {
      en: [
        { tag: "CURRENT", name: "Free", price: "$0", per: "/forever", desc: "Everything we shipped in v2.6.7. No credit card, no waitlist.", features: ["Choose 8 topics out of the 36 available.", "Top daily articles and videos with AI summary + sources.", "YouTube transcription and video summaries.", "Morning email digest covering your topics.", "Bilingual EN / FR"], cta: "Try it now", featured: false },
        { tag: "COMING SOON", name: "Pro", price: "$8", per: "/month", priceYear: "$88", perYear: "/year", saveLabel: "−8% per year", desc: "For founders, analysts and builders who need custom topics and higher limits.", features: ["Unlimited custom topics with AI feed discovery", "Unlimited YouTube transcriptions, add your favorite YouTube channels", "Email alert when an article or a videoscores 9 or 10 in one of your selected topics"], cta: "Join the waitlist", featured: true },
      ],
      fr: [
        { tag: "ACTUEL", name: "Gratuit", price: "0 €", per: "/à vie", desc: "Tout ce qu'on a livré en v2.6.7. Sans carte bancaire, sans liste d'attente.", features: ["Choisissez 8 topics parmi les 36 disponibles.", "Top des articles et videos quotidiens avec résumé IA + sources.", "Transcription YouTube et résumé des vidéos.", "Newsletter matinale reprenant vos topics.", "Bilingue EN / FR"], cta: "Essayer", featured: false },
        { tag: "BIENTÔT", name: "Pro", price: "8 €", per: "/mois", priceYear: "88 €", perYear: "/an", saveLabel: "−8 % à l'année", desc: "Pour fondateurs, analystes et builders qui veulent des topics sur mesure et plus de volume.", features: ["Topics personnalisés illimités avec découverte IA des flux", "Transcriptions YouTube illimitées, ajout de vos chaînes YouTube favorites", "Alerte email quand un article ou une vidéo a un score >=9 pour un de vos topics."], cta: "Rejoindre la liste", featured: true },
      ],
    },
  },
  faq: {
    kicker: { en: "FAQ", fr: "FAQ" },
    title: { en: "Questions, answered.", fr: "Questions, réponses." },
    items: {
      en: [
        ["How is this different from Feedly or Google News?", "Feedly shows you everything. Google News ranks by popularity. 8news filters with AI: every article is scored 1–10 against a prompt you can edit, and only the top 20–50 reach the summary. You read eight bullets, not 400 headlines."],
        ["Which AI models are you using?", "GPT-4.1-mini for per-article scoring, daily SEO summaries, YouTube transcription summaries, feed discovery, and topic generation. GPT-5.3-chat-latest for the homepage Top 50 grouped summary, video roundups, and background cron transcription."],
        ["Can I add my own topic?", "Yes. Describe it in one sentence, 8news generates the scoring criteria and auto-discovers 10 RSS feeds via AI. You can edit any prompt. Owners get full CRUD; members can personalize which topics they see."],
        ["French or English?", "Both, toggle in the header. Article summaries and daily SEO pages are generated in both languages. YouTube summaries can be transcribed either in English or in French, regardless of the original video language."],
      ],
      fr: [
        ["En quoi c'est différent de Feedly ou Google News ?", "Feedly vous montre tout. Google News classe par popularité. 8news filtre avec l'IA : chaque article est scoré 1–10 sur un prompt que vous pouvez éditer, et seul le top 20–50 atteint le résumé. Vous lisez huit puces, pas 400 titres."],
        ["Quels modèles IA utilisez-vous ?", "GPT-4.1-nano pour le scoring par article (rapide, ~0,10 € par 1K articles), GPT-4.1-mini pour les résumés SEO quotidiens et les résumés YouTube, et GPT-5.3-chat-latest pour le Top 50 groupé de la homepage."],
        ["Puis-je ajouter mon propre topic ?", "Oui. Décrivez-le en une phrase, 8news génère les critères de scoring et découvre 10 flux RSS via IA. Vous pouvez éditer tous les prompts. Les owners ont le CRUD complet ; les membres personnalisent quels topics ils voient."],
        ["Français ou anglais ?", "Les deux, toggle dans l'en-tête. Les résumés d'articles et les pages SEO quotidiennes sont générés dans les deux langues. Les résumés YouTube ont la possibilité d'être transcrits, soit en anglais, soit en français, peu importe la langue d'origine de la vidéo."],
      ],
    },
  },
  ctaStrip: {
    title: {
      en: "The signal. <em>Not the noise.</em>",
      fr: "Le signal. <em>Pas le bruit.</em>",
    },
    primary: { en: "Try it now →", fr: "Essayer →" },
    secondary: { en: "See today's daily summaries", fr: "Voir les résumés du jour" },
  },
  footer: {
    tagline: {
      en: "8news is an independent tech intelligence project, built solo on Next.js, Supabase, OpenAI, ElevenLabs, and Netlify. Live at 8news.ai.",
      fr: "8news est un projet indépendant de veille tech, construit en solo sur Next.js, Supabase, OpenAI, ElevenLabs et Netlify. En ligne sur 8news.ai.",
    },
    cols: {
      en: [
        { h: "Product", links: ["Top 50", "Daily Summaries", "YouTube Videos", "Favorites", "Custom topics"] },
        { h: "Company", links: ["About", "Changelog", "GitHub", "Contact"] },
        { h: "Legal", links: ["Terms", "Privacy", "Cookies"] },
      ],
      fr: [
        { h: "Produit", links: ["Top 50", "Résumés quotidiens", "Vidéos YouTube", "Favoris", "Topics sur mesure"] },
        { h: "Société", links: ["À propos", "Changelog", "GitHub", "Contact"] },
        { h: "Légal", links: ["CGU", "Confidentialité", "Cookies"] },
      ],
    },
    copy: { en: "© 2026 8news.ai — Tech decoded by AI", fr: "© 2026 8news.ai — La tech décodée par l'IA" },
  },
};
