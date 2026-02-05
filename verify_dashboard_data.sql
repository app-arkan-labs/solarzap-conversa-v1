-- Helper SQL to verify Dashboard logic
-- Run this in Supabase SQL Editor to check data state or insert dummy data

-- 1. Check if 'deals' table exists
SELECT count(*) FROM information_schema.tables WHERE table_name = 'deals';

-- 2. Check if 'lead_stage_history' exists
SELECT count(*) FROM information_schema.tables WHERE table_name = 'lead_stage_history';

-- 3. Insert Dummy Deal (if needed for testing)
-- Replace 'USER_ID_HERE' with your Auth User ID (from auth.users)
/*
INSERT INTO deals (user_id, lead_id, title, amount, status, closed_at)
SELECT 
    auth.uid(), -- or a specific UUID
    (SELECT id FROM leads LIMIT 1),
    'Teste Deal 5kW',
    15000,
    'won',
    now()
WHERE EXISTS (SELECT 1 FROM leads);
*/

-- 4. Check Metrics Queries
-- KPIs
SELECT count(*) as total_leads FROM leads;
SELECT count(*) as won_deals, sum(amount) as revenue FROM deals WHERE status = 'won';

-- Source
SELECT source, count(*) FROM leads GROUP BY source;

-- Funnel
SELECT status_pipeline, count(*) FROM leads GROUP BY status_pipeline;

-- Stale Leads
SELECT id, nome, status_pipeline, stage_changed_at 
FROM leads 
WHERE stage_changed_at < now() - interval '7 days'
LIMIT 5;

