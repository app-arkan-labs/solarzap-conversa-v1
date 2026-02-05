-- Migration: Unlock 'canal' column to allow arbitrary values (Google Ads, Facebook, etc.)
-- This fixes the issue where saving a new source fails because of database constraints.

-- 1. Drop known check constraints if they exist
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_canal_check;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_canal_fkey; -- Unlikely but checking

-- 2. Convert column to TEXT to ensure it accepts any string
-- This works even if it was previously an ENUM (Postgres will cast it)
ALTER TABLE public.leads ALTER COLUMN canal TYPE text;

-- 3. Add a default value if missing
ALTER TABLE public.leads ALTER COLUMN canal SET DEFAULT 'whatsapp';

-- 4. Comment to explain
COMMENT ON COLUMN public.leads.canal IS 'Lead source/channel (e.g. whatsapp, google_ads, indication). No longer restricted.';
