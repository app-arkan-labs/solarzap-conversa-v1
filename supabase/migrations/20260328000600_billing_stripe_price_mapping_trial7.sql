-- Vincula os planos públicos do SolarZap aos preços canônicos da Stripe.
-- O trial de 7 dias continua sendo aplicado no checkout, não no catálogo.

UPDATE public._admin_subscription_plans
SET
  stripe_price_id = CASE plan_key
    WHEN 'start' THEN 'price_1TG6uGDgShBNMYMjjyUUve5K'
    WHEN 'pro' THEN 'price_1TG6uHDgShBNMYMjDPMaqIuT'
    WHEN 'scale' THEN 'price_1TG6uIDgShBNMYMjn61HWUpn'
    ELSE stripe_price_id
  END,
  updated_at = now()
WHERE plan_key IN ('start', 'pro', 'scale');
