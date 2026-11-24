-- New Supabase projects require explicit grants in addition to row policies.
GRANT SELECT ON public.organizations, public.organization_members, public.user_integrations,
  public.ai_agent_runs, public.ai_digest_runs, public.ai_summaries,
  public.notification_events, public.notification_dispatch_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads, public.interacoes,
  public.whatsapp_instances, public.comentarios_leads, public.appointments, public.appointment_settings,
  public.appointment_reminders, public.lead_tasks, public.lead_stage_history, public.deals,
  public.company_profile, public.kb_items, public.kb_assets, public.testimonials, public.objection_responses,
  public.propostas, public.proposal_versions, public.proposal_sections, public.proposal_delivery_events,
  public.contract_drafts, public.contract_artifacts, public.broadcast_campaigns, public.broadcast_recipients,
  public.admin_broadcast_campaigns, public.admin_broadcast_recipients, public.ad_platform_credentials,
  public.ad_trigger_messages, public.scheduled_agent_jobs, public.org_tracking_settings,
  public.lead_attribution, public.conversion_deliveries, public.lead_sale_finance_plans,
  public.lead_sale_installments TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.ai_settings, public.ai_stage_config,
  public.automation_settings, public.notification_settings, public.org_seller_permissions,
  public.onboarding_progress, public.motivos_perda, public.perdas_leads TO authenticated;

GRANT SELECT, INSERT ON public.qr_scan_events, public.contract_events TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

CREATE POLICY solarzap_organizations_member_read ON public.organizations
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(id));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    '_m3_function_backup', '_m4_function_backup', '_rls_policy_backup', '_rls_policy_backup_m4',
    'billing_alerts', 'kb_approval_logs', 'notification_runtime_alerts', 'org_billing_timeline',
    'solar_resource_cache', 'stripe_customers', 'whatsapp_webhook_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END;
$$;

REVOKE ALL ON public._admin_orgs_summary, public.notification_runtime_health_latest
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT * FROM (VALUES
      ('public', 'leads'), ('public', 'interacoes'), ('public', 'appointments'),
      ('public', 'lead_tasks'), ('public', 'whatsapp_instances'), ('public', 'org_seller_permissions'),
      ('internal_crm', 'deals'), ('internal_crm', 'deal_items'), ('internal_crm', 'clients'),
      ('internal_crm', 'client_contacts'), ('internal_crm', 'client_notes'), ('internal_crm', 'tasks'),
      ('internal_crm', 'appointments'), ('internal_crm', 'conversations'), ('internal_crm', 'messages'),
      ('internal_crm', 'pipeline_stages'), ('internal_crm', 'broadcast_campaigns'),
      ('internal_crm', 'broadcast_recipients'), ('internal_crm', 'automation_rules'),
      ('internal_crm', 'automation_runs'), ('internal_crm', 'whatsapp_instances'),
      ('internal_crm', 'customer_app_links')
    ) AS wanted(schema_name, table_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables AS published
      WHERE published.pubname = 'supabase_realtime'
        AND published.schemaname = relation.schema_name
        AND published.tablename = relation.table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', relation.schema_name, relation.table_name);
    END IF;
  END LOOP;
END;
$$;
