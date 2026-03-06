import type { Topic } from "./types";

export interface Feed {
  name: string;
  url: string;
}

const CONFLICT_FEEDS: readonly Feed[] = [
  // Major international news
  { name: "BBC News",          url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "CNN",               url: "https://rss.cnn.com/rss/cnn_topstories.rss" },
  { name: "Al Jazeera",        url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian",      url: "https://www.theguardian.com/world/rss" },
  { name: "France 24",         url: "https://www.france24.com/en/rss" },
  { name: "DW",                url: "https://rss.dw.com/xml/rss-en-world" },
  { name: "NYT World",         url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "Washington Post",   url: "https://feeds.washingtonpost.com/rss/world" },
  { name: "NPR News",          url: "https://feeds.npr.org/1001/rss.xml" },
  { name: "ABC News",          url: "https://abcnews.go.com/abcnews/internationalheadlines" },
  // Defense, conflict data & Middle East focused
  { name: "Reuters World",     url: "https://www.reutersagency.com/feed/" },
  { name: "AP News",           url: "https://rsshub.app/apnews/topics/world-news" },
  { name: "Times of Israel",   url: "https://www.timesofisrael.com/feed/" },
  { name: "Jerusalem Post",    url: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx" },
  { name: "Middle East Eye",   url: "https://www.middleeasteye.net/rss" },
  { name: "Defense One",       url: "https://www.defenseone.com/rss/" },
  { name: "War on the Rocks",  url: "https://warontherocks.com/feed/" },
  { name: "The War Zone",      url: "https://www.thedrive.com/the-war-zone/rss" },
  { name: "IISS",              url: "https://www.iiss.org/rss" },
  { name: "CSIS",              url: "https://www.csis.org/rss" },
];

const AI_FEEDS: readonly Feed[] = [
  // General AI news
  { name: "TechCrunch AI",     url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "The Verge AI",      url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "Wired AI",          url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { name: "Ars Technica",      url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { name: "VentureBeat AI",    url: "https://venturebeat.com/category/ai/feed/" },
  { name: "MIT Tech Review",   url: "https://www.technologyreview.com/feed/" },
  { name: "The Register AI",   url: "https://www.theregister.com/software/ai_ml/headlines.atom" },
  { name: "AI News",           url: "https://www.artificialintelligence-news.com/feed/" },
  { name: "Google AI Blog",    url: "https://blog.google/technology/ai/rss/" },
  { name: "IEEE Spectrum AI",  url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence" },
  // AI coding tools & models
  { name: "OpenAI Blog",       url: "https://openai.com/blog/rss.xml" },
  { name: "Anthropic News",    url: "https://www.anthropic.com/rss.xml" },
  { name: "Hacker News",       url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+cursor+OR+copilot+OR+claude" },
  { name: "The Information",   url: "https://www.theinformation.com/feed" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Towards Data Sci.", url: "https://towardsdatascience.com/feed" },
  { name: "DeepMind Blog",     url: "https://deepmind.google/blog/rss.xml" },
  { name: "Simon Willison",    url: "https://simonwillison.net/atom/everything/" },
  { name: "The Rundown AI",    url: "https://www.therundown.ai/feed" },
  { name: "Ben's Bites",       url: "https://bensbites.beehiiv.com/feed" },
];

const CRYPTO_FEEDS: readonly Feed[] = [
  // General crypto
  { name: "CoinDesk",          url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph",     url: "https://cointelegraph.com/rss" },
  { name: "The Block",         url: "https://www.theblock.co/rss.xml" },
  { name: "Decrypt",           url: "https://decrypt.co/feed" },
  { name: "CryptoSlate",       url: "https://cryptoslate.com/feed/" },
  { name: "NewsBTC",           url: "https://www.newsbtc.com/feed/" },
  { name: "U.Today",           url: "https://u.today/rss" },
  { name: "Bitcoinist",        url: "https://bitcoinist.com/feed/" },
  { name: "The Daily Hodl",    url: "https://dailyhodl.com/feed/" },
  { name: "CryptoPotato",      url: "https://cryptopotato.com/feed/" },
  // BTC-focused
  { name: "Bitcoin Magazine",  url: "https://bitcoinmagazine.com/feed" },
  { name: "Bitcoin News",      url: "https://news.bitcoin.com/feed/" },
  { name: "BTC Times",         url: "https://thebtctimes.com/feed/" },
  { name: "Blockworks",        url: "https://blockworks.co/feed" },
  { name: "Glassnode Insights",url: "https://insights.glassnode.com/rss/" },
  { name: "Whale Alert",       url: "https://whale-alert.io/feed" },
  { name: "BitcoinDev Blog",   url: "https://blog.lopp.net/rss/" },
  { name: "River Financial",   url: "https://river.com/learn/rss.xml" },
  { name: "Unchained Capital", url: "https://unchained.com/blog/feed/" },
  { name: "Stacker News",      url: "https://stacker.news/rss" },
];

const ROBOTICS_FEEDS: readonly Feed[] = [
  // General robotics & tech
  { name: "IEEE Spectrum Robotics", url: "https://spectrum.ieee.org/feeds/topic/robotics" },
  { name: "The Robot Report",       url: "https://www.therobotreport.com/feed/" },
  { name: "TechCrunch Robotics",    url: "https://techcrunch.com/category/robotics/feed/" },
  { name: "Robotics & Automation",  url: "https://www.robotics.org/content/rss/robotics-blog.xml" },
  { name: "New Atlas Robotics",     url: "https://newatlas.com/robotics/rss/" },
  { name: "The Verge AI",           url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "Ars Technica",           url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { name: "Wired AI",               url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { name: "VentureBeat AI",         url: "https://venturebeat.com/category/ai/feed/" },
  { name: "MIT Tech Review",        url: "https://www.technologyreview.com/feed/" },
  // AI robotics companies & embodied AI
  { name: "Hacker News Robotics",   url: "https://hnrss.org/newest?q=Unitree+OR+Optimus+OR+humanoid+robot+OR+Figure+AI+OR+Boston+Dynamics" },
  { name: "Automate",               url: "https://www.automate.org/rss/blogs" },
  { name: "Robohub",                url: "https://robohub.org/feed/" },
  { name: "Singularity Hub",        url: "https://singularityhub.com/feed/" },
  { name: "Interesting Engineering",url: "https://interestingengineering.com/innovation/rss" },
  { name: "Google DeepMind",        url: "https://deepmind.google/blog/rss.xml" },
  { name: "OpenAI Blog",            url: "https://openai.com/blog/rss.xml" },
  { name: "Futurism",               url: "https://futurism.com/feed" },
  { name: "Slash Gear",             url: "https://www.slashgear.com/feed" },
  { name: "Tech Xplore Robotics",   url: "https://techxplore.com/rss-feed/robotics/" },
];

const FEEDS_BY_TOPIC: Record<Topic, readonly Feed[]> = {
  conflict: CONFLICT_FEEDS,
  ai: AI_FEEDS,
  crypto: CRYPTO_FEEDS,
  robotics: ROBOTICS_FEEDS,
};

export function getFeedsForTopic(topic: Topic): readonly Feed[] {
  return FEEDS_BY_TOPIC[topic];
}
