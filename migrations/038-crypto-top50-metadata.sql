-- 038: crypto_prices — metadata for the customizable top-50 AppHeader ticker
--
-- Run manually in Supabase SQL Editor before deploying the matching code.
-- The API now reads CoinGecko's top 50 by market cap and needs stable
-- metadata in the DB fallback path, not just price rows.

ALTER TABLE public.crypto_prices
  ADD COLUMN IF NOT EXISTS coin_id text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS market_cap_rank integer;

UPDATE public.crypto_prices
SET coin_id = CASE symbol
    WHEN 'btc' THEN 'bitcoin'
    WHEN 'eth' THEN 'ethereum'
    WHEN 'sol' THEN 'solana'
    WHEN 'xrp' THEN 'ripple'
    WHEN 'tao' THEN 'bittensor'
    WHEN 'sui' THEN 'sui'
    ELSE coin_id
  END,
  name = CASE symbol
    WHEN 'btc' THEN 'Bitcoin'
    WHEN 'eth' THEN 'Ethereum'
    WHEN 'sol' THEN 'Solana'
    WHEN 'xrp' THEN 'XRP'
    WHEN 'tao' THEN 'Bittensor'
    WHEN 'sui' THEN 'Sui'
    ELSE name
  END
WHERE coin_id IS NULL OR name IS NULL;

CREATE INDEX IF NOT EXISTS crypto_prices_market_cap_rank_idx
  ON public.crypto_prices (market_cap_rank);
