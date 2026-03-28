CREATE OR REPLACE FUNCTION internal_crm.current_user_crm_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, internal_crm
AS $$
  SELECT COALESCE(
    (
      SELECT crm_role
      FROM public._admin_system_admins
      WHERE user_id = auth.uid()
      LIMIT 1
    ),
    'none'
  );
$$;

CREATE OR REPLACE FUNCTION internal_crm.current_user_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, internal_crm
AS $$
  SELECT internal_crm.current_user_crm_role() IN ('owner', 'sales', 'cs', 'ops');
$$;

CREATE OR REPLACE FUNCTION internal_crm.current_user_can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, internal_crm
AS $$
  SELECT internal_crm.current_user_crm_role() IN ('owner', 'finance');
$$;

ALTER TABLE internal_crm.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.deal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.customer_app_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_products_service_all ON internal_crm.products;
CREATE POLICY internal_crm_products_service_all
  ON internal_crm.products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_products_auth_read ON internal_crm.products;
CREATE POLICY internal_crm_products_auth_read
  ON internal_crm.products
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_products_auth_write ON internal_crm.products;
CREATE POLICY internal_crm_products_auth_write
  ON internal_crm.products
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_product_prices_service_all ON internal_crm.product_prices;
CREATE POLICY internal_crm_product_prices_service_all
  ON internal_crm.product_prices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_product_prices_auth_read ON internal_crm.product_prices;
CREATE POLICY internal_crm_product_prices_auth_read
  ON internal_crm.product_prices
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_product_prices_auth_write ON internal_crm.product_prices;
CREATE POLICY internal_crm_product_prices_auth_write
  ON internal_crm.product_prices
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_manage_finance())
  WITH CHECK (internal_crm.current_user_can_manage_finance());

DROP POLICY IF EXISTS internal_crm_pipeline_stages_service_all ON internal_crm.pipeline_stages;
CREATE POLICY internal_crm_pipeline_stages_service_all
  ON internal_crm.pipeline_stages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_pipeline_stages_auth_read ON internal_crm.pipeline_stages;
CREATE POLICY internal_crm_pipeline_stages_auth_read
  ON internal_crm.pipeline_stages
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_pipeline_stages_auth_write ON internal_crm.pipeline_stages;
CREATE POLICY internal_crm_pipeline_stages_auth_write
  ON internal_crm.pipeline_stages
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_clients_service_all ON internal_crm.clients;
CREATE POLICY internal_crm_clients_service_all
  ON internal_crm.clients
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_clients_auth_read ON internal_crm.clients;
CREATE POLICY internal_crm_clients_auth_read
  ON internal_crm.clients
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_clients_auth_write ON internal_crm.clients;
CREATE POLICY internal_crm_clients_auth_write
  ON internal_crm.clients
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_client_contacts_service_all ON internal_crm.client_contacts;
CREATE POLICY internal_crm_client_contacts_service_all
  ON internal_crm.client_contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_client_contacts_auth_read ON internal_crm.client_contacts;
CREATE POLICY internal_crm_client_contacts_auth_read
  ON internal_crm.client_contacts
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_client_contacts_auth_write ON internal_crm.client_contacts;
CREATE POLICY internal_crm_client_contacts_auth_write
  ON internal_crm.client_contacts
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_deals_service_all ON internal_crm.deals;
CREATE POLICY internal_crm_deals_service_all
  ON internal_crm.deals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_deals_auth_read ON internal_crm.deals;
CREATE POLICY internal_crm_deals_auth_read
  ON internal_crm.deals
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_deals_auth_write ON internal_crm.deals;
CREATE POLICY internal_crm_deals_auth_write
  ON internal_crm.deals
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_deal_items_service_all ON internal_crm.deal_items;
CREATE POLICY internal_crm_deal_items_service_all
  ON internal_crm.deal_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_deal_items_auth_read ON internal_crm.deal_items;
CREATE POLICY internal_crm_deal_items_auth_read
  ON internal_crm.deal_items
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_deal_items_auth_write ON internal_crm.deal_items;
CREATE POLICY internal_crm_deal_items_auth_write
  ON internal_crm.deal_items
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_tasks_service_all ON internal_crm.tasks;
CREATE POLICY internal_crm_tasks_service_all
  ON internal_crm.tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_tasks_auth_read ON internal_crm.tasks;
CREATE POLICY internal_crm_tasks_auth_read
  ON internal_crm.tasks
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_tasks_auth_write ON internal_crm.tasks;
CREATE POLICY internal_crm_tasks_auth_write
  ON internal_crm.tasks
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_appointments_service_all ON internal_crm.appointments;
CREATE POLICY internal_crm_appointments_service_all
  ON internal_crm.appointments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_appointments_auth_read ON internal_crm.appointments;
CREATE POLICY internal_crm_appointments_auth_read
  ON internal_crm.appointments
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_appointments_auth_write ON internal_crm.appointments;
CREATE POLICY internal_crm_appointments_auth_write
  ON internal_crm.appointments
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_stage_history_service_all ON internal_crm.stage_history;
CREATE POLICY internal_crm_stage_history_service_all
  ON internal_crm.stage_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_stage_history_auth_read ON internal_crm.stage_history;
CREATE POLICY internal_crm_stage_history_auth_read
  ON internal_crm.stage_history
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_stage_history_auth_write ON internal_crm.stage_history;
CREATE POLICY internal_crm_stage_history_auth_write
  ON internal_crm.stage_history
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_customer_app_links_service_all ON internal_crm.customer_app_links;
CREATE POLICY internal_crm_customer_app_links_service_all
  ON internal_crm.customer_app_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_customer_app_links_auth_read ON internal_crm.customer_app_links;
CREATE POLICY internal_crm_customer_app_links_auth_read
  ON internal_crm.customer_app_links
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_customer_app_links_auth_write ON internal_crm.customer_app_links;
CREATE POLICY internal_crm_customer_app_links_auth_write
  ON internal_crm.customer_app_links
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_audit_log_service_all ON internal_crm.audit_log;
CREATE POLICY internal_crm_audit_log_service_all
  ON internal_crm.audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_audit_log_auth_read ON internal_crm.audit_log;
CREATE POLICY internal_crm_audit_log_auth_read
  ON internal_crm.audit_log
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

INSERT INTO storage.buckets (id, name, public)
VALUES ('internal-crm-media', 'internal-crm-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "internal_crm_media_service_all" ON storage.objects;
CREATE POLICY "internal_crm_media_service_all"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'internal-crm-media')
WITH CHECK (bucket_id = 'internal-crm-media');

DROP POLICY IF EXISTS "internal_crm_media_auth_read" ON storage.objects;
CREATE POLICY "internal_crm_media_auth_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'internal-crm-media'
  AND internal_crm.current_user_crm_role() <> 'none'
);

DROP POLICY IF EXISTS "internal_crm_media_auth_insert" ON storage.objects;
CREATE POLICY "internal_crm_media_auth_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-crm-media'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_media_auth_update" ON storage.objects;
CREATE POLICY "internal_crm_media_auth_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'internal-crm-media'
  AND internal_crm.current_user_can_write()
)
WITH CHECK (
  bucket_id = 'internal-crm-media'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_media_auth_delete" ON storage.objects;
CREATE POLICY "internal_crm_media_auth_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'internal-crm-media'
  AND internal_crm.current_user_can_write()
);
