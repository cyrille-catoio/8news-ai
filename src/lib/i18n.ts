export type Lang = "en" | "fr";

const strings = {
  appName: {
    en: "8news",
    fr: "8news",
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
  noArticlesForPeriod: {
    en: "No relevant articles found for this time period.",
    fr: "Aucun article pertinent trouvé pour cette période.",
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
  last1h: {
    en: "1h",
    fr: "1h",
  },
  last3h: {
    en: "3h",
    fr: "3h",
  },
  last6h: {
    en: "6h",
    fr: "6h",
  },
  today: {
    en: "Today",
    fr: "Aujourd'hui",
  },
  yesterday: {
    en: "Yesterday",
    fr: "Hier",
  },
  last3d: {
    en: "3 days",
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
    en: "Add feed",
    fr: "Ajouter un flux",
  },
  addFeedsByAi: {
    en: "Find 10 RSS feeds with AI",
    fr: "Trouver 10 flux RSS par IA",
  },
  noFeedsFoundAi: {
    en: "No feeds could be found.",
    fr: "Aucun flux n'a pu être trouvé.",
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
  generateAi: {
    en: "Generate with AI",
    fr: "Générer par IA",
  },
  generatingAi: {
    en: "Generating…",
    fr: "Génération…",
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
  enableTopic: {
    en: "Enable",
    fr: "Activer",
  },
  disableTopic: {
    en: "Disable",
    fr: "Désactiver",
  },
  moveUp: {
    en: "Move up",
    fr: "Monter",
  },
  moveDown: {
    en: "Move down",
    fr: "Descendre",
  },
  topicVisibleHome: {
    en: "Visible on homepage and scored by crons",
    fr: "Visible sur la page d'accueil et scoré par les crons",
  },
  topicHiddenHome: {
    en: "Hidden from homepage, not scored by crons",
    fr: "Masqué de la page d'accueil, non scoré par les crons",
  },
  analysisPrompt: {
    en: "Analysis Prompt",
    fr: "Prompt d'analyse",
  },
  promptPlaceholder: {
    en: "Leave empty to auto-generate a default prompt based on your topic name and scoring domain.",
    fr: "Laissez vide pour générer automatiquement un prompt basé sur le nom du topic et le domaine de scoring.",
  },
  promptMissingMax: {
    en: "Warning: {{max}} placeholder is missing. The number of articles to select will not be controlled.",
    fr: "Attention : le placeholder {{max}} est absent. Le nombre d'articles à sélectionner ne sera pas contrôlé.",
  },
  promptMaxInfo: {
    en: "{{max}} will be replaced by the number of articles selected by the user.",
    fr: "{{max}} sera remplacé par le nombre d'articles sélectionné par l'utilisateur.",
  },
  autoFeedSearch: {
    en: "Find 10 RSS feeds automatically",
    fr: "Trouver 10 flux RSS automatiquement",
  },
  autoFeedSearchDesc: {
    en: "The AI will search for relevant RSS feeds based on the topic domain and verify they contain articles before adding them.",
    fr: "L'IA recherchera des flux RSS pertinents en fonction du domaine du topic et vérifiera qu'ils contiennent des articles avant de les ajouter.",
  },
  discoveringFeeds: {
    en: "Searching for RSS feeds…",
    fr: "Recherche de flux RSS…",
  },
  feedsAdded: {
    en: "feeds added successfully",
    fr: "flux ajoutés avec succès",
  },
  feedsRejected: {
    en: "feeds rejected",
    fr: "flux rejetés",
  },
} as const;

type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

export function dateLocale(lang: Lang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}
