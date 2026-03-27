export type Lang = "en" | "fr";

const strings = {
  appName: {
    en: "8news",
    fr: "8news",
  },
  topicConflict: {
    en: "Iran War",
    fr: "Iran War",
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
  topicBitcoin: {
    en: "Bitcoin",
    fr: "Bitcoin",
  },
  topicVideogames: {
    en: "Video Games",
    fr: "Jeux Vidéo",
  },
  topicAiengineering: {
    en: "AI Eng.",
    fr: "AI Eng.",
  },
  topicElon: {
    en: "Elon Musk",
    fr: "Elon Musk",
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
  bitcoinTitle: {
    en: "Bitcoin News",
    fr: "Actualités Bitcoin",
  },
  videogamesTitle: {
    en: "Video Games News",
    fr: "Actualités Jeux Vidéo",
  },
  aiengineeringTitle: {
    en: "AI Engineering & Production Systems",
    fr: "Ingénierie IA & Systèmes de Production",
  },
  elonTitle: {
    en: "Elon Musk — Tesla, SpaceX, xAI, X & Neuralink",
    fr: "Elon Musk — Tesla, SpaceX, xAI, X & Neuralink",
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
    en: "Reading articles and running AI analysis…",
    fr: "Lecture des articles et analyse IA…",
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
  noArticlesBitcoin: {
    en: "No Bitcoin-related articles found for this time period.",
    fr: "Aucun article lié au Bitcoin sur cette période.",
  },
  noArticlesVideogames: {
    en: "No video game-related articles found for this time period.",
    fr: "Aucun article lié aux jeux vidéo sur cette période.",
  },
  noArticlesAiengineering: {
    en: "No AI engineering articles found for this time period.",
    fr: "Aucun article lié à l'ingénierie IA sur cette période.",
  },
  noArticlesElon: {
    en: "No Elon Musk-related articles found for this time period.",
    fr: "Aucun article lié à Elon Musk sur cette période.",
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
  aiPromptSection: {
    en: "AI Prompt",
    fr: "Prompt IA",
  },
  settingsClose: {
    en: "Close",
    fr: "Fermer",
  },
  maxArticles: {
    en: "Max relevant articles:",
    fr: "Nb articles max retenus:",
  },
  maxArticlesInfo: {
    en: "Articles pre-scored hourly by AI (relevance 1-10) are filtered by minimum score based on the selected time window. 2x the max number of articles are sent to GPT-4o-mini, which generates a summary and selects the most relevant ones to display. Results are cached for 5-60 min depending on the time range.",
    fr: "Les articles sont pré-scorés toutes les heures par l'IA (pertinence 1-10) puis filtrés par score minimum selon la fenêtre temporelle choisie. 2x le nombre max d'articles sont envoyés à GPT-4o-mini qui génère un résumé et sélectionne les plus pertinents à afficher. Les résultats sont mis en cache 5-60 min selon la plage horaire.",
  },
  statsTitle: {
    en: "Stats",
    fr: "Stats",
  },
  totalArticles: {
    en: "Total articles",
    fr: "Total articles",
  },
  scoredArticles: {
    en: "Scored",
    fr: "Scorés",
  },
  coverage: {
    en: "Coverage",
    fr: "Couverture",
  },
  avgScore: {
    en: "Avg score",
    fr: "Score moy.",
  },
  new24h: {
    en: "New 24h",
    fr: "Nouveaux 24h",
  },
  new7d: {
    en: "New 7d",
    fr: "Nouveaux 7j",
  },
  scored24h: {
    en: "Scored 24h",
    fr: "Scorés 24h",
  },
  scoreDistrib: {
    en: "Score distribution",
    fr: "Distribution des scores",
  },
  feedRanking: {
    en: "Feed ranking",
    fr: "Classement des flux",
  },
  topArticles: {
    en: "Top articles",
    fr: "Meilleurs articles",
  },
  topicComparison: {
    en: "Topic comparison",
    fr: "Comparaison des topics",
  },
  hitRate: {
    en: "Hit rate",
    fr: "Taux de pertinence",
  },
  allTopics: {
    en: "All",
    fr: "Tous",
  },
  allTime: {
    en: "All time",
    fr: "Tout",
  },
  yesterday: {
    en: "Yesterday",
    fr: "Hier",
  },
  last3d: {
    en: "Last 3 days",
    fr: "3 jours",
  },
  last7d: {
    en: "Last 7 days",
    fr: "7 jours",
  },
  last30d: {
    en: "Last 30 days",
    fr: "30 jours",
  },
  source: {
    en: "Source",
    fr: "Source",
  },
  total: {
    en: "Total",
    fr: "Total",
  },
  scored: {
    en: "Scored",
    fr: "Scorés",
  },
  average: {
    en: "Avg",
    fr: "Moy.",
  },
  score: {
    en: "Score",
    fr: "Score",
  },
  title: {
    en: "Title",
    fr: "Titre",
  },
  date: {
    en: "Date",
    fr: "Date",
  },
  reason: {
    en: "Reason",
    fr: "Raison",
  },
  feeds: {
    en: "Feeds",
    fr: "Flux",
  },
  activeFeeds: {
    en: "Active feeds",
    fr: "Flux actifs",
  },
  topicsTitle: {
    en: "Topics",
    fr: "Topics",
  },
  newTopic: {
    en: "New Topic",
    fr: "Nouveau topic",
  },
  back: {
    en: "Back",
    fr: "Retour",
  },
  createBtn: {
    en: "Create",
    fr: "Créer",
  },
  saveBtn: {
    en: "Save",
    fr: "Sauvegarder",
  },
  cancelBtn: {
    en: "Cancel",
    fr: "Annuler",
  },
  deleteBtn: {
    en: "Delete",
    fr: "Supprimer",
  },
  confirmDelete: {
    en: "Are you sure?",
    fr: "Êtes-vous sûr ?",
  },
  addFeed: {
    en: "Add Feed",
    fr: "Ajouter un flux",
  },
  feedName: {
    en: "Feed name",
    fr: "Nom du flux",
  },
  feedUrl: {
    en: "Feed URL",
    fr: "URL du flux",
  },
  noFeeds: {
    en: "No feeds yet",
    fr: "Aucun flux",
  },
  topicSlug: {
    en: "Slug (ID)",
    fr: "Slug (ID)",
  },
  labelEn: {
    en: "Label EN",
    fr: "Label EN",
  },
  labelFr: {
    en: "Label FR",
    fr: "Label FR",
  },
  scoringCriteria: {
    en: "Scoring criteria",
    fr: "Critères de scoring",
  },
  scoringDomainLabel: {
    en: "Domain",
    fr: "Domaine",
  },
  topicInfo: {
    en: "Topic info",
    fr: "Info topic",
  },
  editBtn: {
    en: "Edit",
    fr: "Modifier",
  },
  statusActive: {
    en: "Active",
    fr: "Actif",
  },
  statusInactive: {
    en: "Inactive",
    fr: "Inactif",
  },
} as const;

type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

export function dateLocale(lang: Lang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}
