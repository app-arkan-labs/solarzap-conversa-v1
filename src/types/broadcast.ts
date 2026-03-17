export type BroadcastCampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'canceled';

export type BroadcastRecipientStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface BroadcastCampaign {
  id: string;
  org_id: string;
  user_id: string;
  assigned_to_user_id: string | null;
  assigned_to_user_ids: string[];
  lead_client_type: 'residencial' | 'comercial' | 'industrial' | 'rural' | 'usina';
  name: string;
  messages: string[];
  instance_name: string;
  interval_seconds: number;
  status: BroadcastCampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  source_channel: string;
  pipeline_stage: string;
  ai_enabled: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRecipient {
  id: string;
  campaign_id: string;
  lead_id: number | null;
  assigned_to_user_id?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  status: BroadcastRecipientStatus;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
}
