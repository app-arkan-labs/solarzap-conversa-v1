import type { SystemRole } from '@/hooks/useAdminApi';

export type CrmRole = 'none' | 'owner' | 'sales' | 'cs' | 'finance' | 'ops' | 'read_only';

export type InternalCrmApiAction =
  | 'crm_whoami'
  | 'list_products'
  | 'list_pipeline_stages'
  | 'list_dashboard_kpis'
  | 'list_clients'
  | 'get_client_detail'
  | 'upsert_client'
  | 'list_deals'
  | 'upsert_deal'
  | 'move_deal_stage'
  | 'create_deal_checkout_link'
  | 'list_tasks'
  | 'upsert_task'
  | 'list_instances'
  | 'upsert_instance'
  | 'connect_instance'
  | 'list_conversations'
  | 'get_conversation_detail'
  | 'append_message'
  | 'mark_conversation_read'
  | 'update_conversation_status'
  | 'webhook_inbound'
  | 'list_campaigns'
  | 'upsert_campaign'
  | 'update_campaign_status'
  | 'run_campaign_batch'
  | 'list_ai_settings'
  | 'upsert_ai_settings'
  | 'enqueue_agent_job'
  | 'run_agent_jobs'
  | 'list_ai_action_logs'
  | 'process_agent_jobs'
  | 'list_appointments'
  | 'upsert_appointment'
  | 'get_google_calendar_status'
  | 'get_google_calendar_oauth_url'
  | 'disconnect_google_calendar'
  | 'sync_appointment_google_calendar'
  | 'import_google_calendar_events'
  | 'list_finance_summary'
  | 'list_orders'
  | 'list_customer_snapshot'
  | 'refresh_customer_snapshot'
  | 'get_linked_public_org_summary'
  | 'provision_customer';

export type InternalCrmApiRequest = {
  action: InternalCrmApiAction;
  [key: string]: unknown;
};

export type InternalCrmApiErrorCode =
  | 'not_system_admin'
  | 'not_crm_member'
  | 'insufficient_role'
  | 'mfa_required'
  | 'missing_auth'
  | 'unauthorized'
  | 'forbidden_origin'
  | 'network_error'
  | 'gateway_auth_error'
  | 'admin_lookup_failed'
  | 'not_found'
  | 'invalid_payload'
  | 'action_not_allowed'
  | 'unknown_internal_crm_error';

export type InternalCrmWhoAmIResponse = {
  ok: true;
  user_id: string;
  system_role: SystemRole;
  crm_role: CrmRole;
  aal: string;
};

export type InternalCrmProduct = {
  product_code: string;
  name: string;
  billing_type: 'one_time' | 'recurring';
  payment_method: 'stripe' | 'manual' | 'hybrid';
  is_active: boolean;
  sort_order: number;
  price_cents: number;
  currency: string;
  stripe_price_id: string | null;
};

export type InternalCrmStage = {
  stage_code: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  win_probability: number;
  color_token: string | null;
};

export type InternalCrmClientSummary = {
  id: string;
  company_name: string;
  primary_contact_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  source_channel: string | null;
  owner_user_id: string | null;
  current_stage_code: string | null;
  lifecycle_status: 'lead' | 'customer_onboarding' | 'active_customer' | 'churn_risk' | 'churned';
  last_contact_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  linked_public_org_id: string | null;
  updated_at: string;
  open_deal_count: number;
  total_mrr_cents: number;
  total_one_time_cents: number;
};

export type InternalCrmClientContact = {
  id: string;
  client_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role_label: string | null;
  is_primary: boolean;
  notes: string | null;
};

export type InternalCrmDealItem = {
  id: string;
  deal_id: string;
  product_code: string;
  billing_type: 'one_time' | 'recurring';
  payment_method: 'stripe' | 'manual' | 'hybrid';
  stripe_price_id: string | null;
  unit_price_cents: number;
  quantity: number;
  total_price_cents: number;
};

export type InternalCrmDealSummary = {
  id: string;
  client_id: string;
  title: string;
  owner_user_id: string | null;
  stage_code: string | null;
  status: 'open' | 'won' | 'lost';
  probability: number;
  expected_close_at: string | null;
  one_time_total_cents: number;
  mrr_cents: number;
  payment_method: 'stripe' | 'manual' | 'hybrid';
  payment_status: string;
  checkout_url: string | null;
  stripe_checkout_session_id: string | null;
  paid_at: string | null;
  won_at: string | null;
  notes: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  client_company_name?: string | null;
  items?: InternalCrmDealItem[];
};

export type InternalCrmTask = {
  id: string;
  client_id: string | null;
  deal_id: string | null;
  owner_user_id: string | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: 'open' | 'done' | 'canceled';
  task_kind: string;
  completed_at: string | null;
  client_company_name?: string | null;
};

export type InternalCrmDashboardKpis = {
  leads_in_period: number;
  qualified_leads: number;
  demos_scheduled: number;
  proposals_sent: number;
  win_rate: number;
  revenue_one_time_closed_cents: number;
  mrr_sold_cents: number;
  mrr_active_cents: number;
  onboarding_pending: number;
  churn_risk_count: number;
  churned_in_period: number;
  stalled_deals: InternalCrmDealSummary[];
  next_actions: InternalCrmTask[];
  onboarding_queue: InternalCrmClientSummary[];
  pending_payments: InternalCrmDealSummary[];
};

export type InternalCrmCustomerAppLink = {
  client_id: string;
  linked_public_org_id: string | null;
  linked_public_owner_user_id: string | null;
  provisioned_at: string | null;
  provisioning_status: 'pending' | 'provisioned' | 'failed';
  last_error: string | null;
};

export type LinkedPublicOrgSummary = {
  found: boolean;
  org_id?: string;
  org?: {
    id: string;
    name: string;
    owner_id: string | null;
    plan: string | null;
    subscription_status: string | null;
    status: string | null;
    trial_ends_at: string | null;
    grace_ends_at: string | null;
    current_period_end: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  stats?: {
    member_count: number;
    instance_count: number;
    lead_count: number;
    proposal_count: number;
  };
};

export type InternalCrmClientDetail = {
  ok: true;
  client: InternalCrmClientSummary & {
    notes: string | null;
    metadata?: Record<string, unknown> | null;
  };
  contacts: InternalCrmClientContact[];
  deals: InternalCrmDealSummary[];
  tasks: InternalCrmTask[];
  appointments: Array<Record<string, unknown>>;
  app_link: InternalCrmCustomerAppLink | null;
  linked_public_org_summary: LinkedPublicOrgSummary | null;
};

export type InternalCrmWhatsappInstance = {
  id: string;
  instance_name: string;
  display_name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  ai_enabled: boolean;
  assistant_identity_name: string | null;
  assistant_prompt_override: string | null;
  phone_number: string | null;
  webhook_url: string | null;
  qr_code_base64: string | null;
};

export type InternalCrmConversationSummary = {
  id: string;
  client_id: string;
  contact_id: string | null;
  whatsapp_instance_id: string | null;
  assigned_to_user_id: string | null;
  channel: 'whatsapp' | 'manual_note';
  status: 'open' | 'resolved' | 'archived';
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  client_company_name?: string | null;
  primary_contact_name?: string | null;
  primary_phone?: string | null;
  primary_email?: string | null;
  current_stage_code?: string | null;
  lifecycle_status?: 'lead' | 'customer_onboarding' | 'active_customer' | 'churn_risk' | 'churned';
  source_channel?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  unread_count?: number;
};

export type InternalCrmMessage = {
  id: string;
  conversation_id: string;
  whatsapp_instance_id: string | null;
  direction: 'inbound' | 'outbound' | 'system';
  body: string | null;
  message_type: 'text' | 'image' | 'audio' | 'document' | 'video' | 'note';
  attachment_url: string | null;
  wa_message_id: string | null;
  remote_jid: string | null;
  sent_by_user_id: string | null;
  read_at: string | null;
  delivery_status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
};

export type InternalCrmConversationDetail = {
  ok: true;
  conversation: InternalCrmConversationSummary;
  messages: InternalCrmMessage[];
  client: InternalCrmClientSummary | null;
  whatsapp_instance: InternalCrmWhatsappInstance | null;
};

export type InternalCrmCampaign = {
  id: string;
  name: string;
  whatsapp_instance_id: string | null;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'canceled';
  sent_count: number;
  failed_count: number;
  owner_user_id: string | null;
  target_filters: Record<string, unknown>;
  messages: Array<string>;
  recipients_total?: number;
  recipients_pending?: number;
  recipients_sent?: number;
  recipients_failed?: number;
  created_at: string;
  updated_at: string;
};

export type InternalCrmAppointment = {
  id: string;
  client_id: string;
  deal_id: string | null;
  owner_user_id: string | null;
  title: string;
  appointment_type: 'call' | 'demo' | 'meeting' | 'visit' | 'other';
  status: 'scheduled' | 'confirmed' | 'done' | 'canceled' | 'no_show';
  start_at: string;
  end_at: string | null;
  location: string | null;
  notes: string | null;
  source: 'internal' | 'google';
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_sync_status: 'not_synced' | 'synced' | 'error' | 'disconnected';
  google_last_synced_at: string | null;
  google_sync_error: string | null;
  created_at: string;
  updated_at: string;
  client_company_name?: string | null;
};

export type InternalCrmAiActionLog = {
  id: string;
  job_id: string | null;
  client_id: string | null;
  action_type: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  created_at: string;
  client_company_name?: string | null;
};

export type InternalCrmGoogleCalendarStatus = {
  ok: true;
  connected: boolean;
  connection: null | {
    account_email: string | null;
    account_name: string | null;
    calendar_id: string;
    token_expires_at: string | null;
    connected_at: string | null;
  };
};

export type InternalCrmAiSettings = {
  id: string;
  is_enabled: boolean;
  qualification_enabled: boolean;
  follow_up_enabled: boolean;
  broadcast_assistant_enabled: boolean;
  onboarding_assistant_enabled: boolean;
  model: string | null;
  timezone: string;
  default_prompt: string | null;
  metadata: Record<string, unknown>;
  stage_configs: Array<{
    id: string;
    stage_code: string;
    is_enabled: boolean;
    system_prompt: string | null;
    prompt_version: number;
  }>;
  pending_jobs: Array<{
    id: string;
    job_type: string;
    status: string;
    scheduled_at: string;
    client_id: string | null;
  }>;
};

export type InternalCrmFinanceSummary = {
  revenue_one_time_cents: number;
  mrr_sold_cents: number;
  mrr_active_cents: number;
  pending_payments_count: number;
  churned_count: number;
  orders: Array<{
    id: string;
    client_id: string;
    deal_id: string | null;
    order_number: string | null;
    status: string;
    total_cents: number;
    payment_method: string;
    paid_at: string | null;
    created_at: string;
  }>;
  subscriptions: Array<{
    id: string;
    client_id: string;
    product_code: string | null;
    status: string;
    mrr_cents: number;
    billing_interval: string;
    current_period_end: string | null;
    stripe_subscription_id: string | null;
    created_at: string;
  }>;
  payment_events: Array<{
    id: string;
    deal_id: string | null;
    provider: string;
    provider_event_id: string | null;
    event_type: string;
    amount_cents: number;
    status: string;
    created_at: string;
  }>;
};

export type InternalCrmCustomerSnapshot = {
  id: string;
  client_id: string;
  company_name: string | null;
  plan_key: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  current_period_end: string | null;
  member_count: number;
  whatsapp_instance_count: number;
  lead_count: number;
  proposal_count: number;
  last_synced_at: string | null;
  updated_at: string;
};
