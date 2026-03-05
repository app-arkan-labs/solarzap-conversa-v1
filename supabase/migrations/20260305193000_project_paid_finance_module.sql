-- Project paid finance module
-- Delivery 1-2-4-6 foundation: tables, constraints, rpcs, scanner, backfill, feature flag.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'lead_sale_installment_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.lead_sale_installment_status AS ENUM (
      'scheduled',
      'awaiting_confirmation',
      'paid',
      'canceled'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lead_sale_finance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  sale_value numeric(14,2) NOT NULL CHECK (sale_value >= 0),
  project_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (project_cost >= 0),
  margin_value numeric(14,2) GENERATED ALWAYS AS (sale_value - project_cost) STORED,
  margin_pct numeric(8,4) GENERATED ALWAYS AS (
    CASE WHEN sale_value > 0
      THEN ((sale_value - project_cost) / sale_value) * 100
      ELSE 0
    END
  ) STORED,
  notes text,
  first_paid_at timestamptz,
  locked_after_paid boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_sale_finance_plans_org_lead_key UNIQUE (org_id, lead_id)
);

CREATE TABLE IF NOT EXISTS public.lead_sale_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.lead_sale_finance_plans(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  installment_no integer NOT NULL CHECK (installment_no > 0),
  due_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.lead_sale_installment_status NOT NULL DEFAULT 'scheduled',
  cycle_no integer NOT NULL DEFAULT 0 CHECK (cycle_no >= 0),
  last_due_check_at timestamptz,
  paid_amount numeric(14,2),
  paid_at timestamptz,
  profit_amount numeric(14,2),
  rescheduled_from_due_on date,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_sale_installments_plan_installment_key UNIQUE (plan_id, installment_no),
  CONSTRAINT lead_sale_installments_payment_methods_array CHECK (jsonb_typeof(payment_methods) = 'array'),
  CONSTRAINT lead_sale_installments_paid_consistency CHECK (
    (
      status = 'paid'
      AND paid_at IS NOT NULL
      AND paid_amount IS NOT NULL
      AND paid_amount > 0
    )
    OR status <> 'paid'
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_sale_finance_plans_org_lead
  ON public.lead_sale_finance_plans (org_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_sale_finance_plans_org_created
  ON public.lead_sale_finance_plans (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_sale_installments_org_status_due
  ON public.lead_sale_installments (org_id, status, due_on);

CREATE INDEX IF NOT EXISTS idx_lead_sale_installments_org_due_scan
  ON public.lead_sale_installments (org_id, due_on)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_lead_sale_installments_org_paid_at
  ON public.lead_sale_installments (org_id, paid_at);

CREATE INDEX IF NOT EXISTS idx_lead_sale_installments_lead_status
  ON public.lead_sale_installments (lead_id, status);

CREATE OR REPLACE FUNCTION public.trg_validate_lead_sale_installment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan_org uuid;
  v_plan_lead bigint;
BEGIN
  SELECT p.org_id, p.lead_id
    INTO v_plan_org, v_plan_lead
  FROM public.lead_sale_finance_plans p
  WHERE p.id = NEW.plan_id;

  IF v_plan_org IS NULL THEN
    RAISE EXCEPTION 'FINANCE_PLAN_NOT_FOUND';
  END IF;

  IF NEW.org_id <> v_plan_org THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENT_ORG_MISMATCH';
  END IF;

  IF NEW.lead_id <> v_plan_lead THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENT_LEAD_MISMATCH';
  END IF;

  IF jsonb_typeof(NEW.payment_methods) <> 'array' OR jsonb_array_length(NEW.payment_methods) = 0 THEN
    RAISE EXCEPTION 'FINANCE_PAYMENT_METHOD_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_lead_sale_finance_plans_updated_at ON public.lead_sale_finance_plans;
CREATE TRIGGER tr_lead_sale_finance_plans_updated_at
BEFORE UPDATE ON public.lead_sale_finance_plans
FOR EACH ROW
EXECUTE FUNCTION public.finance_set_updated_at();

DROP TRIGGER IF EXISTS tr_lead_sale_installments_updated_at ON public.lead_sale_installments;
CREATE TRIGGER tr_lead_sale_installments_updated_at
BEFORE UPDATE ON public.lead_sale_installments
FOR EACH ROW
EXECUTE FUNCTION public.finance_set_updated_at();

DROP TRIGGER IF EXISTS tr_validate_lead_sale_installment ON public.lead_sale_installments;
CREATE TRIGGER tr_validate_lead_sale_installment
BEFORE INSERT OR UPDATE ON public.lead_sale_installments
FOR EACH ROW
EXECUTE FUNCTION public.trg_validate_lead_sale_installment();

ALTER TABLE public.lead_sale_finance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sale_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_sale_finance_plans_service_all ON public.lead_sale_finance_plans;
CREATE POLICY lead_sale_finance_plans_service_all
ON public.lead_sale_finance_plans
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS lead_sale_installments_service_all ON public.lead_sale_installments;
CREATE POLICY lead_sale_installments_service_all
ON public.lead_sale_installments
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS lead_sale_finance_plans_auth_select ON public.lead_sale_finance_plans;
CREATE POLICY lead_sale_finance_plans_auth_select
ON public.lead_sale_finance_plans
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_finance_plans_auth_insert ON public.lead_sale_finance_plans;
CREATE POLICY lead_sale_finance_plans_auth_insert
ON public.lead_sale_finance_plans
FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_finance_plans_auth_update ON public.lead_sale_finance_plans;
CREATE POLICY lead_sale_finance_plans_auth_update
ON public.lead_sale_finance_plans
FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_finance_plans_auth_delete ON public.lead_sale_finance_plans;
CREATE POLICY lead_sale_finance_plans_auth_delete
ON public.lead_sale_finance_plans
FOR DELETE TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_installments_auth_select ON public.lead_sale_installments;
CREATE POLICY lead_sale_installments_auth_select
ON public.lead_sale_installments
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_installments_auth_insert ON public.lead_sale_installments;
CREATE POLICY lead_sale_installments_auth_insert
ON public.lead_sale_installments
FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_installments_auth_update ON public.lead_sale_installments;
CREATE POLICY lead_sale_installments_auth_update
ON public.lead_sale_installments
FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS lead_sale_installments_auth_delete ON public.lead_sale_installments;
CREATE POLICY lead_sale_installments_auth_delete
ON public.lead_sale_installments
FOR DELETE TO authenticated
USING (public.user_belongs_to_org(org_id));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '_admin_feature_flags'
  ) THEN
    INSERT INTO public._admin_feature_flags (flag_key, description, default_enabled)
    VALUES ('finance_project_paid_v1', 'Enables mandatory finance modal and cash accounting on Projeto Pago', false)
    ON CONFLICT (flag_key) DO UPDATE
      SET description = EXCLUDED.description;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_feature_enabled(
  p_org_id uuid,
  p_flag_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(o.enabled, f.default_enabled, false)
  FROM public._admin_feature_flags f
  LEFT JOIN public._admin_org_feature_overrides o
    ON o.flag_key = f.flag_key
   AND o.org_id = p_org_id
  WHERE f.flag_key = p_flag_key
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_feature_enabled(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_lead_finance_plan_valid(
  p_org_id uuid,
  p_lead_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_sale_value numeric(14,2);
  v_installments_total numeric(14,2);
  v_installments_count integer;
BEGIN
  SELECT p.id, p.sale_value
    INTO v_plan_id, v_sale_value
  FROM public.lead_sale_finance_plans p
  WHERE p.org_id = p_org_id
    AND p.lead_id = p_lead_id;

  IF v_plan_id IS NULL OR v_sale_value IS NULL OR v_sale_value <= 0 THEN
    RETURN false;
  END IF;

  SELECT COALESCE(SUM(i.amount), 0), COUNT(*)
    INTO v_installments_total, v_installments_count
  FROM public.lead_sale_installments i
  WHERE i.plan_id = v_plan_id
    AND i.status <> 'canceled';

  IF v_installments_count <= 0 THEN
    RETURN false;
  END IF;

  RETURN abs(v_installments_total - v_sale_value) <= 0.01;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_lead_finance_plan_valid(uuid, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_require_finance_plan_for_projeto_pago()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_enabled boolean;
  v_valid_plan boolean;
BEGIN
  IF lower(coalesce(NEW.status_pipeline, '')) <> 'projeto_pago' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.status_pipeline, '')) = 'projeto_pago' THEN
    RETURN NEW;
  END IF;

  v_feature_enabled := public.is_org_feature_enabled(NEW.org_id, 'finance_project_paid_v1');
  IF COALESCE(v_feature_enabled, false) = false THEN
    RETURN NEW;
  END IF;

  v_valid_plan := public.is_lead_finance_plan_valid(NEW.org_id, NEW.id);
  IF NOT v_valid_plan THEN
    RAISE EXCEPTION USING
      MESSAGE = 'FINANCE_PLAN_REQUIRED',
      DETAIL = 'Lead must have a valid sale finance plan before moving to projeto_pago.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_require_finance_plan_for_projeto_pago ON public.leads;
CREATE TRIGGER tr_require_finance_plan_for_projeto_pago
BEFORE INSERT OR UPDATE OF status_pipeline ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_require_finance_plan_for_projeto_pago();

CREATE OR REPLACE FUNCTION public.rpc_upsert_lead_sale_finance_plan(
  p_org_id uuid,
  p_lead_id bigint,
  p_sale_value numeric,
  p_project_cost numeric,
  p_notes text DEFAULT NULL,
  p_installments jsonb DEFAULT '[]'::jsonb,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  plan_id uuid,
  sale_value numeric,
  project_cost numeric,
  margin_value numeric,
  margin_pct numeric,
  installments_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_existing_plan_id uuid;
  v_has_paid_installment boolean;
  v_item jsonb;
  v_idx integer := 0;
  v_installment_no integer;
  v_due_on date;
  v_amount numeric(14,2);
  v_payment_methods jsonb;
  v_notes text;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_sale_value IS NULL OR p_sale_value <= 0 THEN
    RAISE EXCEPTION 'FINANCE_SALE_VALUE_REQUIRED';
  END IF;

  IF p_project_cost IS NULL OR p_project_cost < 0 THEN
    RAISE EXCEPTION 'FINANCE_PROJECT_COST_INVALID';
  END IF;

  IF p_installments IS NULL OR jsonb_typeof(p_installments) <> 'array' THEN
    RAISE EXCEPTION 'FINANCE_INVALID_INSTALLMENTS_PAYLOAD';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _tmp_finance_installments (
    installment_no integer PRIMARY KEY,
    due_on date NOT NULL,
    amount numeric(14,2) NOT NULL,
    payment_methods jsonb NOT NULL,
    notes text
  ) ON COMMIT DROP;

  TRUNCATE _tmp_finance_installments;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_installments)
  LOOP
    v_idx := v_idx + 1;
    v_installment_no := COALESCE(NULLIF((v_item ->> 'installment_no')::integer, 0), v_idx);
    v_due_on := (v_item ->> 'due_on')::date;
    v_amount := ROUND(((v_item ->> 'amount')::numeric)::numeric, 2);
    v_payment_methods := COALESCE(v_item -> 'payment_methods', '[]'::jsonb);
    v_notes := NULLIF(trim(coalesce(v_item ->> 'notes', '')), '');

    IF v_due_on IS NULL THEN
      RAISE EXCEPTION 'FINANCE_INSTALLMENT_DUE_DATE_REQUIRED';
    END IF;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'FINANCE_INSTALLMENT_AMOUNT_INVALID';
    END IF;

    IF jsonb_typeof(v_payment_methods) <> 'array' OR jsonb_array_length(v_payment_methods) = 0 THEN
      RAISE EXCEPTION 'FINANCE_PAYMENT_METHOD_REQUIRED';
    END IF;

    INSERT INTO _tmp_finance_installments (installment_no, due_on, amount, payment_methods, notes)
    VALUES (v_installment_no, v_due_on, v_amount, v_payment_methods, v_notes)
    ON CONFLICT (installment_no) DO UPDATE
      SET due_on = EXCLUDED.due_on,
          amount = EXCLUDED.amount,
          payment_methods = EXCLUDED.payment_methods,
          notes = EXCLUDED.notes;

    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;

  IF v_count <= 0 THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENTS_REQUIRED';
  END IF;

  IF abs(v_total - p_sale_value) > 0.01 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'FINANCE_INSTALLMENTS_SUM_MISMATCH',
      DETAIL = format('Installments total (%.2f) must match sale value (%.2f).', v_total, p_sale_value);
  END IF;

  SELECT p.id
    INTO v_existing_plan_id
  FROM public.lead_sale_finance_plans p
  WHERE p.org_id = p_org_id
    AND p.lead_id = p_lead_id
  FOR UPDATE;

  IF v_existing_plan_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.lead_sale_installments i
      WHERE i.plan_id = v_existing_plan_id
        AND i.status = 'paid'
    ) INTO v_has_paid_installment;

    IF v_has_paid_installment THEN
      RAISE EXCEPTION USING
        MESSAGE = 'FINANCE_PLAN_LOCKED_AFTER_PAYMENT',
        DETAIL = 'After first paid installment, plan structure can no longer be rewritten.';
    END IF;

    UPDATE public.lead_sale_finance_plans
    SET sale_value = ROUND(p_sale_value::numeric, 2),
        project_cost = ROUND(p_project_cost::numeric, 2),
        notes = NULLIF(trim(coalesce(p_notes, '')), ''),
        updated_by = COALESCE(p_actor_user_id, auth.uid()),
        updated_at = now(),
        locked_after_paid = false
    WHERE id = v_existing_plan_id;

    v_plan_id := v_existing_plan_id;
  ELSE
    INSERT INTO public.lead_sale_finance_plans (
      org_id,
      lead_id,
      sale_value,
      project_cost,
      notes,
      created_by,
      updated_by
    )
    VALUES (
      p_org_id,
      p_lead_id,
      ROUND(p_sale_value::numeric, 2),
      ROUND(p_project_cost::numeric, 2),
      NULLIF(trim(coalesce(p_notes, '')), ''),
      COALESCE(p_actor_user_id, auth.uid()),
      COALESCE(p_actor_user_id, auth.uid())
    )
    RETURNING id INTO v_plan_id;
  END IF;

  DELETE FROM public.lead_sale_installments i
  WHERE i.plan_id = v_plan_id
    AND i.status <> 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM _tmp_finance_installments t
      WHERE t.installment_no = i.installment_no
    );

  INSERT INTO public.lead_sale_installments (
    org_id,
    plan_id,
    lead_id,
    installment_no,
    due_on,
    amount,
    payment_methods,
    status,
    cycle_no,
    last_due_check_at,
    paid_amount,
    paid_at,
    profit_amount,
    notes,
    created_by,
    updated_by
  )
  SELECT
    p_org_id,
    v_plan_id,
    p_lead_id,
    t.installment_no,
    t.due_on,
    t.amount,
    t.payment_methods,
    'scheduled',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    t.notes,
    COALESCE(p_actor_user_id, auth.uid()),
    COALESCE(p_actor_user_id, auth.uid())
  FROM _tmp_finance_installments t
  ON CONFLICT (plan_id, installment_no)
  DO UPDATE SET
    due_on = EXCLUDED.due_on,
    amount = EXCLUDED.amount,
    payment_methods = EXCLUDED.payment_methods,
    status = 'scheduled',
    cycle_no = 0,
    last_due_check_at = NULL,
    paid_amount = NULL,
    paid_at = NULL,
    profit_amount = NULL,
    rescheduled_from_due_on = NULL,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  UPDATE public.deals d
  SET amount = ROUND(p_sale_value::numeric, 2)
  WHERE d.org_id = p_org_id
    AND d.lead_id = p_lead_id;

  RETURN QUERY
  SELECT
    p.id,
    p.sale_value,
    p.project_cost,
    p.margin_value,
    p.margin_pct,
    (
      SELECT COUNT(*)::integer
      FROM public.lead_sale_installments i
      WHERE i.plan_id = p.id
    ) AS installments_count
  FROM public.lead_sale_finance_plans p
  WHERE p.id = v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_confirm_installment_paid(
  p_org_id uuid,
  p_installment_id uuid,
  p_paid_at timestamptz DEFAULT now(),
  p_paid_amount numeric DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  installment_id uuid,
  status public.lead_sale_installment_status,
  paid_at timestamptz,
  paid_amount numeric,
  profit_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_installment public.lead_sale_installments%ROWTYPE;
  v_plan public.lead_sale_finance_plans%ROWTYPE;
  v_paid_amount numeric(14,2);
  v_profit_amount numeric(14,2);
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
    INTO v_installment
  FROM public.lead_sale_installments i
  WHERE i.id = p_installment_id
    AND i.org_id = p_org_id
  FOR UPDATE;

  IF v_installment.id IS NULL THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENT_NOT_FOUND';
  END IF;

  IF v_installment.status = 'paid' THEN
    RETURN QUERY
    SELECT
      v_installment.id,
      v_installment.status,
      v_installment.paid_at,
      v_installment.paid_amount,
      v_installment.profit_amount;
    RETURN;
  END IF;

  IF v_installment.status = 'canceled' THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENT_CANCELED';
  END IF;

  SELECT *
    INTO v_plan
  FROM public.lead_sale_finance_plans p
  WHERE p.id = v_installment.plan_id
  FOR UPDATE;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'FINANCE_PLAN_NOT_FOUND';
  END IF;

  v_paid_amount := ROUND(COALESCE(p_paid_amount, v_installment.amount)::numeric, 2);
  IF v_paid_amount <= 0 THEN
    RAISE EXCEPTION 'FINANCE_PAID_AMOUNT_INVALID';
  END IF;

  IF v_plan.sale_value > 0 THEN
    v_profit_amount := ROUND(
      (v_paid_amount / v_plan.sale_value) * (v_plan.sale_value - v_plan.project_cost),
      2
    );
  ELSE
    v_profit_amount := 0;
  END IF;

  UPDATE public.lead_sale_installments i
  SET status = 'paid',
      paid_at = COALESCE(p_paid_at, now()),
      paid_amount = v_paid_amount,
      profit_amount = v_profit_amount,
      confirmed_by = COALESCE(p_actor_user_id, auth.uid()),
      notes = COALESCE(NULLIF(trim(coalesce(p_notes, '')), ''), i.notes),
      updated_by = COALESCE(p_actor_user_id, auth.uid()),
      updated_at = now()
  WHERE i.id = v_installment.id;

  UPDATE public.lead_sale_finance_plans p
  SET first_paid_at = COALESCE(p.first_paid_at, COALESCE(p_paid_at, now())),
      locked_after_paid = true,
      updated_by = COALESCE(p_actor_user_id, auth.uid()),
      updated_at = now()
  WHERE p.id = v_plan.id;

  UPDATE public.deals d
  SET status = 'won',
      closed_at = COALESCE(d.closed_at, COALESCE(p_paid_at, now())),
      amount = COALESCE(NULLIF(d.amount, 0), v_plan.sale_value)
  WHERE d.org_id = v_plan.org_id
    AND d.lead_id = v_plan.lead_id;

  RETURN QUERY
  SELECT
    i.id,
    i.status,
    i.paid_at,
    i.paid_amount,
    i.profit_amount
  FROM public.lead_sale_installments i
  WHERE i.id = v_installment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reschedule_installment(
  p_org_id uuid,
  p_installment_id uuid,
  p_new_due_on date,
  p_actor_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  installment_id uuid,
  status public.lead_sale_installment_status,
  due_on date,
  cycle_no integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_installment public.lead_sale_installments%ROWTYPE;
  v_reason text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_new_due_on IS NULL THEN
    RAISE EXCEPTION 'FINANCE_RESCHEDULE_REQUIRES_DATE';
  END IF;

  SELECT *
    INTO v_installment
  FROM public.lead_sale_installments i
  WHERE i.id = p_installment_id
    AND i.org_id = p_org_id
  FOR UPDATE;

  IF v_installment.id IS NULL THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENT_NOT_FOUND';
  END IF;

  IF v_installment.status = 'paid' THEN
    RAISE EXCEPTION 'FINANCE_INSTALLMENT_ALREADY_PAID';
  END IF;

  IF v_installment.status = 'scheduled' AND v_installment.due_on = p_new_due_on THEN
    RETURN QUERY
    SELECT
      v_installment.id,
      v_installment.status,
      v_installment.due_on,
      v_installment.cycle_no;
    RETURN;
  END IF;

  v_reason := NULLIF(trim(coalesce(p_reason, '')), '');

  UPDATE public.lead_sale_installments i
  SET status = 'scheduled',
      rescheduled_from_due_on = i.due_on,
      due_on = p_new_due_on,
      cycle_no = i.cycle_no + 1,
      last_due_check_at = NULL,
      notes = COALESCE(
        CASE
          WHEN v_reason IS NULL THEN i.notes
          WHEN i.notes IS NULL OR trim(i.notes) = '' THEN v_reason
          ELSE i.notes || E'\n' || v_reason
        END,
        i.notes
      ),
      updated_by = COALESCE(p_actor_user_id, auth.uid()),
      updated_at = now()
  WHERE i.id = v_installment.id;

  RETURN QUERY
  SELECT
    i.id,
    i.status,
    i.due_on,
    i.cycle_no
  FROM public.lead_sale_installments i
  WHERE i.id = v_installment.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_upsert_lead_sale_finance_plan(uuid, bigint, numeric, numeric, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_installment_paid(uuid, uuid, timestamptz, numeric, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reschedule_installment(uuid, uuid, date, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scan_due_installments_for_confirmation(
  p_limit integer DEFAULT 200
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    WITH candidates AS (
      SELECT i.id
      FROM public.lead_sale_installments i
      WHERE i.status = 'scheduled'
        AND i.due_on <= current_date
        AND public.is_org_feature_enabled(i.org_id, 'finance_project_paid_v1')
      ORDER BY i.due_on ASC, i.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 2000))
    )
    UPDATE public.lead_sale_installments i
    SET status = 'awaiting_confirmation',
        last_due_check_at = now(),
        updated_at = now()
    FROM candidates c
    WHERE i.id = c.id
    RETURNING i.id, i.org_id, i.plan_id, i.lead_id, i.installment_no, i.amount, i.due_on, i.cycle_no
  LOOP
    v_count := v_count + 1;

    PERFORM public.enqueue_notification_event(
      v_row.org_id,
      'installment_due_check',
      'sale_installment',
      v_row.id::text,
      jsonb_build_object(
        'installment_id', v_row.id,
        'plan_id', v_row.plan_id,
        'lead_id', v_row.lead_id,
        'installment_no', v_row.installment_no,
        'amount', v_row.amount,
        'due_on', v_row.due_on,
        'cycle_no', v_row.cycle_no
      ),
      'installment_due_check:' || v_row.id::text || ':cycle:' || v_row.cycle_no::text
    );
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_due_installments_for_confirmation(integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scan-installment-due-check') THEN
        PERFORM cron.schedule(
          'scan-installment-due-check',
          '*/15 * * * *',
          $cron$SELECT public.scan_due_installments_for_confirmation(200);$cron$
        );
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
    END;
  END IF;
END;
$$;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS evt_installment_due_check boolean NOT NULL DEFAULT true;

UPDATE public.notification_settings
SET evt_installment_due_check = true
WHERE evt_installment_due_check IS NULL;

CREATE OR REPLACE FUNCTION public.backfill_lead_sale_finance_from_won_deals(
  p_org_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _tmp_inserted_finance_plans (
    plan_id uuid,
    org_id uuid,
    lead_id bigint,
    deal_id uuid,
    sale_value numeric(14,2),
    paid_at timestamptz
  ) ON COMMIT DROP;

  TRUNCATE _tmp_inserted_finance_plans;

  WITH won_deals AS (
    SELECT
      d.id AS deal_id,
      d.org_id,
      d.lead_id,
      ROUND(GREATEST(COALESCE(NULLIF(d.amount, 0), l.valor_estimado, 0), 0)::numeric, 2) AS sale_value,
      COALESCE(d.closed_at, d.created_at, l.created_at, now()) AS paid_at
    FROM public.deals d
    JOIN public.leads l
      ON l.id = d.lead_id
     AND l.org_id = d.org_id
    WHERE d.status = 'won'
      AND (p_org_id IS NULL OR d.org_id = p_org_id)
    ORDER BY d.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 200000))
  ),
  inserted AS (
    INSERT INTO public.lead_sale_finance_plans (
      org_id,
      lead_id,
      deal_id,
      sale_value,
      project_cost,
      notes,
      first_paid_at,
      locked_after_paid,
      created_at,
      updated_at
    )
    SELECT
      w.org_id,
      w.lead_id,
      w.deal_id,
      w.sale_value,
      0,
      'legacy_backfill',
      w.paid_at,
      true,
      now(),
      now()
    FROM won_deals w
    WHERE w.sale_value > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.lead_sale_finance_plans p
        WHERE p.org_id = w.org_id
          AND p.lead_id = w.lead_id
      )
    RETURNING id, org_id, lead_id, deal_id, sale_value
  )
  INSERT INTO _tmp_inserted_finance_plans (plan_id, org_id, lead_id, deal_id, sale_value, paid_at)
  SELECT i.id, i.org_id, i.lead_id, i.deal_id, i.sale_value, w.paid_at
  FROM inserted i
  JOIN won_deals w
    ON w.deal_id = i.deal_id;

  SELECT COUNT(*) INTO v_inserted
  FROM _tmp_inserted_finance_plans;

  INSERT INTO public.lead_sale_installments (
    org_id,
    plan_id,
    lead_id,
    installment_no,
    due_on,
    amount,
    payment_methods,
    status,
    cycle_no,
    paid_amount,
    paid_at,
    profit_amount,
    notes,
    created_at,
    updated_at
  )
  SELECT
    t.org_id,
    t.plan_id,
    t.lead_id,
    1,
    COALESCE(t.paid_at::date, current_date),
    t.sale_value,
    '["legacy_backfill"]'::jsonb,
    'paid',
    0,
    t.sale_value,
    t.paid_at,
    t.sale_value,
    'legacy_backfill',
    now(),
    now()
  FROM _tmp_inserted_finance_plans t;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_lead_sale_finance_from_won_deals(uuid, integer) TO service_role;

SELECT public.backfill_lead_sale_finance_from_won_deals(NULL, 200000);
