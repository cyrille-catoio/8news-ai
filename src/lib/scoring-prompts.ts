import type { Topic } from "./types";

interface ScoringCriteria {
  domain: string;
  tier1: string;
  tier2: string;
  tier3: string;
  tier4: string;
  tier5: string;
}

const SCORING_CRITERIA: Record<Topic, ScoringCriteria> = {
  conflict: {
    domain: "Iran/USA/Israel conflict and Middle East geopolitics",
    tier1: "Major strike, peace treaty, new state intervention, UN resolution, casualty report >100",
    tier2: "Significant military operation, major sanctions, official leader statement with policy impact",
    tier3: "Diplomatic development, troop movement, sourced geopolitical analysis with data",
    tier4: "Commentary or opinion without new facts, recycled historical context",
    tier5: "Off-topic or no direct link to Iran/USA/Israel conflict",
  },
  ai: {
    domain: "artificial intelligence industry and research",
    tier1: "New major model (GPT-5, Gemini 3, Claude 5), benchmark record, acquisition >1B$, historic regulation",
    tier2: "Significant release, notable partnership, published research result, funding >100M$",
    tier3: "Product update, expert opinion, trend analysis with data",
    tier4: "Tutorial, promotional article, speculation without source",
    tier5: "Off-topic AI or recycled known information",
  },
  aiengineering: {
    domain: "AI engineering, MLOps, LLM infrastructure, and production AI systems",
    tier1: "Detailed large-scale technical architecture, major postmortem, transformative new tool (framework, runtime)",
    tier2: "In-depth technical guide with benchmarks, production experience report, new AI infra tool release",
    tier3: "Interesting technical article without new data, tool comparison",
    tier4: "Beginner tutorial, consumer product news, hype without technical substance",
    tier5: "Non-technical content, generic AI news without engineering angle",
  },
  robotics: {
    domain: "robotics, humanoid robots, and AI-powered physical systems",
    tier1: "New flagship robot with published specs, massive industrial deployment, major acquisition",
    tier2: "Significant technical demo, funding >50M$, industry partnership, new DOF/payload record",
    tier3: "Product update, conference coverage, demo video without new specs",
    tier4: "Speculation, popularization article without new facts",
    tier5: "Off-topic robotics",
  },
  crypto: {
    domain: "cryptocurrency, blockchain, and DeFi markets",
    tier1: "Major regulation (ETF approved/rejected, ban, law), hack >100M$, BTC ±10% in 24h",
    tier2: "Significant market movement, institutional partnership, major new DeFi protocol",
    tier3: "On-chain analysis, protocol update, notable fund movement",
    tier4: "Price prediction, opinion, shitcoin news",
    tier5: "Spam, promotional, off-topic crypto",
  },
  bitcoin: {
    domain: "Bitcoin exclusively (BTC price, ETFs, mining, Lightning, on-chain, institutional adoption)",
    tier1: "New ATH, major ETF approved, halving event, nation-state adoption",
    tier2: "Price movement >5%, significant Lightning development, major institution buying",
    tier3: "Sourced on-chain analysis, technical update (Core, Ordinals), mining news with data",
    tier4: "Price prediction without data, opinion, altcoin mentioned as main topic",
    tier5: "Off-topic BTC, altcoin article, spam",
  },
  videogames: {
    domain: "video games industry, releases, studios, and esports",
    tier1: "Major AAA announcement, highly anticipated title release, studio acquisition >1B$, Metacritic score for major game",
    tier2: "Trailer/gameplay reveal, significant sales results, notable studio closure",
    tier3: "Game update, credible sourced rumor, major esport event",
    tier4: "Unsourced rumor, 'top 10' list, promotional content",
    tier5: "Off-topic gaming, merchandise, celebrity playing",
  },
};

export function getScoringPrompt(topic: Topic): string {
  const c = SCORING_CRITERIA[topic];
  return `You are a senior news editor specialized in ${c.domain}.

Rate each article's relevance and importance from 1 to 10 (integer).

## Scoring scale for ${c.domain}:
- 9-10: ${c.tier1}
- 7-8: ${c.tier2}
- 5-6: ${c.tier3}
- 3-4: ${c.tier4}
- 1-2: ${c.tier5}

## Rules:
- Score based on the TITLE and CONTENT provided, not assumptions.
- Duplicate or rehashed news from previous cycles = max score 3.
- Clickbait or vague opinion pieces without facts = max score 4.
- Must include concrete data (names, numbers, dates) to score above 6.

Respond ONLY with a JSON object containing a "scores" array. No markdown, no explanation:
{"scores": [{"index": 0, "score": 7, "reason": "New GPT-5 model announced with benchmarks"}, ...]}`;
}
