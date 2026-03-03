export type Lang = "en" | "fr";

const strings = {
  appName: {
    en: "8news.ai",
    fr: "8news.ai",
  },
  conflictTitle: {
    en: "USA / Israel vs Iran Conflict",
    fr: "Conflit USA / Israël vs Iran",
  },
  subtitle: {
    en: "AI-powered summary of the latest news from 10 RSS feeds.",
    fr: "Résumé des dernières actualités issues de 10 flux RSS, filtrées par IA.",
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
  noArticles: {
    en: "No articles related to the USA/Israel vs Iran conflict found for this time period.",
    fr: "Aucun article lié au conflit USA/Israël vs Iran sur cette période.",
  },
  initialMessage: {
    en: "Click a time period button above to fetch the latest news and display the AI summary.",
    fr: "Cliquez sur un bouton de période pour charger les actualités et afficher le résumé IA.",
  },
  reset: {
    en: "Reset",
    fr: "Réinitialiser",
  },
} as const;

type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

export function dateLocale(lang: Lang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}
