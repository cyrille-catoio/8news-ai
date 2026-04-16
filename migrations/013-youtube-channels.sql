-- 013: YouTube channels for video monitoring
CREATE TABLE IF NOT EXISTS public.youtube_channels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id text NOT NULL UNIQUE,
  handle text,
  title text NOT NULL,
  thumbnail_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- topic_id: optional link to a topic (nullable)
ALTER TABLE public.youtube_channels
  ADD COLUMN IF NOT EXISTS topic_id text REFERENCES topics(id) ON DELETE SET NULL;

ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_channels FORCE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.youtube_channels
  FOR ALL USING (auth.role() = 'service_role');
