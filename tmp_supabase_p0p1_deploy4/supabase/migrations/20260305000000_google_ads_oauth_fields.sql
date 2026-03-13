-- Adiciona campos para OAuth do Google Ads
ALTER TABLE ad_platform_credentials
  ADD COLUMN IF NOT EXISTS google_ads_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_ads_account_email text;
