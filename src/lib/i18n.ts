export type Lang = "en" | "fr";

const strings = {
  appName: {
    en: "8news",
    fr: "8news",
  },
  subtitle: {
    en: "Tech • IA • Crypto",
    fr: "Tech • IA • Crypto",
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
    fr: "Résumé IA",
  },
  relevantArticles: {
    en: "Relevant articles",
    fr: "Articles sélectionnés",
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
    en: "Articles are pre-scored by AI (relevance 1-10). The top-scored articles from the selected period are sent to the AI for summary. This setting controls how many articles are analyzed and displayed.",
    fr: "Les articles sont pré-scorés par l'IA (pertinence 1-10). Les articles les mieux scorés de la période sont envoyés à l'IA pour résumé. Ce réglage contrôle combien d'articles sont analysés et affichés.",
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
    en: "Article ranking",
    fr: "Classement des articles",
  },
  topicComparison: {
    en: "Topic comparison",
    fr: "Comparaison des topics",
  },
  hitRate: {
    en: "Score ≥ 7",
    fr: "Score ≥ 7",
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
  backToHomePage: {
    en: "Back to home page",
    fr: "Retour page d'accueil",
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
  discoverFeedsFailed: {
    en: "Failed to discover feeds with AI.",
    fr: "Impossible de trouver des flux par IA.",
  },
  manualFeedAddFailed: {
    en: "Failed to add feed.",
    fr: "Impossible d'ajouter le flux.",
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
  categoryColumn: {
    en: "Category",
    fr: "Catégorie",
  },
  topicCategorySaveError: {
    en: "Could not update the category.",
    fr: "Impossible de mettre à jour la catégorie.",
  },
  categoriesAdminAria: {
    en: "Categories",
    fr: "Catégories",
  },
  categoriesTitle: {
    en: "Categories",
    fr: "Catégories",
  },
  categoriesSlug: {
    en: "Slug",
    fr: "Slug",
  },
  categoriesAddNew: {
    en: "+ New category",
    fr: "+ Nouvelle catégorie",
  },
  displayColumn: {
    en: "Display",
    fr: "Affichage",
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
  rssFeedsBoxTitle: {
    en: "RSS feeds",
    fr: "Flux RSS",
  },
  rssFeedsBoxDesc: {
    en: "You can discover feeds with AI or add them manually. A hidden draft topic is created automatically when needed.",
    fr: "Vous pouvez trouver des flux par IA ou les ajouter manuellement. Un topic brouillon caché est créé automatiquement si nécessaire.",
  },
  rssAutoDiscoveryTitle: {
    en: "Automatic discovery with AI",
    fr: "Découverte automatique par IA",
  },
  rssManualAddTitle: {
    en: "Manual feed addition",
    fr: "Ajout manuel de flux",
  },
  draftTopicReady: {
    en: "Draft topic created",
    fr: "Topic brouillon créé",
  },
  topicFieldsRequiredForDraft: {
    en: "Complete slug, labels and domain before managing feeds.",
    fr: "Complétez le slug, les labels et le domaine avant de gérer les flux.",
  },
  topicScoringRequiredForDraft: {
    en: "Complete scoring criteria tiers before managing feeds.",
    fr: "Complétez les niveaux des critères de scoring avant de gérer les flux.",
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
  cronMonitor: {
    en: "Cron Monitor",
    fr: "Monitoring Crons",
  },
  backlog: {
    en: "Backlog",
    fr: "En attente",
  },
  fetched24h: {
    en: "Fetched 24h",
    fr: "Fetchés 24h",
  },
  scored24hCron: {
    en: "Scored 24h",
    fr: "Scorés 24h",
  },
  coverage24h: {
    en: "Coverage 24h",
    fr: "Couverture 24h",
  },
  avgDelay: {
    en: "Avg delay",
    fr: "Délai moy.",
  },
  delayP95: {
    en: "Delay p95",
    fr: "Délai p95",
  },
  slaUnder5m: {
    en: "SLA < 5m",
    fr: "SLA < 5m",
  },
  freshBacklog5m: {
    en: "Fresh backlog 5m",
    fr: "Backlog frais 5m",
  },
  alerts: {
    en: "Alerts",
    fr: "Alertes",
  },
  lastFetch: {
    en: "Last fetch",
    fr: "Dernier fetch",
  },
  lastScore: {
    en: "Last score",
    fr: "Dernier score",
  },
  topicStatus: {
    en: "Topic Status",
    fr: "Statut des topics",
  },
  activityTimeline: {
    en: "Activity (last 24h)",
    fr: "Activité (dernières 24h)",
  },
  statusOk: {
    en: "OK",
    fr: "OK",
  },
  statusSlow: {
    en: "Slow",
    fr: "Lent",
  },
  statusHigh: {
    en: "Very slow",
    fr: "Très lent",
  },
  minutesAgo: {
    en: "min ago",
    fr: "min",
  },
  hoursAgo: {
    en: "h ago",
    fr: "h",
  },
  hourCol: {
    en: "Hour",
    fr: "Heure",
  },
  fetchedCol: {
    en: "Fetched",
    fr: "Fetchés",
  },
  scoredCol: {
    en: "Scored",
    fr: "Scorés",
  },
  changelog: {
    en: "Update Log",
    fr: "Journal des mises à jour",
  },
  changelogEmpty: {
    en: "No updates yet.",
    fr: "Aucune mise à jour pour le moment.",
  },
  feedsAdminTitle: {
    en: "Feed management",
    fr: "Gestion des flux",
  },
  feedsAdminAria: {
    en: "Feed management",
    fr: "Gestion des flux",
  },
  feedsAdminLoading: {
    en: "Loading feeds…",
    fr: "Chargement des flux…",
  },
  feedsAdminSelectFilterPrompt: {
    en: "Choose “All” or a topic above to load feeds.",
    fr: "Choisissez « Tous » ou un topic ci-dessus pour charger les flux.",
  },
  feedsAdminColTopic: {
    en: "Topic",
    fr: "Topic",
  },
  feedsAdminColArticles: {
    en: "Articles",
    fr: "Articles",
  },
  feedsAdminCreatedAt: {
    en: "Created",
    fr: "Créé le",
  },
  feedsAdminInactive: {
    en: "Inactive",
    fr: "Inactif",
  },
  feedsAdminDeleteFeed: {
    en: "Remove feed",
    fr: "Supprimer le flux",
  },
  feedsAdminDeleteArticles: {
    en: "Delete stored articles for this feed",
    fr: "Supprimer les articles de ce flux",
  },
  feedsAdminDeleteFeedConfirm: {
    en: "Remove the feed \"{source}\" from its topic?",
    fr: "Supprimer le flux « {source} » de son topic ?",
  },
  feedsAdminDeleteArticlesConfirm: {
    en: "Delete every stored article from \"{source}\" for this topic? This cannot be undone.",
    fr: "Supprimer tous les articles stockés pour « {source} » sur ce topic ? Irréversible.",
  },
  feedsAdminActions: {
    en: "Actions",
    fr: "Actions",
  },
  feedsAdminScoreFeed: {
    en: "Score up to 50 unscored articles from this feed (all ages, newest first)",
    fr: "Scorer jusqu’à 50 articles non scorés de ce flux (tous âges, plus récents d’abord)",
  },
  feedsAdminScoreFeedError: {
    en: "Scoring failed.",
    fr: "Échec du scoring.",
  },
  feedsAdminScoreFeedNone: {
    en: "No unscored articles for this feed.",
    fr: "Aucun article non scoré pour ce flux.",
  },
  feedsAdminScoreFeedDone: {
    en: "Scored {n} article(s).",
    fr: "{n} article(s) scoré(s).",
  },
  feedsAdminScoreFeedDonePartial: {
    en: "Scored {n}/{total} article(s) before timeout. Run again for the rest.",
    fr: "{n}/{total} article(s) scoré(s) avant timeout. Relancez pour le reste.",
  },
  feedsAdminToastLoadingScore: {
    en: "Scoring articles…",
    fr: "Scoring des articles en cours…",
  },
  feedsAdminToastLoadingDeleteArticles: {
    en: "Deleting articles…",
    fr: "Suppression des articles en cours…",
  },
  feedsAdminToastLoadingDeleteFeed: {
    en: "Removing feed…",
    fr: "Suppression du flux en cours…",
  },
  feedsAdminToastSuccessFeedRemoved: {
    en: "Feed removed.",
    fr: "Flux supprimé.",
  },
  feedsAdminToastSuccessArticlesRemoved: {
    en: "{n} article(s) removed.",
    fr: "{n} article(s) supprimé(s).",
  },
  homeLoadingReading: {
    en: "Reading articles…",
    fr: "Lecture des articles…",
  },
  homeLoadingAi: {
    en: "AI analysis…",
    fr: "Analyse IA…",
  },
  homeSelectPeriodPrompt: {
    en: "Select a time period to start the analysis.",
    fr: "Sélectionnez une durée pour lancer l'analyse.",
  },
  homeSelectTopicFirstToast: {
    en: "Please select a topic first.",
    fr: "Veuillez d'abord sélectionner un topic.",
  },
  homeSelectPeriodAfterTopicToast: {
    en: "Select a time period to start AI analysis.",
    fr: "Sélectionner une durée pour lancer l'analyse IA",
  },
  homeTop20Subtitle: {
    en: "Top Articles from the last 24h",
    fr: "Top Articles des dernières 24h",
  },
  actionRefresh: {
    en: "Refresh",
    fr: "Rafraîchir",
  },
  homeNewVersionBanner: {
    en: "New version available — click to refresh",
    fr: "Nouvelle version disponible — cliquer pour rafraîchir",
  },
  scrollToTopAria: {
    en: "Scroll to top",
    fr: "Retour en haut",
  },
  navHomeAria: {
    en: "Home",
    fr: "Accueil",
  },
  /** General menu first item: goes to homepage (article flow). */
  generalMenuArticlesBtn: {
    en: "Topics",
    fr: "Topics",
  },
  navTopicsAria: {
    en: "Topics",
    fr: "Topics",
  },
  navStatsAria: {
    en: "Stats",
    fr: "Stats",
  },
  articleNewBadge: {
    en: "NEW",
    fr: "NEW",
  },
  topicsEmptyList: {
    en: "No topics",
    fr: "Aucun topic",
  },
  authSignIn: {
    en: "Sign in",
    fr: "Connexion",
  },
  authSignOut: {
    en: "Sign out",
    fr: "Déconnexion",
  },
  authModalTitleSignIn: {
    en: "Sign in",
    fr: "Connexion",
  },
  authModalTitleSignUp: {
    en: "Create account",
    fr: "Créer un compte",
  },
  authEmail: {
    en: "Email",
    fr: "E-mail",
  },
  authPassword: {
    en: "Password",
    fr: "Mot de passe",
  },
  authFirstName: {
    en: "First name",
    fr: "Prénom",
  },
  authLastName: {
    en: "Last name",
    fr: "Nom",
  },
  authSubmitSignIn: {
    en: "Sign in",
    fr: "Se connecter",
  },
  authSubmitSignUp: {
    en: "Register",
    fr: "S'inscrire",
  },
  authSwitchToSignUp: {
    en: "No account? Register",
    fr: "Pas de compte ? S'inscrire",
  },
  authSwitchToSignIn: {
    en: "Already have an account? Sign in",
    fr: "Déjà un compte ? Se connecter",
  },
  authCloseAria: {
    en: "Close",
    fr: "Fermer",
  },
  authErrorGeneric: {
    en: "Something went wrong. Check your details and try again.",
    fr: "Une erreur s'est produite. Vérifiez vos informations et réessayez.",
  },
  authSignUpCheckEmail: {
    en: "Check your email to confirm your account, then sign in.",
    fr: "Consultez vos e-mails pour confirmer votre compte, puis connectez-vous.",
  },
  authWelcomeTitle: {
    en: "Welcome to 8news",
    fr: "Bienvenue sur 8news",
  },
  authWelcomeBody: {
    en: "8news is going to evolve very quickly in the coming weeks. Your feedback is essential to help the team improve the product. Don't hesitate to share what could be better.",
    fr: "8news va évoluer très rapidement dans les semaines à venir. Vos retours sont essentiels pour aider l'équipe à améliorer le produit. N'hésitez pas à nous faire part des points à améliorer.",
  },
  authWelcomeClose: {
    en: "Close",
    fr: "Fermer",
  },
  usersSection: {
    en: "Users",
    fr: "Utilisateurs",
  },
  usersFirstName: {
    en: "First name",
    fr: "Prénom",
  },
  usersLastName: {
    en: "Last name",
    fr: "Nom",
  },
  usersEmail: {
    en: "Email",
    fr: "E-mail",
  },
  usersType: {
    en: "Type",
    fr: "Type",
  },
  usersCreatedAt: {
    en: "Registered",
    fr: "Inscrit le",
  },
  usersActions: {
    en: "Edit",
    fr: "Modifier",
  },
  usersSaveAria: {
    en: "Save",
    fr: "Enregistrer",
  },
  usersCancelAria: {
    en: "Cancel",
    fr: "Annuler",
  },
  usersLoading: {
    en: "Loading users…",
    fr: "Chargement des utilisateurs…",
  },
  usersLoadError: {
    en: "Failed to load users.",
    fr: "Impossible de charger les utilisateurs.",
  },
  usersSaveError: {
    en: "Failed to save changes.",
    fr: "Impossible d'enregistrer les modifications.",
  },
  myAccountSection: {
    en: "My account",
    fr: "Mon compte",
  },
  myAccountSaveSuccess: {
    en: "Saved.",
    fr: "Enregistré.",
  },
  myAccountSaveError: {
    en: "Failed to save.",
    fr: "Impossible d'enregistrer.",
  },
  myTopicsCustomize: {
    en: "Customize my topics",
    fr: "Personnaliser mes topics",
  },
  analyzeTopArticlesBtn: {
    en: "Today's Top",
    fr: "Top du jour",
  },
  myTopicsEdit: {
    en: "Edit",
    fr: "Modifier",
  },
  myTopicsEditFull: {
    en: "Edit my topics",
    fr: "Modifier mes topics",
  },
  myTopicsShowAll: {
    en: "Show all topics",
    fr: "Voir tous les topics",
  },
  myTopicsDone: {
    en: "Done",
    fr: "Terminé",
  },
  myTopicsAddNew: {
    en: "New topic +",
    fr: "+ Nouveau topic",
  },
  myTopicsHint: {
    en: "Click topics to select/deselect",
    fr: "Cliquez sur les topics pour les sélectionner",
  },
  myTopicsSaving: {
    en: "Saving…",
    fr: "Enregistrement…",
  },
  myTopicsSaved: {
    en: "Saved",
    fr: "Enregistré",
  },
  myTopicsSignInPrompt: {
    en: "Sign in to personalize",
    fr: "Connectez-vous pour personnaliser",
  },
  onboardingTitle: {
    en: "Choose your topics",
    fr: "Choisissez vos topics",
  },
  onboardingSubtitle: {
    en: "Select the topics you want to follow. You can change this anytime.",
    fr: "Sélectionnez les topics que vous souhaitez suivre. Vous pourrez les modifier à tout moment.",
  },
  onboardingContinue: {
    en: "Continue",
    fr: "Continuer",
  },
  topicPendingValidation: {
    en: "Your topic will be available after validation within 24 hours maximum.",
    fr: "Votre topic sera disponible après validation dans un délai maximal de 24 heures",
  },
  topicPendingValidationList: {
    en: "Your topic is being validated. Maximum delay is 24 hours.",
    fr: "Votre topic est en cours de validation et le délai est au maximum de 24 heures.",
  },
  navFavoritesAria: {
    en: "Favorites",
    fr: "Favoris",
  },
  myFavoritesBtn: {
    en: "My Favorites",
    fr: "Mes Favoris",
  },
  favoritesTitle: {
    en: "My Favorites",
    fr: "Mes Favoris",
  },
  favoritesEmpty: {
    en: "No favorites yet",
    fr: "Aucun favori pour le moment",
  },
  favoritesEmptyHint: {
    en: "Tap the star next to an article to save it here.",
    fr: "Appuyez sur l'étoile à côté d'un article pour le sauvegarder ici.",
  },
  addToFavorites: {
    en: "Add to favorites",
    fr: "Ajouter aux favoris",
  },
  removeFromFavorites: {
    en: "Remove from favorites",
    fr: "Retirer des favoris",
  },
  favoritesLoading: {
    en: "Loading favorites…",
    fr: "Chargement des favoris…",
  },
  seoBackHome: {
    en: "Home",
    fr: "Accueil",
  },
  seoTopicHub: {
    en: "All summaries",
    fr: "Tous les résumés",
  },
  seoPrevDay: {
    en: "Previous day",
    fr: "Jour précédent",
  },
  seoNextDay: {
    en: "Next day",
    fr: "Jour suivant",
  },
  seoArticlesAnalyzed: {
    en: "articles analyzed by AI",
    fr: "articles analysés par IA",
  },
  seoNoSummary: {
    en: "No summary available for this date.",
    fr: "Aucun résumé disponible pour cette date.",
  },
  seoHubTitle: {
    en: "Daily AI News Summaries",
    fr: "Résumés quotidiens IA",
  },
  seoHubEmpty: {
    en: "No summaries available yet.",
    fr: "Aucun résumé disponible pour le moment.",
  },
  seoBullets: {
    en: "Key points",
    fr: "Points clés",
  },
  seoRelevantArticles: {
    en: "Relevant articles",
    fr: "Articles pertinents",
  },
  dailySummariesAdmin: {
    en: "Daily Summaries",
    fr: "Résumés quotidiens",
  },
  dailySummariesTitle: {
    en: "Daily Summaries Generator",
    fr: "Générateur de résumés quotidiens",
  },
  dailySummariesDesc: {
    en: "Generate AI daily summary pages for SEO. Each generation creates EN + FR summaries for the selected topic and date.",
    fr: "Générer des pages de résumés quotidiens IA pour le SEO. Chaque génération crée les résumés EN + FR pour le topic et la date sélectionnés.",
  },
  dailySummariesGenerate: {
    en: "Generate summary",
    fr: "Générer le résumé",
  },
  dailySummariesGenerateAll: {
    en: "Generate all topics",
    fr: "Générer tous les topics",
  },
  dailySummariesGenerating: {
    en: "Generating…",
    fr: "Génération…",
  },
  dailySummariesSuccess: {
    en: "Summary generated successfully",
    fr: "Résumé généré avec succès",
  },
  dailySummariesError: {
    en: "Generation failed",
    fr: "Échec de la génération",
  },
  dailySummariesDate: {
    en: "Date",
    fr: "Date",
  },
  dailySummariesTopic: {
    en: "Topic",
    fr: "Topic",
  },
  dailySummariesViewPage: {
    en: "View page",
    fr: "Voir la page",
  },
  dailySummaryBtn: {
    en: "Daily Summaries",
    fr: "Résumés quotidiens",
  },
  briefingBtn: {
    en: "Briefing",
    fr: "Briefing",
  },
  videosBtn: {
    en: "Videos",
    fr: "Vidéos",
  },
  videoKindLong: {
    en: "Long",
    fr: "Long",
  },
  videoKindShorts: {
    en: "Short",
    fr: "Short",
  },
  videoKindToggleAria: {
    en: "Show long videos or Short",
    fr: "Afficher les vidéos longues ou le format Short",
  },
  videoKindHintNoLong: {
    en: "No long videos for this day. Switch to Short to see them.",
    fr: "Aucune vidéo longue ce jour. Bascule sur Short pour les voir.",
  },
  videoKindHintNoShorts: {
    en: "No short videos for this day. Switch to Long to see the videos.",
    fr: "Aucune vidéo courte ce jour. Bascule sur Long pour voir les vidéos.",
  },
  videoSummaryRegionAria: {
    en: "AI summary",
    fr: "Résumé IA",
  },
  dailySummaryExplorerTitle: {
    en: "Daily Summaries",
    fr: "Résumés quotidiens",
  },
  dailySummaryExplorerDesc: {
    en: "Select a topic and a date to view the AI-generated daily summary.",
    fr: "Sélectionnez un topic et une date pour consulter le résumé quotidien généré par IA.",
  },
  dailySummaryNotFound: {
    en: "No summary available for this topic and date.",
    fr: "Aucun résumé disponible pour ce topic et cette date.",
  },
  dailySummaryViewFull: {
    en: "View full page",
    fr: "Voir la page complète",
  },
} as const;

type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

export function dateLocale(lang: Lang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}
