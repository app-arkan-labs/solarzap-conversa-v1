CREATE TABLE IF NOT EXISTS internal_crm.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  order_number text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'canceled', 'refunded')
  ),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  payment_method text NOT NULL DEFAULT 'manual' CHECK (
    payment_method IN ('stripe', 'manual', 'hybrid')
  ),
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  product_code text REFERENCES internal_crm.products(product_code),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'trialing', 'active', 'past_due', 'canceled', 'ended')
  ),
  mrr_cents integer NOT NULL DEFAULT 0 CHECK (mrr_cents >= 0),
  billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
  promise_started_at timestamptz,
  current_period_end timestamptz,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES internal_crm.orders(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES internal_crm.subscriptions(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'stripe')),
  provider_event_id text,
  event_type text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'recorded',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_payment_events_provider_event
  ON internal_crm.payment_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS internal_crm.customer_app_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  plan_key text,
  subscription_status text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  current_period_end timestamptz,
  member_count integer NOT NULL DEFAULT 0,
  whatsapp_instance_count integer NOT NULL DEFAULT 0,
  lead_count integer NOT NULL DEFAULT 0,
  proposal_count integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_crm.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.customer_app_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_orders_service_all ON internal_crm.orders;
CREATE POLICY internal_crm_orders_service_all
  ON internal_crm.orders
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_orders_auth_read ON internal_crm.orders;
CREATE POLICY internal_crm_orders_auth_read
  ON internal_crm.orders
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_orders_auth_write ON internal_crm.orders;
CREATE POLICY internal_crm_orders_auth_write
  ON internal_crm.orders
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_manage_finance())
  WITH CHECK (internal_crm.current_user_can_manage_finance());

DROP POLICY IF EXISTS internal_crm_subscriptions_service_all ON internal_crm.subscriptions;
CREATE POLICY internal_crm_subscriptions_service_all
  ON internal_crm.subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_subscriptions_auth_read ON internal_crm.subscriptions;
CREATE POLICY internal_crm_subscriptions_auth_read
  ON internal_crm.subscriptions
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_subscriptions_auth_write ON internal_crm.subscriptions;
CREATE POLICY internal_crm_subscriptions_auth_write
  ON internal_crm.subscriptions
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_manage_finance())
  WITH CHECK (internal_crm.current_user_can_manage_finance());

DROP POLICY IF EXISTS internal_crm_payment_events_service_all ON internal_crm.payment_events;
CREATE POLICY internal_crm_payment_events_service_all
  ON internal_crm.payment_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_payment_events_auth_read ON internal_crm.payment_events;
CREATE POLICY internal_crm_payment_events_auth_read
  ON internal_crm.payment_events
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_payment_events_auth_write ON internal_crm.payment_events;
CREATE POLICY internal_crm_payment_events_auth_write
  ON internal_crm.payment_events
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_manage_finance())
  WITH CHECK (internal_crm.current_user_can_manage_finance());

DROP POLICY IF EXISTS internal_crm_customer_app_snapshot_service_all ON internal_crm.customer_app_snapshot;
CREATE POLICY internal_crm_customer_app_snapshot_service_all
  ON internal_crm.customer_app_snapshot
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_customer_app_snapshot_auth_read ON internal_crm.customer_app_snapshot;
CREATE POLICY internal_crm_customer_app_snapshot_auth_read
  ON internal_crm.customer_app_snapshot
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_customer_app_snapshot_auth_write ON internal_crm.customer_app_snapshot;
CREATE POLICY internal_crm_customer_app_snapshot_auth_write
  ON internal_crm.customer_app_snapshot
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_manage_finance())
  WITH CHECK (internal_crm.current_user_can_manage_finance());

DROP TRIGGER IF EXISTS trg_internal_crm_orders_updated_at ON internal_crm.orders;
CREATE TRIGGER trg_internal_crm_orders_updated_at
  BEFORE UPDATE ON internal_crm.orders
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_subscriptions_updated_at ON internal_crm.subscriptions;
CREATE TRIGGER trg_internal_crm_subscriptions_updated_at
  BEFORE UPDATE ON internal_crm.subscriptions
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_customer_app_snapshot_updated_at ON internal_crm.customer_app_snapshot;
CREATE TRIGGER trg_internal_crm_customer_app_snapshot_updated_at
  BEFORE UPDATE ON internal_crm.customer_app_snapshot
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();
