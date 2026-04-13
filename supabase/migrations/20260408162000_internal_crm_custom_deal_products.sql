INSERT INTO internal_crm.products (
  product_code,
  name,
  billing_type,
  payment_method,
  is_active,
  sort_order,
  metadata
)
VALUES
  (
    'custom_deal_one_time',
    'Deal personalizado pontual',
    'one_time',
    'manual',
    true,
    900,
    jsonb_build_object('hidden_from_ui', true, 'kind', 'custom_deal')
  ),
  (
    'custom_deal_recurring',
    'Deal personalizado mensal',
    'recurring',
    'manual',
    true,
    910,
    jsonb_build_object('hidden_from_ui', true, 'kind', 'custom_deal')
  )
ON CONFLICT (product_code) DO UPDATE
SET
  name = EXCLUDED.name,
  billing_type = EXCLUDED.billing_type,
  payment_method = EXCLUDED.payment_method,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO internal_crm.product_prices (
  product_code,
  price_cents,
  currency,
  stripe_price_id,
  valid_from
)
VALUES
  ('custom_deal_one_time', 0, 'BRL', NULL, '2026-04-08T00:00:00Z'),
  ('custom_deal_recurring', 0, 'BRL', NULL, '2026-04-08T00:00:00Z')
ON CONFLICT (product_code, valid_from) DO UPDATE
SET
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = now();
