export type Lang = "en" | "fr";

const strings = {
  appName: {
    en: "8news",
    fr: "8news",
  },
  topicConflict: {
    en: "USA / Israel vs Iran",
    fr: "USA / Israël vs Iran",
  },
  topicAi: {
    en: "AI",
    fr: "IA",
  },
  topicCrypto: {
    en: "Crypto",
    fr: "Crypto",
  },
  topicRobotics: {
    en: "Robotics",
    fr: "Robotique",
  },
  conflictTitle: {
    en: "USA / Israel vs Iran Conflict",
    fr: "Conflit USA / Israël vs Iran",
  },
  aiTitle: {
    en: "AI & Machine Learning News",
    fr: "Nouveautés Intelligence Artificielle",
  },
  cryptoTitle: {
    en: "Crypto & Blockchain News",
    fr: "Actualités Crypto & Blockchain",
  },
  roboticsTitle: {
    en: "Robotics & AI Humanoids News",
    fr: "Actualités Robotique & Humanoïdes IA",
  },
  subtitle: {
    en: "AI that decodes the news",
    fr: "L'IA qui décrypte l'actualité",
  },
  selectPeriod: {
    en: "Select a time period:",
    fr: "Sélectionnez une période :",
  },
  loading: {
    en: "Fetching RSS feeds and running AI analysis…",
    fr: "Chargement des flux RSS et analyse par IA…",
  },
  connectionError: {
    en: "Unable to connect to the server.",
    fr: "Connexion impossible au serveur.",
  },
  unknownError: {
    en: "Unknown error",
    fr: "Erreur inconnue",
  },
  summary: {
    en: "Summary",
    fr: "Résumé",
  },
  relevantArticles: {
    en: "Relevant articles",
    fr: "Articles retenus",
  },
  allArticles: {
    en: "All articles",
    fr: "Tous les articles",
  },
  noArticlesConflict: {
    en: "No articles related to the USA/Israel vs Iran conflict found for this time period.",
    fr: "Aucun article lié au conflit USA/Israël vs Iran sur cette période.",
  },
  noArticlesAi: {
    en: "No AI-related articles found for this time period.",
    fr: "Aucun article lié à l'IA sur cette période.",
  },
  noArticlesCrypto: {
    en: "No crypto-related articles found for this time period.",
    fr: "Aucun article lié à la crypto sur cette période.",
  },
  noArticlesRobotics: {
    en: "No robotics-related articles found for this time period.",
    fr: "Aucun article lié à la robotique sur cette période.",
  },
  initialMessage: {
    en: "Select a topic and click a time period button to analyse the latest news.",
    fr: "Sélectionnez un sujet et cliquez sur une période pour analyser les actualités.",
  },
  reset: {
    en: "Reset",
    fr: "Réinitialiser",
  },
  settings: {
    en: "Settings",
    fr: "Paramètres",
  },
  settingsTitle: {
    en: "Settings",
    fr: "Paramètres",
  },
  preferencesSection: {
    en: "Preferences",
    fr: "Préférences",
  },
  rssSourcesSection: {
    en: "RSS Sources",
    fr: "Sources RSS",
  },
  settingsClose: {
    en: "Close",
    fr: "Fermer",
  },
  maxArticles: {
    en: "Max relevant articles:",
    fr: "Nb articles max retenus:",
  },
} as const;

type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

export function dateLocale(lang: Lang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}
