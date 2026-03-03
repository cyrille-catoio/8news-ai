import type { Topic } from "./types";

export interface Feed {
  name: string;
  url: string;
}

const CONFLICT_FEEDS: readonly Feed[] = [
  { name: "BBC News",        url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "CNN",             url: "https://rss.cnn.com/rss/cnn_topstories.rss" },
  { name: "Al Jazeera",      url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian",    url: "https://www.theguardian.com/world/rss" },
  { name: "France 24",       url: "https://www.france24.com/en/rss" },
  { name: "DW",              url: "https://rss.dw.com/xml/rss-en-world" },
  { name: "NYT World",       url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "Washington Post", url: "https://feeds.washingtonpost.com/rss/world" },
  { name: "NPR News",        url: "https://feeds.npr.org/1001/rss.xml" },
  { name: "ABC News",        url: "https://abcnews.go.com/abcnews/internationalheadlines" },
];

const AI_FEEDS: readonly Feed[] = [
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
];

const CRYPTO_FEEDS: readonly Feed[] = [
  { name: "CoinDesk",          url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph",     url: "https://cointelegraph.com/rss" },
  { name: "The Block",         url: "https://www.theblock.co/rss.xml" },
  { name: "Decrypt",           url: "https://decrypt.co/feed" },
  { name: "Bitcoin Magazine",  url: "https://bitcoinmagazine.com/feed" },
  { name: "CryptoSlate",       url: "https://cryptoslate.com/feed/" },
  { name: "NewsBTC",           url: "https://www.newsbtc.com/feed/" },
  { name: "U.Today",           url: "https://u.today/rss" },
  { name: "Bitcoinist",        url: "https://bitcoinist.com/feed/" },
  { name: "The Daily Hodl",    url: "https://dailyhodl.com/feed/" },
];

const ROBOTICS_FEEDS: readonly Feed[] = [
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
