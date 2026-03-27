-- Feeds for topic 'anthropic' — 20 validated RSS sources
-- Run after 003-topic-anthropic.sql

INSERT INTO feeds (topic_id, name, url) VALUES
  ('anthropic', 'Google News Anthropic', 'https://news.google.com/rss/search?q=Anthropic+Claude&hl=en'),
  ('anthropic', 'Hacker News Claude',    'https://hnrss.org/newest?q=Anthropic+OR+Claude+AI'),
  ('anthropic', 'TechCrunch AI',         'https://techcrunch.com/category/artificial-intelligence/feed/'),
  ('anthropic', 'The Verge AI',          'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'),
  ('anthropic', 'Ars Technica',          'https://feeds.arstechnica.com/arstechnica/technology-lab'),
  ('anthropic', 'VentureBeat AI',        'https://venturebeat.com/category/ai/feed/'),
  ('anthropic', 'Wired AI',              'https://www.wired.com/feed/tag/ai/latest/rss'),
  ('anthropic', 'ZDNET AI',              'https://www.zdnet.com/topic/artificial-intelligence/rss.xml'),
  ('anthropic', 'The Decoder',           'https://the-decoder.com/feed/'),
  ('anthropic', 'Marktechpost',          'https://www.marktechpost.com/feed/'),
  ('anthropic', 'AI News',               'https://www.artificialintelligence-news.com/feed/'),
  ('anthropic', 'Simon Willison',        'https://simonwillison.net/atom/everything/'),
  ('anthropic', 'MIT Tech Review',       'https://www.technologyreview.com/feed/'),
  ('anthropic', 'The Register AI',       'https://www.theregister.com/software/ai_ml/headlines.atom'),
  ('anthropic', 'Last Week in AI',       'https://lastweekin.ai/feed'),
  ('anthropic', 'Latent Space',          'https://www.latent.space/feed'),
  ('anthropic', 'InfoQ AI',              'https://feed.infoq.com/ai-ml-data-eng/'),
  ('anthropic', 'Forbes Innovation',     'https://www.forbes.com/innovation/feed/'),
  ('anthropic', 'The Information',       'https://www.theinformation.com/feed'),
  ('anthropic', 'Towards Data Sci.',     'https://towardsdatascience.com/feed')
ON CONFLICT (topic_id, url) DO NOTHING;
