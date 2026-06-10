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
      en: Array<{ tag: string; name: string; price: string; per: string; compareAtPrice?: string; priceYear?: string; perYear?: string; saveLabel?: string; desc: string; features: string[]; cta: string; featured: boolean }>;
      fr: Array<{ tag: string; name: string; price: string; per: string; compareAtPrice?: string; priceYear?: string; perYear?: string; saveLabel?: string; desc: string; features: string[]; cta: string; featured: boolean }>;
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
      en: "Stop scrolling.<br /><em>Read the top 10%.</em>",
      fr: "Arrête de scroller.<br /><em>Lis les 10% qui comptent.</em>",
    },
    sub: {
      // Folded the « YouTube intelligence » section copy into the hero
      // so the visitor gets the full pitch in the first viewport
      // (LandingYT was removed in v2.6.4 — its standalone visual
      // becomes the hero illustration).
      en: "AI scores every YouTube video and every RSS article from 1 to 10. You only read what scores 9 or 10.",
      fr: "L'IA note chaque vidéo YouTube et chaque article RSS de 1 à 10. Tu ne lis que ce qui est noté 9 ou 10.",
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
      en: "Every article and video scored by AI <em>1 to 10</em>.",
      fr: "Chaque article et chaque vidéo notés par l'IA <em>1 à 10</em>.",
    },
    sub: {
      en: "400+ RSS feeds and your YouTube channels feed the same AI scoring layer. Below is the live ladder of what the AI just scored — the same signal you see inside the app for articles and video recaps.",
      fr: "400+ flux RSS et vos chaînes YouTube alimentent la même couche de scoring IA. Ci-dessous l'échelle live de ce que l'IA vient de noter — le même signal que dans l'app pour les articles et les récaps vidéo.",
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
        { num: "01", title: "Fetch", body: "Every 15 minutes, Netlify background functions poll 400+ RSS feeds across 36 topics. Duplicates are dropped. 4,284 articles land in Supabase on an average day.", viz: "fetch" },
        { num: "02", title: "Score", body: "GPT-4.1-nano rates each article 1–10 against the topic's custom scoring tiers. Only 5+ gets summarized. Fresh articles are prioritized with an adaptive budget.", viz: "score" },
        { num: "03", title: "Summarize", body: "The latest OpenAI models read the top 20–50 pre-scored articles and return eight bullet points with source refs. ElevenLabs reads it aloud if you want.", viz: "summary" },
      ],
      fr: [
        { num: "01", title: "Collecte", body: "Toutes les 15 minutes, des fonctions Netlify background interrogent 400+ flux RSS sur 36 topics. Les doublons sont écartés. 4 284 articles atterrissent dans Supabase un jour moyen.", viz: "fetch" },
        { num: "02", title: "Scoring", body: "GPT-4.1-nano note chaque article de 1 à 10 selon les paliers de scoring du topic. Seuls les 5+ sont résumés. Les articles frais sont priorisés.", viz: "score" },
        { num: "03", title: "Résumé", body: "Les derniers modèles OpenAI lisent les 20–50 meilleurs articles pré-scorés et renvoient huit puces avec sources. ElevenLabs peut vous le lire à voix haute.", viz: "summary" },
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
      en: "Start free. <em>Reserve Pro Early Adopter.</em>",
      fr: "Commencez gratuitement. <em>Réservez Pro Early Adopter.</em>",
    },
    plans: {
      en: [
        { tag: "FREE PREVIEW", name: "Free", price: "$0", per: "", desc: "Use the core product while 8news is still in beta. No card required.", features: ["Top 24h articles and videos with AI summary + sources.", "Default tech, AI and crypto topics.", "Archives, favorites and bilingual EN / FR reading.", "Morning email brief for the topics you care about.", "Enough to see if 8news becomes part of your daily routine."], cta: "Start free", featured: false },
        { tag: "EARLY ADOPTER PRICE", name: "Pro Early Adopter", price: "€28", per: "/year", compareAtPrice: "€88", saveLabel: "annual billing, one payment", desc: "For analysts, operators and builders who want 8news tuned to their exact watchlist.", features: ["50+ YouTube channels included by default with AI summaries and transcripts in English and French — add up to 5 personal channels of your choice.", "Add your own topics with AI feed discovery.", "AI chat grounded in your live news feed — ask anything about today's briefing, notes and source links.", "Reserve now — pay when checkout opens."], cta: "Reserve Pro", featured: true },
      ],
      fr: [
        { tag: "APERÇU GRATUIT", name: "Gratuit", price: "0 €", per: "", desc: "Utilisez le cœur du produit pendant que 8news est encore en bêta. Sans carte bancaire.", features: ["Top articles et vidéos 24h avec résumé IA + sources.", "Topics tech, IA et crypto par défaut.", "Archives, favoris et lecture bilingue EN / FR.", "Brief matinal sur les topics qui comptent pour vous.", "Assez pour savoir si 8news devient un réflexe quotidien."], cta: "Commencer", featured: false },
        { tag: "PRIX EARLY ADOPTER", name: "Pro Early Adopter", price: "28 €", per: "/an", compareAtPrice: "88 €", saveLabel: "paiement annuel en une fois", desc: "Pour analystes, opérateurs et builders qui veulent une veille réglée sur leur watchlist exacte.", features: ["50+ chaînes YouTube incluses par défaut avec résumés IA et transcriptions en anglais et en français — ajoutez jusqu'à 5 chaînes personnelles au choix.", "Ajoutez vos propres topics avec découverte IA de flux.", "Chat IA ancré dans votre flux d'actualité — posez vos questions sur le briefing du jour, ses notes et ses sources.", "Réservez maintenant — payez à l'ouverture du paiement."], cta: "Réserver Pro", featured: true },
      ],
    },
  },
  faq: {
    kicker: { en: "FAQ", fr: "FAQ" },
    title: { en: "Questions, answered.", fr: "Questions, réponses." },
    items: {
      en: [
        ["Why is 8news better than scrolling feeds?", "Because it removes the work. 8news watches YouTube channels and 400+ curated RSS feeds, scores every video and article from 1 to 10, then surfaces only the signal: the 9s and 10s, the Top 24h brief, and source-backed summaries you can read in minutes."],
        ["What do I get every day?", "A morning briefing built from the best videos and articles in tech, AI and crypto: transcribed YouTube recaps, the live Top articles 24h, favorites, archives, bilingual reading, and a free email brief if you enable the newsletter."],
        ["Which AI models power it?", "We route each job to the model that fits it: GPT-4.1-nano for fast article scoring and lightweight topic analysis, GPT-4.1-mini for daily summaries, video transcript summaries and video-score calibration, GPT-5.5 for the editorial Top 24h article briefing, and GPT-5.3-chat-latest for multi-video roundups. The model mix evolves as better OpenAI models ship."],
        ["Can I personalize 8news to my watchlist?", "Yes. Pick the topics you care about, follow the YouTube channels that matter, save favorites, and add custom topics with AI feed discovery. The goal is simple: your own AI analyst for the news you would otherwise spend hours tracking manually."],
      ],
      fr: [
        ["Pourquoi 8news est mieux que scroller des feeds ?", "Parce qu'il retire le travail pénible. 8news surveille vos chaînes YouTube et 400+ flux RSS curés, note chaque vidéo et chaque article de 1 à 10, puis ne remonte que le signal : les 9 et 10, le brief Top 24h et des résumés sourcés lisibles en quelques minutes."],
        ["Qu'est-ce que je reçois chaque jour ?", "Un brief matinal construit à partir des meilleures vidéos et des meilleurs articles tech, IA et crypto : récaps YouTube transcrites, Top articles 24h en live, favoris, archives, lecture bilingue et newsletter gratuite si vous activez le brief email."],
        ["Quels modèles IA utilisez-vous ?", "On route chaque tâche vers le modèle adapté : GPT-4.1-nano pour le scoring rapide des articles et l'analyse légère des topics, GPT-4.1-mini pour les résumés quotidiens, les résumés de transcripts vidéo et la calibration des scores vidéo, GPT-5.5 pour le briefing éditorial Top articles 24h, et GPT-5.3-chat-latest pour les roundups multi-vidéos. Le mix évolue dès que de meilleurs modèles OpenAI sortent."],
        ["Puis-je personnaliser 8news selon ma watchlist ?", "Oui. Choisissez vos topics, suivez les chaînes YouTube importantes, sauvegardez vos favoris et ajoutez des topics sur mesure avec découverte IA des flux. L'objectif : votre analyste IA personnel pour l'actualité que vous passeriez sinon des heures à suivre à la main."],
      ],
    },
  },
  ctaStrip: {
    title: {
      en: "The signal. <em>Not the noise.</em>",
      fr: "Le signal. <em>Pas le bruit.</em>",
    },
    primary: { en: "Try it now →", fr: "Essayer →" },
    secondary: { en: "Browse the archives", fr: "Parcourir les archives" },
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
        { h: "Legal", links: ["Legal notice"] },
      ],
      fr: [
        { h: "Produit", links: ["Top 50", "Résumés quotidiens", "Vidéos YouTube", "Favoris", "Topics sur mesure"] },
        { h: "Société", links: ["À propos", "Changelog", "GitHub", "Contact"] },
        { h: "Légal", links: ["Mentions légales"] },
      ],
    },
    copy: { en: "© 2026 8news.ai — Tech decoded by AI", fr: "© 2026 8news.ai — La tech décodée par l'IA" },
  },
};
