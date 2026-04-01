-- ============================================================
-- Admin Broadcast Campaigns & Recipients
-- Mirrors public.broadcast_campaigns / broadcast_recipients
-- but scoped by owner_user_id (no org_id) for the admin panel.
-- ============================================================

-- ── Campaign table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_broadcast_campaigns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid        NOT NULL REFERENCES auth.users(id),
  name            text        NOT NULL,
  messages        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  instance_name   text        NOT NULL DEFAULT '',
  interval_seconds integer    NOT NULL DEFAULT 15,
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','running','paused','completed','canceled')),
  total_recipients integer    NOT NULL DEFAULT 0,
  sent_count      integer     NOT NULL DEFAULT 0,
  failed_count    integer     NOT NULL DEFAULT 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_bc_owner   ON public.admin_broadcast_campaigns (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_bc_status  ON public.admin_broadcast_campaigns (status);

-- ── Recipient table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_broadcast_recipients (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          uuid        NOT NULL REFERENCES public.admin_broadcast_campaigns(id) ON DELETE CASCADE,
  name                 text        NOT NULL DEFAULT '',
  phone                text        NOT NULL,
  email                text,
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','sending','sent','failed','skipped')),
  error_message        text,
  sent_at              timestamptz,
  attempt_count        integer     NOT NULL DEFAULT 0,
  max_attempts         integer     NOT NULL DEFAULT 3,
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_admin_br_campaign     ON public.admin_broadcast_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_admin_br_status_next  ON public.admin_broadcast_recipients (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_admin_br_processing   ON public.admin_broadcast_recipients (processing_started_at) WHERE status = 'sending';

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_recipients_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tr_admin_br_updated_at ON public.admin_broadcast_recipients;
CREATE TRIGGER tr_admin_br_updated_at
  BEFORE UPDATE ON public.admin_broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.admin_broadcast_recipients_set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_broadcast_campaigns_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tr_admin_bc_updated_at ON public.admin_broadcast_campaigns;
CREATE TRIGGER tr_admin_bc_updated_at
  BEFORE UPDATE ON public.admin_broadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.admin_broadcast_campaigns_set_updated_at();

-- ── Refresh campaign progress ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_refresh_campaign_progress(
  p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   integer := 0;
  v_sent    integer := 0;
  v_failed  integer := 0;
  v_pending integer := 0;
  v_sending integer := 0;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'sent')::integer,
    COUNT(*) FILTER (WHERE status = 'failed')::integer,
    COUNT(*) FILTER (WHERE status = 'pending')::integer,
    COUNT(*) FILTER (WHERE status = 'sending')::integer
  INTO v_total, v_sent, v_failed, v_pending, v_sending
  FROM public.admin_broadcast_recipients
  WHERE campaign_id = p_campaign_id;

  UPDATE public.admin_broadcast_campaigns
  SET
    total_recipients = v_total,
    sent_count       = v_sent,
    failed_count     = v_failed,
    status = CASE
      WHEN status = 'running' AND v_pending = 0 AND v_sending = 0 THEN 'completed'
      ELSE status
    END,
    completed_at = CASE
      WHEN status = 'running' AND v_pending = 0 AND v_sending = 0 THEN now()
      ELSE completed_at
    END
  WHERE id = p_campaign_id;
END;
$$;

-- ── Claim recipients for worker ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_claim_recipients(
  p_limit       integer DEFAULT 20,
  p_campaign_id uuid    DEFAULT NULL
)
RETURNS TABLE(
  recipient_id      uuid,
  campaign_id       uuid,
  owner_user_id     uuid,
  instance_name     text,
  messages          jsonb,
  interval_seconds  integer,
  recipient_name    text,
  recipient_phone   text,
  recipient_email   text,
  attempt_count     integer,
  max_attempts      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT br.id
    FROM public.admin_broadcast_recipients br
    JOIN public.admin_broadcast_campaigns bc ON bc.id = br.campaign_id
    WHERE bc.status = 'running'
      AND br.status = 'pending'
      AND br.next_attempt_at <= now()
      AND br.attempt_count < br.max_attempts
      AND (p_campaign_id IS NULL OR bc.id = p_campaign_id)
    ORDER BY br.next_attempt_at ASC, br.created_at ASC
    FOR UPDATE OF br SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
  ),
  claimed AS (
    UPDATE public.admin_broadcast_recipients br
    SET
      status = 'sending',
      processing_started_at = now(),
      attempt_count = br.attempt_count + 1,
      error_message = NULL
    FROM candidates c
    WHERE br.id = c.id
    RETURNING br.*
  )
  SELECT
    c.id           AS recipient_id,
    c.campaign_id,
    bc.owner_user_id,
    bc.instance_name,
    bc.messages,
    bc.interval_seconds,
    c.name         AS recipient_name,
    c.phone        AS recipient_phone,
    c.email        AS recipient_email,
    c.attempt_count,
    c.max_attempts
  FROM claimed c
  JOIN public.admin_broadcast_campaigns bc ON bc.id = c.campaign_id;
END;
$$;

-- ── Requeue stale sending recipients ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_requeue_stale_recipients(
  p_stale_minutes integer DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_broadcast_recipients
  SET
    status = 'pending',
    processing_started_at = NULL,
    error_message = 'requeued_stale'
  WHERE status = 'sending'
    AND processing_started_at < now() - (p_stale_minutes || ' minutes')::interval;
END;
$$;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.admin_broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- Admin users (_admin_system_admins) can do everything
DROP POLICY IF EXISTS admin_bc_all ON public.admin_broadcast_campaigns;
CREATE POLICY admin_bc_all ON public.admin_broadcast_campaigns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public._admin_system_admins WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS admin_br_all ON public.admin_broadcast_recipients;
CREATE POLICY admin_br_all ON public.admin_broadcast_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.admin_broadcast_campaigns bc
      WHERE bc.id = admin_broadcast_recipients.campaign_id
        AND EXISTS (SELECT 1 FROM public._admin_system_admins WHERE user_id = auth.uid())
    )
  );

-- Grant execute on functions to authenticated role
GRANT EXECUTE ON FUNCTION public.admin_broadcast_refresh_campaign_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_claim_recipients(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_requeue_stale_recipients(integer) TO authenticated;
