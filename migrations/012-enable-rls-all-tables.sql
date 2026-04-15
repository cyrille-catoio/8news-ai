-- ============================================
-- 012: Enable Row Level Security on all tables
-- Resolves Supabase security alert: rls_disabled_in_public
-- All table access goes through service_role (server-side),
-- so policies only grant access to service_role.
-- ============================================

-- topics
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.topics
  FOR ALL USING (auth.role() = 'service_role');

-- feeds
ALTER TABLE public.feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feeds FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.feeds
  FOR ALL USING (auth.role() = 'service_role');

-- articles
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.articles
  FOR ALL USING (auth.role() = 'service_role');

-- news_cache
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.news_cache
  FOR ALL USING (auth.role() = 'service_role');

-- changelog
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.changelog
  FOR ALL USING (auth.role() = 'service_role');

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.categories
  FOR ALL USING (auth.role() = 'service_role');

-- user_topic_preferences
ALTER TABLE public.user_topic_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_topic_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.user_topic_preferences
  FOR ALL USING (auth.role() = 'service_role');

-- user_favorites
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.user_favorites
  FOR ALL USING (auth.role() = 'service_role');
