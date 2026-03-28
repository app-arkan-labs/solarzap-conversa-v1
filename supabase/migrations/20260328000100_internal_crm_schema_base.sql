CREATE SCHEMA IF NOT EXISTS internal_crm;

GRANT USAGE ON SCHEMA internal_crm TO authenticated;
GRANT USAGE ON SCHEMA internal_crm TO service_role;

CREATE OR REPLACE FUNCTION internal_crm.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS internal_crm.products (
  product_code text PRIMARY KEY,
  name text NOT NULL,
  billing_type text NOT NULL CHECK (billing_type IN ('one_time', 'recurring')),
  payment_method text NOT NULL CHECK (payment_method IN ('stripe', 'manual', 'hybrid')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL REFERENCES internal_crm.products(product_code) ON DELETE CASCADE,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  stripe_price_id text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_crm_product_prices_valid_range CHECK (
    valid_until IS NULL OR valid_until > valid_from
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_product_prices_unique_range
  ON internal_crm.product_prices (product_code, valid_from);

CREATE TABLE IF NOT EXISTS internal_crm.pipeline_stages (
  stage_code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_terminal boolean NOT NULL DEFAULT false,
  win_probability integer NOT NULL DEFAULT 0 CHECK (win_probability BETWEEN 0 AND 100),
  color_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  primary_contact_name text,
  primary_phone text,
  primary_email text,
  source_channel text,
  owner_user_id uuid,
  current_stage_code text REFERENCES internal_crm.pipeline_stages(stage_code),
  lifecycle_status text NOT NULL DEFAULT 'lead' CHECK (
    lifecycle_status IN ('lead', 'customer_onboarding', 'active_customer', 'churn_risk', 'churned')
  ),
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  notes text,
  linked_public_org_id uuid,
  linked_public_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_clients_owner_stage_updated
  ON internal_crm.clients (owner_user_id, current_stage_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_clients_org_link
  ON internal_crm.clients (linked_public_org_id);

CREATE TABLE IF NOT EXISTS internal_crm.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  role_label text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_client_contacts_primary
  ON internal_crm.client_contacts (client_id)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS internal_crm.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_user_id uuid,
  stage_code text REFERENCES internal_crm.pipeline_stages(stage_code),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  expected_close_at timestamptz,
  one_time_total_cents integer NOT NULL DEFAULT 0 CHECK (one_time_total_cents >= 0),
  mrr_cents integer NOT NULL DEFAULT 0 CHECK (mrr_cents >= 0),
  payment_method text NOT NULL DEFAULT 'manual' CHECK (payment_method IN ('stripe', 'manual', 'hybrid')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'paid', 'failed', 'canceled', 'manual_review')
  ),
  notes text,
  lost_reason text,
  checkout_url text,
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  paid_at timestamptz,
  won_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_deals_owner_stage_status_close
  ON internal_crm.deals (owner_user_id, stage_code, status, expected_close_at);

CREATE INDEX IF NOT EXISTS idx_internal_crm_deals_client
  ON internal_crm.deals (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS internal_crm.deal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES internal_crm.deals(id) ON DELETE CASCADE,
  product_code text NOT NULL REFERENCES internal_crm.products(product_code),
  billing_type text NOT NULL CHECK (billing_type IN ('one_time', 'recurring')),
  payment_method text NOT NULL CHECK (payment_method IN ('stripe', 'manual', 'hybrid')),
  stripe_price_id text,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price_cents integer NOT NULL CHECK (total_price_cents >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  owner_user_id uuid,
  title text NOT NULL,
  notes text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'canceled')),
  task_kind text NOT NULL DEFAULT 'generic' CHECK (
    task_kind IN ('generic', 'next_action', 'follow_up', 'onboarding', 'campaign', 'finance', 'system')
  ),
  completed_at timestamptz,
  completed_by_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_tasks_owner_due_status
  ON internal_crm.tasks (owner_user_id, due_at, status);

CREATE INDEX IF NOT EXISTS idx_internal_crm_tasks_client
  ON internal_crm.tasks (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS internal_crm.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  owner_user_id uuid,
  title text NOT NULL,
  appointment_type text NOT NULL DEFAULT 'meeting' CHECK (
    appointment_type IN ('call', 'demo', 'meeting', 'visit', 'other')
  ),
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'confirmed', 'done', 'canceled', 'no_show')
  ),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  location text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE CASCADE,
  from_stage_code text,
  to_stage_code text NOT NULL,
  changed_by_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_stage_history_deal
  ON internal_crm.stage_history (deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_stage_history_client
  ON internal_crm.stage_history (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS internal_crm.customer_app_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  linked_public_org_id uuid,
  linked_public_owner_user_id uuid,
  provisioned_at timestamptz,
  provisioning_status text NOT NULL DEFAULT 'pending' CHECK (
    provisioning_status IN ('pending', 'provisioned', 'failed')
  ),
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_customer_app_links_org
  ON internal_crm.customer_app_links (linked_public_org_id);

CREATE TABLE IF NOT EXISTS internal_crm.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_system_role text,
  actor_crm_role text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  client_id uuid,
  deal_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_audit_ts
  ON internal_crm.audit_log (ts DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_audit_actor
  ON internal_crm.audit_log (actor_user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_audit_target
  ON internal_crm.audit_log (target_type, target_id, ts DESC);

CREATE OR REPLACE FUNCTION internal_crm.deal_items_set_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.total_price_cents = COALESCE(NEW.unit_price_cents, 0) * COALESCE(NEW.quantity, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.recalculate_deal_totals(p_deal_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_one_time integer := 0;
  v_mrr integer := 0;
  v_payment_methods text[];
  v_resolved_payment_method text := 'manual';
BEGIN
  SELECT
    COALESCE(sum(CASE WHEN billing_type = 'one_time' THEN total_price_cents ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN billing_type = 'recurring' THEN total_price_cents ELSE 0 END), 0),
    COALESCE(array_agg(DISTINCT payment_method), ARRAY['manual']::text[])
  INTO v_one_time, v_mrr, v_payment_methods
  FROM internal_crm.deal_items
  WHERE deal_id = p_deal_id;

  IF array_length(v_payment_methods, 1) > 1 THEN
    v_resolved_payment_method = 'hybrid';
  ELSIF array_length(v_payment_methods, 1) = 1 THEN
    v_resolved_payment_method = v_payment_methods[1];
  END IF;

  UPDATE internal_crm.deals
  SET
    one_time_total_cents = v_one_time,
    mrr_cents = v_mrr,
    payment_method = COALESCE(v_resolved_payment_method, 'manual'),
    updated_at = now()
  WHERE id = p_deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.deal_items_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_id uuid;
BEGIN
  v_deal_id = COALESCE(NEW.deal_id, OLD.deal_id);
  PERFORM internal_crm.recalculate_deal_totals(v_deal_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'internal_crm.audit_log is append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_internal_crm_products_updated_at ON internal_crm.products;
CREATE TRIGGER trg_internal_crm_products_updated_at
  BEFORE UPDATE ON internal_crm.products
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_product_prices_updated_at ON internal_crm.product_prices;
CREATE TRIGGER trg_internal_crm_product_prices_updated_at
  BEFORE UPDATE ON internal_crm.product_prices
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_pipeline_stages_updated_at ON internal_crm.pipeline_stages;
CREATE TRIGGER trg_internal_crm_pipeline_stages_updated_at
  BEFORE UPDATE ON internal_crm.pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_clients_updated_at ON internal_crm.clients;
CREATE TRIGGER trg_internal_crm_clients_updated_at
  BEFORE UPDATE ON internal_crm.clients
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_client_contacts_updated_at ON internal_crm.client_contacts;
CREATE TRIGGER trg_internal_crm_client_contacts_updated_at
  BEFORE UPDATE ON internal_crm.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_deals_updated_at ON internal_crm.deals;
CREATE TRIGGER trg_internal_crm_deals_updated_at
  BEFORE UPDATE ON internal_crm.deals
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_deal_items_set_totals ON internal_crm.deal_items;
CREATE TRIGGER trg_internal_crm_deal_items_set_totals
  BEFORE INSERT OR UPDATE ON internal_crm.deal_items
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.deal_items_set_totals();

DROP TRIGGER IF EXISTS trg_internal_crm_deal_items_recalculate ON internal_crm.deal_items;
CREATE TRIGGER trg_internal_crm_deal_items_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON internal_crm.deal_items
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.deal_items_after_change();

DROP TRIGGER IF EXISTS trg_internal_crm_tasks_updated_at ON internal_crm.tasks;
CREATE TRIGGER trg_internal_crm_tasks_updated_at
  BEFORE UPDATE ON internal_crm.tasks
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_appointments_updated_at ON internal_crm.appointments;
CREATE TRIGGER trg_internal_crm_appointments_updated_at
  BEFORE UPDATE ON internal_crm.appointments
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_customer_app_links_updated_at ON internal_crm.customer_app_links;
CREATE TRIGGER trg_internal_crm_customer_app_links_updated_at
  BEFORE UPDATE ON internal_crm.customer_app_links
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_audit_log_immutable ON internal_crm.audit_log;
CREATE TRIGGER trg_internal_crm_audit_log_immutable
  BEFORE UPDATE OR DELETE ON internal_crm.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.audit_log_immutable();
