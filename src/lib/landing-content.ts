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
  yt: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    sub: { en: string; fr: string };
    cards: Array<{
      title_en: string;
      title_fr: string;
      channel: string;
      dur: string;
      bullets_en: string[];
      bullets_fr: string[];
    }>;
  };
  pricing: {
    kicker: { en: string; fr: string };
    title: { en: string; fr: string };
    plans: {
      en: Array<{ tag: string; name: string; price: string; per: string; desc: string; features: string[]; cta: string; featured: boolean }>;
      fr: Array<{ tag: string; name: string; price: string; per: string; desc: string; features: string[]; cta: string; featured: boolean }>;
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
      en: [["features", "How it works"], ["topics", "Topics"], ["videos", "Video AI"], ["pricing", "Pricing"], ["faq", "FAQ"]],
      fr: [["features", "Fonctionnement"], ["topics", "Sujets"], ["videos", "Vidéo IA"], ["pricing", "Tarifs"], ["faq", "FAQ"]],
    },
    signin: { en: "Sign in", fr: "Se connecter" },
    cta: { en: "Try it now", fr: "Essayer" },
  },
  hero: {
    kicker: { en: "v1.108 · LIVE ON 8NEWS.AI", fr: "v1.108 · EN LIGNE SUR 8NEWS.AI" },
    headline: {
      en: "Two hours of YouTube, <em>read in eight minutes.</em>",
      fr: "Deux heures de YouTube, <em>lues en huit minutes.</em>",
    },
    sub: {
      en: "8news aggregates 160+ RSS feeds and the YouTube channels you actually care about, scores every article from 1 to 10 with GPT-4.1, and returns a bullet-point brief with sources. No feed. No rabbit hole. Just the signal.",
      fr: "8news agrège 160+ flux RSS et les chaînes YouTube qui comptent, score chaque article de 1 à 10 avec GPT-4.1, et vous renvoie une note synthétique avec sources. Pas de feed. Pas de trou noir. Juste le signal.",
    },
    ctaPrimary: { en: "Try it now →", fr: "Essayer →" },
    ctaSecondary: { en: "See a daily summary", fr: "Voir un résumé du jour" },
    hint: { en: "No sign-up required", fr: "Sans inscription" },
  },
  console: {
    title: { en: "live · scoring console", fr: "live · console de scoring" },
    footer: {
      en: "Fetched <b>4,284</b> articles · scored <b>3,918</b> · <b>avg delay 3m25s</b>",
      fr: "Collectés <b>4 284</b> articles · scorés <b>3 918</b> · <b>délai moyen 3m25s</b>",
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
  ticker: {
    items_en: [
      "AI · 412 articles today", "CRYPTO · 186", "ROBOTICS · 94", "BITCOIN · 203",
      "ANTHROPIC · 58", "ELON · 147", "AI ENG. · 121", "VIDEO GAMES · 76",
      "IRAN WAR · 68", "160+ RSS FEEDS", "24 YOUTUBE CHANNELS", "EN / FR",
    ],
    items_fr: [
      "IA · 412 articles aujourd'hui", "CRYPTO · 186", "ROBOTIQUE · 94", "BITCOIN · 203",
      "ANTHROPIC · 58", "ELON · 147", "AI ENG. · 121", "JEUX VIDÉO · 76",
      "GUERRE IRAN · 68", "160+ FLUX RSS", "24 CHAÎNES YOUTUBE", "EN / FR",
    ],
  },
  stats: {
    en: [
      { n: "160", unit: "+", l: "Curated RSS feeds" },
      { n: "4.2", unit: "K/d", l: "Articles fetched" },
      { n: "3m25s", l: "Avg. fetch → score delay" },
      { n: "9", unit: "topics", l: "Plus your own custom ones" },
    ],
    fr: [
      { n: "160", unit: "+", l: "Flux RSS curés" },
      { n: "4,2", unit: "K/j", l: "Articles collectés" },
      { n: "3m25s", l: "Délai fetch → score" },
      { n: "9", unit: "sujets", l: "Plus les vôtres, sur mesure" },
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
        { num: "01", title: "Fetch", body: "Every minute, scheduled Netlify functions poll 160+ RSS feeds across nine topics. Duplicates are dropped. 4,284 articles land in Supabase on an average day.", viz: "fetch" },
        { num: "02", title: "Score", body: "GPT-4.1-nano rates each article 1–10 against the topic's custom scoring tiers. Only 5+ gets summarized. Fresh articles are prioritized with an adaptive budget.", viz: "score" },
        { num: "03", title: "Summarize", body: "GPT-5.3-chat-latest reads the top 20–50 pre-scored articles and returns eight bullet points with source refs. ElevenLabs reads it aloud if you want.", viz: "summary" },
      ],
      fr: [
        { num: "01", title: "Collecte", body: "Chaque minute, des fonctions Netlify interrogent 160+ flux RSS sur neuf sujets. Les doublons sont écartés. 4 284 articles atterrissent dans Supabase un jour moyen.", viz: "fetch" },
        { num: "02", title: "Scoring", body: "GPT-4.1-nano note chaque article de 1 à 10 selon les paliers de scoring du sujet. Seuls les 5+ sont résumés. Les articles frais sont priorisés.", viz: "score" },
        { num: "03", title: "Résumé", body: "GPT-5.3-chat-latest lit les 20–50 meilleurs articles pré-scorés et renvoie huit puces avec sources. ElevenLabs peut vous le lire à voix haute.", viz: "summary" },
      ],
    },
  },
  topics: {
    kicker: { en: "Topics", fr: "Sujets" },
    title: {
      en: "Nine topics by default. <em>Infinite custom topics</em> in one click.",
      fr: "Neuf sujets par défaut. <em>Sujets personnalisés à l'infini</em> en un clic.",
    },
    sub: {
      en: "Describe a topic in plain English, and 8news auto-discovers RSS feeds and writes the scoring prompt. Takes about 20 seconds.",
      fr: "Décrivez un sujet en français simple, et 8news trouve les flux RSS et écrit le prompt de scoring. Environ 20 secondes.",
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
  yt: {
    kicker: { en: "YouTube intelligence", fr: "Intelligence YouTube" },
    title: {
      en: "A two-hour podcast, <em>summarized in eight bullets.</em>",
      fr: "Un podcast de deux heures, <em>résumé en huit puces.</em>",
    },
    sub: {
      en: "Pick the YouTube channels you follow. 8news ingests daily uploads, transcribes the ones you click, and returns a structured Markdown summary. Cross-language: if an English summary exists, we translate it for 1/5th the cost.",
      fr: "Choisissez les chaînes YouTube que vous suivez. 8news récupère les uploads du jour, transcrit celles que vous cliquez, et renvoie un résumé Markdown structuré. Bilingue intelligent : un résumé en anglais est traduit au 1/5ème du coût.",
    },
    cards: [
      {
        title_en: "Dwarkesh Patel × Demis Hassabis — on scaling, AlphaFold 3, and AGI timelines",
        title_fr: "Dwarkesh Patel × Demis Hassabis — scaling, AlphaFold 3, et calendrier AGI",
        channel: "DWARKESH PODCAST",
        dur: "2:14:07",
        bullets_en: [
          "Hassabis thinks AGI is 5–10 years out and disagrees with Anthropic's 2-year timeline.",
          "AlphaFold 3 drug discovery pipeline is already in clinical use at Isomorphic Labs.",
          "Google is training a model with 100T parameters — inference cost is the blocker, not training.",
          "Video generation will hit feature-film quality by 2027 per internal benchmarks.",
        ],
        bullets_fr: [
          "Hassabis estime l'AGI à 5–10 ans, en désaccord avec le calendrier de 2 ans d'Anthropic.",
          "Le pipeline de découverte de médicaments AlphaFold 3 est déjà en usage clinique chez Isomorphic Labs.",
          "Google entraîne un modèle à 100 000 Md de paramètres — l'inférence est le blocage, pas l'entraînement.",
          "La génération vidéo atteindra la qualité long-métrage d'ici 2027 selon les benchmarks internes.",
        ],
      },
      {
        title_en: "Lex Fridman × Andrej Karpathy — software 2.0, reinforcement learning, the end of coding",
        title_fr: "Lex Fridman × Andrej Karpathy — software 2.0, apprentissage par renforcement, fin du code",
        channel: "LEX FRIDMAN PODCAST",
        dur: "3:08:22",
        bullets_en: [
          "Karpathy expects 90% of new code written in 2027 to be LLM-authored, supervised by humans.",
          "RL from AI feedback scales further than RLHF — the key unlock for reasoning models.",
          "His new startup Eureka Labs is building an AI-first CS 101 curriculum.",
          "He is bearish on custom silicon: NVIDIA's moat is CUDA, not the chips.",
        ],
        bullets_fr: [
          "Karpathy s'attend à ce que 90% du nouveau code en 2027 soit écrit par LLM, supervisé par humains.",
          "Le RL à partir de feedback IA passe mieux à l'échelle que le RLHF — clé pour les modèles raisonnement.",
          "Sa nouvelle startup Eureka Labs construit un cursus CS 101 IA-first.",
          "Il est pessimiste sur le silicium custom : le moat de NVIDIA est CUDA, pas les puces.",
        ],
      },
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
        { tag: "CURRENT", name: "Free", price: "$0", per: "/forever", desc: "Everything we shipped in v1.108. No credit card, no waitlist.", features: ["All 9 default topics with 160+ RSS feeds", "Top 50 daily with AI summary + sources", "YouTube transcription (5 per day)", "ElevenLabs text-to-speech (12 voices)", "Favorites, daily summaries archive", "Bilingual EN / FR"], cta: "Try it now", featured: false },
        { tag: "COMING SOON", name: "Pro", price: "$9", per: "/month", desc: "For founders, analysts and builders who need custom topics and higher limits.", features: ["Unlimited custom topics with AI feed discovery", "Unlimited YouTube transcriptions", "Webhooks & API access (Top 50 / daily summaries)", "Morning email digest, your topics only", "Priority scoring queue", "Private team workspace (up to 10 seats)"], cta: "Join the waitlist", featured: true },
      ],
      fr: [
        { tag: "ACTUEL", name: "Gratuit", price: "0 €", per: "/à vie", desc: "Tout ce qu'on a livré en v1.108. Sans carte bancaire, sans liste d'attente.", features: ["Les 9 sujets par défaut avec 160+ flux RSS", "Top 50 quotidien avec résumé IA + sources", "Transcription YouTube (5 par jour)", "Text-to-speech ElevenLabs (12 voix)", "Favoris, archive des résumés quotidiens", "Bilingue EN / FR"], cta: "Essayer", featured: false },
        { tag: "BIENTÔT", name: "Pro", price: "9 €", per: "/mois", desc: "Pour fondateurs, analystes et builders qui veulent des sujets sur mesure et plus de volume.", features: ["Sujets personnalisés illimités avec découverte IA des flux", "Transcriptions YouTube illimitées", "Webhooks & accès API (Top 50 / résumés)", "Digest email matinal, uniquement vos sujets", "File de scoring prioritaire", "Workspace équipe privé (jusqu'à 10 sièges)"], cta: "Rejoindre la liste", featured: true },
      ],
    },
  },
  faq: {
    kicker: { en: "FAQ", fr: "FAQ" },
    title: { en: "Questions, answered.", fr: "Questions, réponses." },
    items: {
      en: [
        ["How is this different from Feedly or Google News?", "Feedly shows you everything. Google News ranks by popularity. 8news filters with AI: every article is scored 1–10 against a prompt you can edit, and only the top 20–50 reach the summary. You read eight bullets, not 400 headlines."],
        ["Which AI models are you using?", "GPT-4.1-nano for per-article scoring (cheap, fast, ~$0.10 per 1K articles), GPT-4.1-mini for daily SEO summaries and YouTube transcription summaries, and GPT-5.3-chat-latest for the homepage Top 50 grouped summary."],
        ["Can I add my own topic?", "Yes. Describe it in one sentence, 8news generates the scoring criteria and auto-discovers 10 RSS feeds via AI. You can edit any prompt. Owners get full CRUD; members can personalize which topics they see."],
        ["Do you store my reading history?", "Only what you explicitly favorite. No ad tracking. Supabase RLS is enabled on all public tables."],
        ["Is it open source?", "The codebase lives on GitHub. Run it locally with your own OpenAI key in under ten minutes."],
        ["French or English?", "Both, toggle in the header. Article summaries and daily SEO pages are generated in both languages. YouTube summaries are translated cross-language so we only transcribe once."],
      ],
      fr: [
        ["En quoi c'est différent de Feedly ou Google News ?", "Feedly vous montre tout. Google News classe par popularité. 8news filtre avec l'IA : chaque article est scoré 1–10 sur un prompt que vous pouvez éditer, et seul le top 20–50 atteint le résumé. Vous lisez huit puces, pas 400 titres."],
        ["Quels modèles IA utilisez-vous ?", "GPT-4.1-nano pour le scoring par article (rapide, ~0,10 € par 1K articles), GPT-4.1-mini pour les résumés SEO quotidiens et les résumés YouTube, et GPT-5.3-chat-latest pour le Top 50 groupé de la homepage."],
        ["Puis-je ajouter mon propre sujet ?", "Oui. Décrivez-le en une phrase, 8news génère les critères de scoring et découvre 10 flux RSS via IA. Vous pouvez éditer tous les prompts. Les owners ont le CRUD complet ; les membres personnalisent quels sujets ils voient."],
        ["Stockez-vous mon historique de lecture ?", "Uniquement ce que vous mettez explicitement en favori. Pas de tracking pub. Le RLS Supabase est activé sur toutes les tables publiques."],
        ["Est-ce open source ?", "Le code est sur GitHub. Vous pouvez le lancer en local avec votre propre clé OpenAI en moins de dix minutes."],
        ["Français ou anglais ?", "Les deux, toggle dans l'en-tête. Les résumés d'articles et les pages SEO quotidiennes sont générés dans les deux langues. Les résumés YouTube sont traduits pour ne transcrire qu'une fois."],
      ],
    },
  },
  ctaStrip: {
    title: {
      en: "Stop scrolling. <em>Start reading eight bullets.</em>",
      fr: "Arrêtez de scroller. <em>Commencez à lire huit puces.</em>",
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
        { h: "Produit", links: ["Top 50", "Résumés quotidiens", "Vidéos YouTube", "Favoris", "Sujets sur mesure"] },
        { h: "Société", links: ["À propos", "Changelog", "GitHub", "Contact"] },
        { h: "Légal", links: ["CGU", "Confidentialité", "Cookies"] },
      ],
    },
    copy: { en: "© 2026 8news.ai — Tech decoded by AI", fr: "© 2026 8news.ai — La tech décodée par l'IA" },
  },
};
