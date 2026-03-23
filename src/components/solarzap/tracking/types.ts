import type { StageEventMap } from '@/lib/tracking/constants';

export type TrackingSettingsForm = {
  tracking_enabled: boolean;
  auto_channel_attribution: boolean;
  force_channel_overwrite: boolean;
  google_validate_only: boolean;
  meta_capi_enabled: boolean;
  google_ads_enabled: boolean;
  ga4_enabled: boolean;
  rate_limit_per_minute: number;
  webhook_public_key: string | null;
  stage_event_map: StageEventMap;
};

export type PlatformFormState = {
  meta: { enabled: boolean; meta_pixel_id: string; meta_test_event_code: string; meta_access_token: string };
  google_ads: {
    enabled: boolean;
    google_mcc_id: string;
    google_customer_id: string;
    google_conversion_action_id: string;
    google_client_id: string;
    google_client_secret: string;
    google_refresh_token: string;
    google_developer_token: string;
  };
  ga4: { enabled: boolean; ga4_measurement_id: string; ga4_api_secret: string };
};

export type TriggerRow = {
  id: string;
  trigger_text: string;
  match_type: 'exact' | 'contains' | 'starts_with' | 'regex';
  inferred_channel: string;
  campaign_name: string | null;
  priority: number;
  is_active: boolean;
};

export type TriggerDraft = {
  trigger_text: string;
  match_type: TriggerRow['match_type'];
  inferred_channel: string;
  campaign_name: string;
  priority: number;
  is_active: boolean;
};

export type DeliveryRow = {
  id: string;
  platform: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  conversion_event: { event_name: string | null; crm_stage: string | null } | null;
};

export type PlatformKey = 'meta' | 'google_ads' | 'ga4';

export type SecretFieldKey =
  | 'meta_access_token'
  | 'google_client_secret'
  | 'google_refresh_token'
  | 'google_developer_token'
  | 'ga4_api_secret';

export type CustomerOption = { customerId: string; descriptiveName: string; isManager: boolean };
export type ConversionActionOption = { id: string; name: string };
