import { getDefaultStageEventMap } from '@/lib/tracking/constants';
import type { TrackingSettingsForm, PlatformFormState, TriggerDraft, TriggerRow } from './types';

export const DEFAULT_SETTINGS: TrackingSettingsForm = {
  tracking_enabled: false,
  auto_channel_attribution: true,
  force_channel_overwrite: false,
  google_validate_only: false,
  meta_capi_enabled: false,
  google_ads_enabled: false,
  ga4_enabled: false,
  rate_limit_per_minute: 60,
  webhook_public_key: null,
  stage_event_map: getDefaultStageEventMap(),
};

export const DEFAULT_FORMS: PlatformFormState = {
  meta: { enabled: false, meta_pixel_id: '', meta_test_event_code: '', meta_access_token: '' },
  google_ads: {
    enabled: false,
    google_mcc_id: '',
    google_customer_id: '',
    google_conversion_action_id: '',
    google_client_id: '',
    google_client_secret: '',
    google_refresh_token: '',
    google_developer_token: '',
  },
  ga4: { enabled: false, ga4_measurement_id: '', ga4_api_secret: '' },
};

export const DEFAULT_TRIGGER: TriggerDraft = {
  trigger_text: '',
  match_type: 'contains',
  inferred_channel: 'google_ads',
  campaign_name: '',
  priority: 100,
  is_active: true,
};

export const MATCH_TYPE_OPTIONS: { value: TriggerRow['match_type']; label: string }[] = [
  { value: 'contains', label: 'Contém' },
  { value: 'exact', label: 'Exato' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'regex', label: 'Regex' },
];

export const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok_ads', label: 'TikTok Ads' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'email', label: 'E-mail' },
  { value: 'indication', label: 'Indicação' },
  { value: 'event', label: 'Evento' },
  { value: 'cold_list', label: 'Lista fria' },
  { value: 'other', label: 'Outros' },
];
