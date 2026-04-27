-- 020: crypto_prices — server-side cache for the AppHeader live ticker
-- (BTC, ETH, SOL, XRP). Single source of truth shared across all
-- visitors: every browser hits /api/crypto, which reads this table and
-- only re-fetches CoinGecko when the freshest row is > 60 s old. Result:
-- ≤ 1 CoinGecko call/minute regardless of concurrent users (CoinGecko
-- free tier allows 30 calls/min, so we stay 30× under the limit).
--
-- Schema mirrors what the CoinGecko `/simple/price` endpoint already
-- returns when called with `&include_24hr_change=true` — no transform
-- layer, no ad-hoc names. `symbol` is the lowercased CoinGecko id
-- prefix (`bitcoin` → `btc`) so the front-end can derive the display
-- ticker without an extra map.
--
-- RLS aligns with migration 012: every read/write goes through the
-- service-role Supabase client (`src/lib/supabase/client.ts`); no
-- direct access from the browser is granted. Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.crypto_prices (
  symbol      text PRIMARY KEY,
  price_usd   numeric NOT NULL,
  change_24h  numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_prices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.crypto_prices;
CREATE POLICY "Service role full access" ON public.crypto_prices
  FOR ALL USING (auth.role() = 'service_role');
