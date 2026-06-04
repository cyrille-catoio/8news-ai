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
  temporaryServerError: {
    en: "The server is temporarily unavailable. Please try again in a few minutes.",
    fr: "Le serveur est temporairement indisponible. Veuillez réessayer dans quelques minutes.",
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
  topicDeleteConfirmTitle: {
    en: "Permanently delete topic",
    fr: "Supprimer définitivement le topic",
  },
  topicDeleteConfirmBody: {
    en: "This will permanently delete:\n• All RSS feeds linked to this topic\n• All articles fetched for this topic\n• All daily summaries and SEO bullet points\n• All video roundups\n• This topic from every user's selected topics\n• All home rotation queue entries\n\nLinked YouTube channels, videos and transcriptions will be kept but unlinked from the topic.\n\nThis action cannot be undone.",
    fr: "Cela supprimera définitivement :\n• Tous les flux RSS liés à ce topic\n• Tous les articles collectés pour ce topic\n• Tous les résumés quotidiens et leurs bullets SEO\n• Tous les roundups vidéo\n• Ce topic des préférences de tous les utilisateurs\n• Toutes les entrées de la file de rotation home\n\nLes chaînes YouTube, vidéos et transcriptions liées seront conservées mais détachées du topic.\n\nAction irréversible.",
  },
  topicDeleteSuccessNotice: {
    en: "Topic deleted ({articles} articles, {queue} queue entries, {prefs} user prefs cleaned).",
    fr: "Topic supprimé ({articles} articles, {queue} entrées de file, {prefs} préférences nettoyées).",
  },
  topicDeleteIconTitle: {
    en: "Delete this topic",
    fr: "Supprimer ce topic",
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
  slaUnder15m: {
    en: "SLA < 15m",
    fr: "SLA < 15m",
  },
  freshBacklog15m: {
    en: "Fresh backlog 15m",
    fr: "Backlog frais 15m",
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
    en: "Top 50 Articles from the last 24h",
    fr: "Top 50 Articles des dernières 24h",
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
  /** General menu: goes to the instant topic briefing flow (`/app/articles`).
   *  The key name `generalMenuArticlesBtn` is kept as a compatibility
   *  alias to avoid a sweep across unrelated callsites. */
  generalMenuArticlesBtn: {
    en: "My briefing",
    fr: "Ma veille",
  },
  myTopicsMenuBtn: {
    en: "My topics",
    fr: "Mes topics",
  },
  myBriefingTitle: {
    en: "My AI briefing",
    fr: "Ma veille IA",
  },
  myBriefingSubtitle: {
    en: "Generate an instant summary from the topics you follow. Select a topic and click a time period to analyze the news.",
    fr: "Générez un résumé instantané à partir de vos topics suivis. Sélectionnez un sujet et cliquez sur une période pour analyser les actualités.",
  },
  myTopicsPageTitle: {
    en: "My topics",
    fr: "Mes topics",
  },
  myTopicsPageSubtitle: {
    en: "Choose the topics that power your briefing, Top articles and newsletter.",
    fr: "Choisissez les sujets qui alimentent votre veille, votre top articles et votre newsletter.",
  },
  myTopicsSignInTitle: {
    en: "Sign in to choose your topics",
    fr: "Connectez-vous pour choisir vos topics",
  },
  myTopicsSignInBody: {
    en: "Your topic watchlist is saved to your account and reused across your briefing, Top articles and newsletter.",
    fr: "Votre watchlist de topics est liée à votre compte et réutilisée dans votre veille, votre Top articles et votre newsletter.",
  },
  navTopicsAria: {
    en: "Topics",
    fr: "Topics",
  },
  /** Label of the owner-only « Users » entry in the AppHeader user
   *  menu (moved out of SettingsPage in v2.7.x). Distinct from
   *  `myAccountSection`, which only edits the current user's own
   *  profile. */
  usersAdminAria: {
    en: "Users",
    fr: "Utilisateurs",
  },
  userActivityAdminAria: {
    en: "User Activity",
    fr: "Activité utilisateurs",
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
  headerProCta: {
    en: "Try Pro",
    fr: "Essayer Pro",
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
    en: "Start your free account",
    fr: "Démarrer votre compte gratuit",
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
    en: "Start free",
    fr: "Commencer gratuitement",
  },
  authSwitchToSignUp: {
    en: "No account? Start free",
    fr: "Pas de compte ? Commencer gratuitement",
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
    en: "Your 8news cockpit is ready",
    fr: "Votre cockpit 8news est prêt",
  },
  authWelcomeBody: {
    en: "Pick your topics, enable the daily brief, and reserve Pro Early Adopter from Settings if 8news becomes part of your morning routine.",
    fr: "Choisissez vos topics, activez le brief quotidien, et réservez Pro Early Adopter depuis les paramètres si 8news entre dans votre routine du matin.",
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
  /**
   * v2.6.12+ — Daily Newsletter opt-in flag rendered as a checkbox
   * in the admin Users table. Stored in
   * `auth.users.user_metadata.daily_newsletter` (boolean). The owner
   * toggles it during the pencil-edit flow alongside firstName /
   * lastName / userType, no dedicated row save.
   */
  usersDailyNewsletter: {
    en: "Daily Newsletter",
    fr: "Newsletter quotidienne",
  },
  usersNewsletterSubscribeButton: {
    en: "Subscribe",
    fr: "Inscrire",
  },
  usersNewsletterSubscribeAria: {
    en: "Subscribe {email} to the daily newsletter",
    fr: "Inscrire {email} à la newsletter quotidienne",
  },
  usersNewsletterSubscribed: {
    en: "On",
    fr: "ON",
  },
  usersNewsletterSubscribeSuccess: {
    en: "{email} is now subscribed to the daily newsletter.",
    fr: "{email} est maintenant inscrit à la newsletter quotidienne.",
  },
  usersNewsletterSubscribeError: {
    en: "Failed to subscribe user — {detail}.",
    fr: "Impossible d'inscrire l'utilisateur — {detail}.",
  },
  newsletterSignupKicker: {
    en: "Free morning brief",
    fr: "Brief matinal gratuit",
  },
  newsletterSignupTitle: {
    en: "Get the Top 24h brief in your inbox.",
    fr: "Recevez le brief Top 24h dans votre boîte mail.",
  },
  newsletterSignupBodyAnonymous: {
    en: "Create a free account to receive the daily AI briefing on the topics that matter.",
    fr: "Créez un compte gratuit pour recevoir chaque jour le brief IA sur les sujets qui comptent.",
  },
  newsletterSignupBodyMember: {
    en: "One click enables the daily newsletter for your account. You can disable it from Settings anytime.",
    fr: "Un clic active la newsletter quotidienne sur votre compte. Vous pouvez la désactiver depuis les paramètres à tout moment.",
  },
  newsletterSignupButtonAnonymous: {
    en: "Create account",
    fr: "Créer un compte",
  },
  newsletterSignupButtonMember: {
    en: "Enable newsletter",
    fr: "Activer la newsletter",
  },
  newsletterSignupSuccess: {
    en: "Daily newsletter enabled.",
    fr: "Newsletter quotidienne activée.",
  },
  newsletterSignupError: {
    en: "Could not enable the newsletter.",
    fr: "Impossible d'activer la newsletter.",
  },
  /**
   * v2.6.12+ — Default UI language the user lands on after sign-in.
   * Stored in `auth.users.user_metadata.preferred_lang` (the same key
   * read by `resolveServerLang()` and written by the SPA's
   * `handleLangChange` since v2.5.3). The owner overrides it during
   * the pencil-edit flow; on next sign-in the user's SPA reconciles
   * the value into local `lang` state.
   */
  usersLanguage: {
    en: "Language",
    fr: "Langue",
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
  // --- Send newsletter test action (v2.6.13+) -----------------------
  // Owner-only icon in the actions cell that fires
  // `POST /api/users/[id]/send-newsletter` so the operator can
  // validate the rendering / deliverability against a real inbox
  // without flipping the user's `daily_newsletter` flag and waiting
  // for the cron tick.
  usersSendNewsletterIconTitle: {
    en: "Send the latest newsletter",
    fr: "Envoyer la dernière newsletter",
  },
  usersSendNewsletterConfirm: {
    en: "Send the latest Top 24h newsletter to {email}?",
    fr: "Envoyer la dernière newsletter Top 24h à {email} ?",
  },
  usersSendNewsletterSuccess: {
    en: "Newsletter sent to {email} (snapshot {date}).",
    fr: "Newsletter envoyée à {email} (snapshot {date}).",
  },
  usersSendNewsletterError: {
    en: "Failed to send newsletter — {detail}.",
    fr: "Échec de l'envoi de la newsletter — {detail}.",
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
  /** General menu: goes to the cross-topic ranked feed (`/app?view=top`).
   *  Renamed in v2.5.17 from "Top 50 du jour / Today's Top 50" to a shorter,
   *  number-free wording. The hard-coded "50" was both arbitrary (the actual
   *  count varies with topic mix) and aged badly when the limit changed; the
   *  shorter pill also fits better on mobile (the previous label clipped at
   *  ~360px). The intent is unchanged: "the day's top stories across all
   *  your topics". */
  analyzeTopArticlesBtn: {
    en: "Top articles 24h",
    fr: "Top articles 24h",
  },
  topSummaryGeneratedOn: {
    en: "Generated on {date}",
    fr: "Généré le {date}",
  },
  /** Empty-state copy for `/top-articles` when the live « top 50 /
   *  24 h » feed returns zero rows. Rare in steady state — most often
   *  hit on a fresh deploy before the first scoring cron tick has
   *  populated the table. */
  topArticlesEmpty: {
    en: "No top articles in the last 24 hours yet — fresh stories are being scored and will appear here automatically.",
    fr: "Aucun top article sur les 24 dernières heures pour le moment — les articles en cours de scoring apparaîtront ici automatiquement.",
  },
  top24hHeroKicker: {
    en: "Top articles · 24h",
    fr: "Top articles · 24h",
  },
  audioPlayerKicker: {
    en: "Audio player",
    fr: "Lecteur audio",
  },
  /**
   * Default title rendered by the base `<Top24hHero>` component AND
   * by its `<TopArticlesTop24hHero>` wrapper (the dedicated
   * `/top-articles` surface). The home wrapper `<HomeTop24hHero>`
   * overrides via `top24hHeroHomeTitle` so the two surfaces can
   * diverge editorially without affecting each other.
   */
  top24hHeroTitle: {
    en: "Top 24h articles",
    fr: "Top articles 24h",
  },
  /**
   * Title used by `<HomeTop24hHero>` (the home BriefingPage card).
   * Distinct from `top24hHeroTitle` since v2.6.12 — the home reads as
   * « Podcast du jour » so the audio-first framing the player above
   * suggests is reinforced, while `/top-articles` keeps the
   * descriptive « Top articles 24h » that matches its URL slug.
   */
  top24hHeroHomeTitle: {
    en: "Daily podcast",
    fr: "Podcast du jour",
  },
  /** Shown on the home hero when `offset=0` but today's UTC snapshot
   *  row is not in `top_summaries` yet (cron pending / failed). */
  top24hHeroPendingToday: {
    en: "Today's edition is not ready yet — showing the latest available briefing.",
    fr: "L'édition du jour n'est pas encore prête — affichage du dernier briefing disponible.",
  },
  top24hHeroSeeAll: {
    en: "See all articles →",
    fr: "Voir tous les articles →",
  },
  /** v2.6.15+ — label of the bottom-left « lue » checkbox on the home
   *  `Top24hHero` card. When checked, BriefingPage demotes the hero
   *  below the transcribed-videos list so the visitor can keep reading
   *  the rest of the home without the briefing crowding the top. */
  top24hHeroReadLabel: {
    en: "Read",
    fr: "Lu",
  },
  // Master « expand / collapse all » toggle pinned at the top-right
  // of the Top 24h hero (home + /top-articles + /{date}). v2.6.13+.
  // Label is short on purpose so the button fits next to the H2 on
  // mobile without forcing a wrap.
  top24hHeroExpandAll: {
    en: "Expand all",
    fr: "Tout déplier",
  },
  top24hHeroCollapseAll: {
    en: "Collapse all",
    fr: "Tout replier",
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
  /** General menu pill — kept short. The full "My Favorites / Mes Favoris"
   *  wording is preserved for the page heading via the separate
   *  `favoritesTitle` key (also used in `<title>`); this key only feeds the
   *  nav pill so it stays compact on mobile alongside the other 6 pills. */
  myFavoritesBtn: {
    en: "Favorites",
    fr: "Favoris",
  },
  /** AppHeader live crypto ticker (BTC/ETH/SOL/XRP).
   *  `cryptoTickerStale` is shown as the tooltip / aria-label on a small
   *  grey dot when /api/crypto returned `stale: true` — i.e. CoinGecko
   *  was unreachable this tick and we're surfacing the last cached
   *  prices instead. `cryptoTickerError` is the tooltip for the «—»
   *  fallback when even the DB cache is empty (very rare; first-ever
   *  cold start with upstream down). Both copy strings are
   *  intentionally short — the ticker is ambient, the indicator is
   *  meant to register at a glance, not interrupt reading flow. */
  cryptoTickerStale: {
    en: "Stale data",
    fr: "Données obsolètes",
  },
  cryptoTickerError: {
    en: "Prices unavailable",
    fr: "Cours indisponibles",
  },
  /** Shown on every coin pill (title tooltip) and on the ticker group
   *  aria-label so visitors know the header prices auto-refresh. */
  cryptoTickerRefreshHint: {
    en: "Updates every minute",
    fr: "Actualisation chaque minute",
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
  /** General menu pill for `/app/daily-summaries` — the historical archive of
   *  per-topic daily roundups. Renamed in v2.5.17 from "Daily Summaries /
   *  Résumés quotidiens" to "Archives" because the page IS the archive
   *  (today's roundup lives elsewhere — on the Briefing/Today screen) and
   *  "Daily Summaries" overlapped semantically with the cross-topic Top
   *  story summary. The page heading still uses richer copy via its own
   *  i18n key; this is just the nav pill. */
  dailySummaryBtn: {
    en: "Archives",
    fr: "Archives",
  },
  /** General menu first item — homepage / today's briefing.
   *  Renamed in v2.5.17 from "Briefing" to "Today / Aujourd'hui": the new
   *  wording answers the user's question ("what's new today?") instead of
   *  describing the format (a briefing). It also pairs naturally with the
   *  date-stamped content shown on that screen and avoids stacking three
   *  format-named buttons in a row (Briefing / Vidéos / Briefings vidéo). */
  briefingBtn: {
    en: "Today",
    fr: "Aujourd'hui",
  },
  /**
   * General menu pill for the legacy `/briefings` route. **Removed
   * from the visible nav in v2.7.0** — the unified `/archives` hub
   * now covers both article daily summaries and video roundups in
   * one place, so the pill was redundant. The string itself is
   * retained as a translation alias because some changelog
   * entries (v2.5.17, v2.6.0+) still reference it, and tightening
   * the SPA's `AppNavPage` discriminator is left for a future cleanup.
   * Safe to delete in v2.8 once no consumer links point at it.
   */
  videoBriefingsBtn: {
    en: "Video recaps",
    fr: "Récaps vidéo",
  },
  /** General menu pill for `/app/videos` — today's videos feed. */
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
  dailySummaryNotFound: {
    en: "No summary available for this topic and date.",
    fr: "Aucun résumé disponible pour ce topic et cette date.",
  },
  dailySummaryViewFull: {
    en: "View full page",
    fr: "Voir la page complète",
  },

  // --- Daily newsletter (cron-newsletter-daily-background, v2.6.12+) ---
  // Rendered into the email subject + body by
  // `src/lib/email/render-daily-newsletter.ts`. Kept in the shared
  // i18n table so the same wording shows up on the homepage Top24h
  // card (`top24hHeroTitle`) and in the email envelope.
  newsletterSubjectPrefix: {
    en: "Daily Newsletter",
    fr: "Newsletter quotidienne",
  },
  newsletterIntro: {
    en: "Here's your daily AI-curated brief of the most important stories from the last 24 hours.",
    fr: "Voici votre brief quotidien : les actualités les plus importantes des 24 dernières heures, sélectionnées par l'IA.",
  },
  newsletterReadOnline: {
    en: "Read the last 24h articles",
    fr: "Lire les derniers articles 24h",
  },
  newsletterFooterReason: {
    en: "You're receiving this email because the daily newsletter is enabled on your 8news account.",
    fr: "Vous recevez cet email parce que la newsletter quotidienne est activée sur votre compte 8news.",
  },
  newsletterFooterUnsubscribe: {
    en: "Sign in to update your preferences",
    fr: "Connectez-vous pour modifier vos préférences",
  },

  // ── Daily Podcast chat side panel (v2.13+) ──────────────────────
  podcastChatOpen: {
    en: "Ask the Daily Podcast",
    fr: "Demander au Podcast du jour",
  },
  podcastChatTitle: {
    en: "Daily Podcast chat",
    fr: "Chat du Podcast du jour",
  },
  podcastChatClose: {
    en: "Close",
    fr: "Fermer",
  },
  podcastChatContextChip: {
    en: "Context: Daily Podcast",
    fr: "Contexte : Podcast du jour",
  },
  podcastChatClear: {
    en: "Clear conversation",
    fr: "Effacer la conversation",
  },
  podcastChatPlaceholder: {
    en: "Ask anything about today's briefing…",
    fr: "Posez une question sur le briefing du jour…",
  },
  podcastChatSend: {
    en: "Send",
    fr: "Envoyer",
  },
  podcastChatEmpty: {
    en: "Ask a question about today's podcast. The full briefing — text, notes and source links — is used as context.",
    fr: "Posez une question sur le podcast du jour. Tout le briefing — texte, notes et liens sources — sert de contexte.",
  },
  podcastChatSignInHint: {
    en: "Type your question — you'll be asked to sign in (free) to get the answer.",
    fr: "Tapez votre question — la connexion (gratuite) vous sera demandée pour obtenir la réponse.",
  },
  podcastChatNoSnapshot: {
    en: "Today's podcast isn't available yet. Come back once the daily briefing has been generated.",
    fr: "Le podcast du jour n'est pas encore disponible. Revenez une fois le briefing quotidien généré.",
  },
  podcastChatError: {
    en: "Something went wrong. Please try again.",
    fr: "Une erreur s'est produite. Veuillez réessayer.",
  },
  podcastChatThinking: {
    en: "Thinking…",
    fr: "Réflexion…",
  },
  podcastChatClearConfirm: {
    en: "Clear the whole conversation for today?",
    fr: "Effacer toute la conversation du jour ?",
  },
} as const;

type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

export function dateLocale(lang: Lang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}
