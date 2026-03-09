-- Add 'unlimited' plan for service clients managed via admin panel.
-- Orgs on this plan bypass all billing gates (all limits = -1, all features = true).

INSERT INTO public._admin_subscription_plans (
  plan_key,
  display_name,
  price_cents,
  billing_cycle,
  stripe_price_id,
  limits,
  features,
  sort_order,
  is_active
)
VALUES (
  'unlimited',
  'Ilimitado (Serviço)',
  0,
  'monthly',
  NULL,
  '{
    "max_leads": -1,
    "max_whatsapp_instances": -1,
    "monthly_broadcast_credits": -1,
    "max_campaigns_month": -1,
    "max_proposals_month": -1,
    "max_members": -1,
    "max_proposal_themes": -1,
    "max_automations_month": -1,
    "included_ai_requests_month": -1
  }'::jsonb,
  '{
    "ai_enabled": true,
    "google_integration_enabled": true,
    "appointments_enabled": true,
    "advanced_reports_enabled": true,
    "advanced_tracking_enabled": true
  }'::jsonb,
  99,
  true
)
ON CONFLICT (plan_key)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
