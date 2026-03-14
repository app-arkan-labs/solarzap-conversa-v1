import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { buildUniversalAttributionSnippet } from '@/lib/tracking/snippet';
import { getDefaultStageEventMap, type StageEventMap, type StageEventMapEntry } from '@/lib/tracking/constants';
import { PIPELINE_STAGES, type PipelineStage } from '@/types/solarzap';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

type TrackingSettingsForm = {
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

type PlatformFormState = {
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

type TriggerRow = {
  id: string;
  trigger_text: string;
  match_type: 'exact' | 'contains' | 'starts_with' | 'regex';
  inferred_channel: string;
  campaign_name: string | null;
  priority: number;
  is_active: boolean;
};

type TriggerDraft = {
  trigger_text: string;
  match_type: TriggerRow['match_type'];
  inferred_channel: string;
  campaign_name: string;
  priority: number;
  is_active: boolean;
};

type DeliveryRow = {
  id: string;
  platform: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  conversion_event: { event_name: string | null; crm_stage: string | null } | null;
};

type PlatformKey = 'meta' | 'google_ads' | 'ga4';
type SecretFieldKey =
  | 'meta_access_token'
  | 'google_client_secret'
  | 'google_refresh_token'
  | 'google_developer_token'
  | 'ga4_api_secret';

const DEFAULT_SETTINGS: TrackingSettingsForm = {
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

const DEFAULT_FORMS: PlatformFormState = {
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

const DEFAULT_TRIGGER: TriggerDraft = {
  trigger_text: '',
  match_type: 'contains',
  inferred_channel: 'google_ads',
  campaign_name: '',
  priority: 100,
  is_active: true,
};

const MATCH_TYPE_OPTIONS: { value: TriggerRow['match_type']; label: string }[] = [
  { value: 'contains', label: 'Contém' },
  { value: 'exact', label: 'Exato' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'regex', label: 'Regex' },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
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

function parseStageMap(input: unknown): StageEventMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return getDefaultStageEventMap();
  const out: StageEventMap = {};
  Object.entries(input as Record<string, unknown>).forEach(([stage, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const row = raw as Partial<StageEventMapEntry>;
    if (!row.event_key || typeof row.event_key !== 'string') return;
    out[stage] = {
      event_key: row.event_key,
      meta: row.meta || null,
      google_ads: row.google_ads || null,
      ga4: row.ga4 || null,
    };
  });
  return Object.keys(out).length > 0 ? out : getDefaultStageEventMap();
}

function formatStageLabel(stage: string): string {
  const fromPipeline = PIPELINE_STAGES[stage as PipelineStage]?.title;
  if (fromPipeline) return fromPipeline;

  return stage
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPlatform(value: string): string {
  if (value === 'meta') return 'Meta CAPI';
  if (value === 'google_ads') return 'Google Ads';
  if (value === 'ga4') return 'GA4';
  return value;
}

function formatDeliveryStatus(value: string): string {
  if (value === 'pending') return 'Pendente';
  if (value === 'processing') return 'Processando';
  if (value === 'sent') return 'Enviado';
  if (value === 'failed') return 'Falhou';
  if (value === 'skipped') return 'Ignorado';
  if (value === 'disabled') return 'Desativado';
  return value;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR');
}

function formatMatchType(value: TriggerRow['match_type']): string {
  return MATCH_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function formatChannel(value: string): string {
  return CHANNEL_OPTIONS.find((option) => option.value === value)?.label || value;
}

type SecretFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
};

function SecretField({ label, placeholder, value, visible, onToggle, onChange }: SecretFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-20"
        />
        <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1 h-8 px-2" onClick={onToggle}>
          {visible ? (
            <>
              <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar
            </>
          ) : (
            <>
              <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function TrackingView() {
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingStageMap, setSavingStageMap] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revokingKey, setRevokingKey] = useState(false);
  const [settings, setSettings] = useState<TrackingSettingsForm>(DEFAULT_SETTINGS);
  const [forms, setForms] = useState<PlatformFormState>(DEFAULT_FORMS);
  const [savingPlatform, setSavingPlatform] = useState<PlatformKey | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<PlatformKey | null>(null);
  const [trigger, setTrigger] = useState(DEFAULT_TRIGGER);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [deletingTriggerId, setDeletingTriggerId] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [periodDays, setPeriodDays] = useState(30);
  const [googleAdsConnected, setGoogleAdsConnected] = useState(false);
  const [googleAdsEmail, setGoogleAdsEmail] = useState<string | null>(null);
  const [googleAdsConnecting, setGoogleAdsConnecting] = useState(false);
  const [googleAdsDisconnecting, setGoogleAdsDisconnecting] = useState(false);
  const [mccList, setMccList] = useState<{ customerId: string; descriptiveName: string; isManager: boolean }[]>([]);
  const [customerList, setCustomerList] = useState<{ customerId: string; descriptiveName: string; isManager: boolean }[]>([]);
  const [conversionActions, setConversionActions] = useState<{ id: string; name: string }[]>([]);
  const [loadingMcc, setLoadingMcc] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingConversions, setLoadingConversions] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [secretVisibility, setSecretVisibility] = useState<Record<SecretFieldKey, boolean>>({
    meta_access_token: false,
    google_client_secret: false,
    google_refresh_token: false,
    google_developer_token: false,
    ga4_api_secret: false,
  });
  const snippet = useMemo(() => buildUniversalAttributionSnippet(), []);
  const webhookEndpoint = `${import.meta.env.VITE_SUPABASE_URL || '<SUPABASE_URL>'}/functions/v1/attribution-webhook`;

  const platformConnected = useMemo(
    () => ({
      meta: forms.meta.enabled && forms.meta.meta_pixel_id.trim().length > 0,
      google_ads:
        googleAdsConnected &&
        forms.google_ads.google_customer_id.trim().length > 0 &&
        forms.google_ads.google_conversion_action_id.trim().length > 0,
      ga4: forms.ga4.enabled && forms.ga4.ga4_measurement_id.trim().length > 0,
    }),
    [forms, googleAdsConnected],
  );

  const stageRows = useMemo(() => {
    const defaults = getDefaultStageEventMap();
    const keys = Array.from(new Set([...Object.keys(defaults), ...Object.keys(settings.stage_event_map)]));
    return keys.map((stage) => {
      const fallback = defaults[stage] || { event_key: stage, meta: null, google_ads: null, ga4: null };
      const current = settings.stage_event_map[stage] || fallback;
      return {
        stage,
        meta: current.meta || '',
        google_ads: current.google_ads || '',
        ga4: current.ga4 || '',
      };
    });
  }, [settings.stage_event_map]);

  const copy = useCallback(async (value: string, message: string) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error('Falha ao copiar.');
    }
  }, []);

  const loadPanel = useCallback(
    async (silent = false) => {
      if (!orgId) return;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        await supabase.from('org_tracking_settings').upsert({ org_id: orgId }, { onConflict: 'org_id' });

        const [settingsResp, credsResp, triggerResp] = await Promise.all([
          supabase
            .from('org_tracking_settings')
            .select(
              'tracking_enabled, auto_channel_attribution, force_channel_overwrite, google_validate_only, meta_capi_enabled, google_ads_enabled, ga4_enabled, rate_limit_per_minute, webhook_public_key, stage_event_map',
            )
            .eq('org_id', orgId)
            .maybeSingle(),
          supabase
            .from('ad_platform_credentials')
            .select(
              'platform, enabled, meta_pixel_id, meta_test_event_code, google_mcc_id, google_customer_id, google_conversion_action_id, google_client_id, google_ads_connected_at, google_ads_account_email, ga4_measurement_id',
            )
            .eq('org_id', orgId),
          supabase
            .from('ad_trigger_messages')
            .select('id, trigger_text, match_type, inferred_channel, campaign_name, priority, is_active')
            .eq('org_id', orgId)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: true }),
        ]);

        if (settingsResp.error) throw settingsResp.error;
        if (credsResp.error) throw credsResp.error;
        if (triggerResp.error) throw triggerResp.error;

        const incoming = settingsResp.data;
        const stageMap = parseStageMap(incoming?.stage_event_map);
        setSettings({
          tracking_enabled: incoming?.tracking_enabled === true,
          auto_channel_attribution: incoming?.auto_channel_attribution !== false,
          force_channel_overwrite: incoming?.force_channel_overwrite === true,
          google_validate_only: incoming?.google_validate_only === true,
          meta_capi_enabled: incoming?.meta_capi_enabled === true,
          google_ads_enabled: incoming?.google_ads_enabled === true,
          ga4_enabled: incoming?.ga4_enabled === true,
          rate_limit_per_minute: Number(incoming?.rate_limit_per_minute || 60),
          webhook_public_key: incoming?.webhook_public_key || null,
          stage_event_map: stageMap,
        });

        const nextForms: PlatformFormState = {
          meta: { ...DEFAULT_FORMS.meta, enabled: incoming?.meta_capi_enabled === true },
          google_ads: { ...DEFAULT_FORMS.google_ads, enabled: incoming?.google_ads_enabled === true },
          ga4: { ...DEFAULT_FORMS.ga4, enabled: incoming?.ga4_enabled === true },
        };
        let nextGoogleAdsConnected = false;
        let nextGoogleAdsEmail: string | null = null;

        (credsResp.data || []).forEach((row: any) => {
          if (row.platform === 'meta') {
            nextForms.meta.enabled = row.enabled === true;
            nextForms.meta.meta_pixel_id = row.meta_pixel_id || '';
            nextForms.meta.meta_test_event_code = row.meta_test_event_code || '';
          }
          if (row.platform === 'google_ads') {
            nextForms.google_ads.enabled = row.enabled === true;
            nextForms.google_ads.google_mcc_id = row.google_mcc_id || '';
            nextForms.google_ads.google_customer_id = row.google_customer_id || '';
            nextForms.google_ads.google_conversion_action_id = row.google_conversion_action_id || '';
            nextForms.google_ads.google_client_id = row.google_client_id || '';
            if (row.google_ads_connected_at) {
              nextGoogleAdsConnected = true;
              nextGoogleAdsEmail = row.google_ads_account_email || null;
            }
          }
          if (row.platform === 'ga4') {
            nextForms.ga4.enabled = row.enabled === true;
            nextForms.ga4.ga4_measurement_id = row.ga4_measurement_id || '';
          }
        });

        setForms((current) => ({
          meta: { ...nextForms.meta, meta_access_token: current.meta.meta_access_token },
          google_ads: {
            ...nextForms.google_ads,
            google_client_secret: current.google_ads.google_client_secret,
            google_refresh_token: current.google_ads.google_refresh_token,
            google_developer_token: current.google_ads.google_developer_token,
          },
          ga4: { ...nextForms.ga4, ga4_api_secret: current.ga4.ga4_api_secret },
        }));
        setGoogleAdsConnected(nextGoogleAdsConnected);
        setGoogleAdsEmail(nextGoogleAdsEmail);
        if (!nextGoogleAdsConnected) {
          setMccList([]);
          setCustomerList([]);
          setConversionActions([]);
        }

        setTriggers(
          ((triggerResp.data || []) as any[]).map((row) => ({
            id: String(row.id),
            trigger_text: String(row.trigger_text || ''),
            match_type: (row.match_type || 'contains') as TriggerRow['match_type'],
            inferred_channel: String(row.inferred_channel || ''),
            campaign_name: row.campaign_name ? String(row.campaign_name) : null,
            priority: Number(row.priority || 100),
            is_active: row.is_active === true,
          })),
        );
      } catch (error) {
        console.error(error);
        toast.error('Falha ao carregar dados de tracking.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId],
  );

  const connectGoogleAds = useCallback(async () => {
    if (!orgId) return;
    setGoogleAdsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-oauth', {
        body: { org_id: orgId },
      });
      if (error || !data?.authUrl) throw new Error(error?.message || data?.error || 'failed_to_get_auth_url');
      window.location.href = String(data.authUrl);
    } catch (error) {
      console.error(error);
      toast.error('Falha ao iniciar conexão com Google Ads.');
      setGoogleAdsConnecting(false);
    }
  }, [orgId]);

  const disconnectGoogleAds = useCallback(async () => {
    if (!orgId) return;
    setGoogleAdsDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('tracking-credentials', {
        body: { action: 'disconnect_google_ads', org_id: orgId },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'disconnect_failed');
      setGoogleAdsConnected(false);
      setGoogleAdsEmail(null);
      setMccList([]);
      setCustomerList([]);
      setConversionActions([]);
      setForms((current) => ({ ...current, google_ads: { ...DEFAULT_FORMS.google_ads } }));
      setSettings((current) => ({ ...current, google_ads_enabled: false }));
      toast.success('Google Ads desconectado.');
      void loadPanel(true);
    } catch (error) {
      console.error(error);
      toast.error('Falha ao desconectar Google Ads.');
    } finally {
      setGoogleAdsDisconnecting(false);
    }
  }, [loadPanel, orgId]);

  const loadAccessibleCustomers = useCallback(async () => {
    if (!orgId) return;
    setLoadingMcc(true);
    try {
      const { data, error } = await supabase.functions.invoke('tracking-credentials', {
        body: { action: 'list_accessible_customers', org_id: orgId },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'list_accessible_failed');
      const names = Array.isArray(data?.data?.resourceNames)
        ? data.data.resourceNames.map((resourceName: string) => {
            const customerId = String(resourceName || '').replace('customers/', '');
            return { customerId, descriptiveName: customerId, isManager: true };
          })
        : [];
      setMccList(names);
    } catch (error) {
      console.error(error);
      toast.error('Falha ao listar contas acessíveis.');
    } finally {
      setLoadingMcc(false);
    }
  }, [orgId]);

  const loadAccountHierarchy = useCallback(
    async (loginCustomerId: string) => {
      if (!orgId) return;
      setLoadingCustomers(true);
      try {
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          body: { action: 'account_hierarchy', org_id: orgId, login_customer_id: loginCustomerId },
        });
        if (error || !data?.success) throw new Error(error?.message || data?.error || 'account_hierarchy_failed');
        setCustomerList(Array.isArray(data?.data?.customers) ? data.data.customers : []);
      } catch (error) {
        console.error(error);
        toast.error('Falha ao listar contas de anúncios.');
      } finally {
        setLoadingCustomers(false);
      }
    },
    [orgId],
  );

  const loadConversionActions = useCallback(
    async (customerId: string, loginCustomerId?: string) => {
      if (!orgId) return;
      setLoadingConversions(true);
      try {
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          body: {
            action: 'list_conversion_actions',
            org_id: orgId,
            customer_id: customerId,
            login_customer_id: loginCustomerId,
          },
        });
        if (error || !data?.success) throw new Error(error?.message || data?.error || 'list_conversion_actions_failed');
        const actions = Array.isArray(data?.data?.conversionActions)
          ? data.data.conversionActions.map((action: any) => ({
              id: String(action.id || ''),
              name: String(action.name || action.id || ''),
            }))
          : [];
        setConversionActions(actions);
      } catch (error) {
        console.error(error);
        toast.error('Falha ao listar ações de conversão.');
      } finally {
        setLoadingConversions(false);
      }
    },
    [orgId],
  );

  const saveAdsSelection = useCallback(async () => {
    if (!orgId) return;
    setSavingSelection(true);
    try {
      const { data, error } = await supabase.functions.invoke('tracking-credentials', {
        body: {
          action: 'save_ads_selection',
          org_id: orgId,
          login_customer_id: forms.google_ads.google_mcc_id,
          customer_id: forms.google_ads.google_customer_id,
          conversion_action_id: forms.google_ads.google_conversion_action_id,
        },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'save_ads_selection_failed');
      toast.success('Seleção salva com sucesso.');
      void loadPanel(true);
    } catch (error) {
      console.error(error);
      toast.error('Falha ao salvar seleção.');
    } finally {
      setSavingSelection(false);
    }
  }, [forms.google_ads.google_conversion_action_id, forms.google_ads.google_customer_id, forms.google_ads.google_mcc_id, loadPanel, orgId]);

  const loadDeliveries = useCallback(async () => {
    if (!orgId) return;
    setLoadingDeliveries(true);
    try {
      const fromIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('conversion_deliveries')
        .select('id, platform, status, attempt_count, next_attempt_at, last_error, conversion_event:conversion_events(event_name, crm_stage)')
        .eq('org_id', orgId)
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      setDeliveries(
        ((data || []) as any[]).map((row) => ({
          id: String(row.id),
          platform: String(row.platform || ''),
          status: String(row.status || ''),
          attempt_count: Number(row.attempt_count || 0),
          next_attempt_at: row.next_attempt_at ? String(row.next_attempt_at) : null,
          last_error: row.last_error ? String(row.last_error) : null,
          conversion_event: row.conversion_event
            ? { event_name: row.conversion_event.event_name || null, crm_stage: row.conversion_event.crm_stage || null }
            : null,
        })),
      );
    } catch (error) {
      console.error(error);
      toast.error('Falha ao carregar entregas.');
    } finally {
      setLoadingDeliveries(false);
    }
  }, [orgId, periodDays]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google_ads_status');
    if (!googleStatus) return;

    if (googleStatus === 'success') {
      toast.success('Google Ads conectado com sucesso!');
      window.history.replaceState({}, '', window.location.pathname);
      void loadPanel(true);
      return;
    }

    if (googleStatus === 'error') {
      const message = params.get('message') || 'Falha na conexão';
      toast.error(`Erro ao conectar Google Ads: ${message}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadPanel]);

  useEffect(() => {
    if (!googleAdsConnected || !forms.google_ads.google_mcc_id) return;
    void loadAccountHierarchy(forms.google_ads.google_mcc_id);
  }, [forms.google_ads.google_mcc_id, googleAdsConnected, loadAccountHierarchy]);

  useEffect(() => {
    if (!googleAdsConnected || mccList.length > 0) return;
    void loadAccessibleCustomers();
  }, [googleAdsConnected, loadAccessibleCustomers, mccList.length]);

  useEffect(() => {
    if (!googleAdsConnected || !forms.google_ads.google_customer_id) return;
    void loadConversionActions(forms.google_ads.google_customer_id, forms.google_ads.google_mcc_id);
  }, [forms.google_ads.google_customer_id, forms.google_ads.google_mcc_id, googleAdsConnected, loadConversionActions]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  const saveSettings = useCallback(async () => {
    if (!orgId) return;
    setSavingSettings(true);
    try {
      const nextRate = Number(settings.rate_limit_per_minute || 60);
      const payload = {
        org_id: orgId,
        ...settings,
        rate_limit_per_minute: Number.isFinite(nextRate) && nextRate > 0 ? Math.floor(nextRate) : 60,
      };
      const { error } = await supabase.from('org_tracking_settings').upsert(payload, { onConflict: 'org_id' });
      if (error) throw error;
      toast.success('Configurações gerais salvas.');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao salvar configurações gerais.');
    } finally {
      setSavingSettings(false);
    }
  }, [orgId, settings]);

  const savePlatform = useCallback(
    async (platform: PlatformKey) => {
      if (!orgId) return;
      setSavingPlatform(platform);
      try {
        const metadata = { ...forms[platform] } as Record<string, unknown>;
        const secrets: Record<string, unknown> = {};
        if (platform === 'meta') {
          secrets.meta_access_token = forms.meta.meta_access_token;
          delete metadata.meta_access_token;
        } else if (platform === 'google_ads') {
          secrets.google_client_secret = forms.google_ads.google_client_secret;
          secrets.google_refresh_token = forms.google_ads.google_refresh_token;
          secrets.google_developer_token = forms.google_ads.google_developer_token;
          delete metadata.google_client_secret;
          delete metadata.google_refresh_token;
          delete metadata.google_developer_token;
        } else {
          secrets.ga4_api_secret = forms.ga4.ga4_api_secret;
          delete metadata.ga4_api_secret;
        }

        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          body: { action: 'upsert_platform_credentials', org_id: orgId, platform, enabled: forms[platform].enabled, metadata, secrets },
        });
        if (error || !data?.success) throw new Error(error?.message || data?.error || 'platform_save_failed');

        const settingsPatch =
          platform === 'meta'
            ? { meta_capi_enabled: forms.meta.enabled }
            : platform === 'google_ads'
              ? { google_ads_enabled: forms.google_ads.enabled }
              : { ga4_enabled: forms.ga4.enabled };
        const { error: settingsError } = await supabase
          .from('org_tracking_settings')
          .upsert({ org_id: orgId, ...settingsPatch }, { onConflict: 'org_id' });
        if (settingsError) throw settingsError;

        setSettings((current) => ({ ...current, ...settingsPatch }));
        toast.success(`Configurações de ${formatPlatform(platform)} salvas.`);
        void loadPanel(true);
      } catch (error) {
        console.error(error);
        toast.error(`Falha ao salvar ${formatPlatform(platform)}.`);
      } finally {
        setSavingPlatform(null);
      }
    },
    [forms, loadPanel, orgId],
  );

  const testPlatform = useCallback(
    async (platform: PlatformKey) => {
      if (!orgId) return;
      setTestingPlatform(platform);
      try {
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          body: { action: 'test_platform_connection', org_id: orgId, platform, validate_only: settings.google_validate_only },
        });
        if (error || !data?.success) throw new Error(error?.message || data?.error || 'test_failed');
        toast.success(`Conexão de ${formatPlatform(platform)} validada.`);
      } catch (error) {
        console.error(error);
        toast.error(`Falha ao validar ${formatPlatform(platform)}.`);
      } finally {
        setTestingPlatform(null);
      }
    },
    [orgId, settings.google_validate_only],
  );

  const saveTrigger = useCallback(async () => {
    if (!orgId || !trigger.trigger_text.trim() || !trigger.inferred_channel) return;
    setSavingTrigger(true);
    try {
      const payload = {
        org_id: orgId,
        ...trigger,
        trigger_text: trigger.trigger_text.trim(),
        campaign_name: trigger.campaign_name.trim() || null,
      };
      if (editingTriggerId) {
        const { error } = await supabase
          .from('ad_trigger_messages')
          .update(payload)
          .eq('id', editingTriggerId)
          .eq('org_id', orgId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ad_trigger_messages').insert(payload);
        if (error) throw error;
      }
      setTrigger(DEFAULT_TRIGGER);
      setEditingTriggerId(null);
      toast.success('Gatilho salvo.');
      void loadPanel(true);
    } catch (error) {
      console.error(error);
      toast.error('Falha ao salvar gatilho.');
    } finally {
      setSavingTrigger(false);
    }
  }, [editingTriggerId, loadPanel, orgId, trigger]);

  const deleteTrigger = useCallback(
    async (id: string) => {
      if (!orgId) return;
      setDeletingTriggerId(id);
      try {
        const { error } = await supabase.from('ad_trigger_messages').delete().eq('id', id).eq('org_id', orgId);
        if (error) throw error;
        toast.success('Gatilho removido.');
        void loadPanel(true);
      } catch (error) {
        console.error(error);
        toast.error('Falha ao remover gatilho.');
      } finally {
        setDeletingTriggerId(null);
      }
    },
    [loadPanel, orgId],
  );

  const generatePublicKey = useCallback(async () => {
    if (!orgId) return;
    setGeneratingKey(true);
    try {
      const { data, error } = await supabase.rpc('tracking_generate_public_org_key');
      if (error) throw error;
      if (!data) throw new Error('missing_key');
      const key = String(data);
      const { error: saveError } = await supabase
        .from('org_tracking_settings')
        .upsert({ org_id: orgId, webhook_public_key: key }, { onConflict: 'org_id' });
      if (saveError) throw saveError;
      setSettings((current) => ({ ...current, webhook_public_key: key }));
      toast.success('Chave gerada.');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao gerar chave.');
    } finally {
      setGeneratingKey(false);
    }
  }, [orgId]);

  const revokePublicKey = useCallback(async () => {
    if (!orgId) return;
    setRevokingKey(true);
    try {
      const { error } = await supabase
        .from('org_tracking_settings')
        .upsert({ org_id: orgId, webhook_public_key: null }, { onConflict: 'org_id' });
      if (error) throw error;
      setSettings((current) => ({ ...current, webhook_public_key: null }));
      toast.success('Chave revogada.');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao revogar chave.');
    } finally {
      setRevokingKey(false);
    }
  }, [orgId]);

  const updateStageMapField = useCallback((stage: string, field: 'meta' | 'google_ads' | 'ga4', value: string) => {
    setSettings((current) => {
      const currentRow = current.stage_event_map[stage] || { event_key: stage, meta: null, google_ads: null, ga4: null };
      return {
        ...current,
        stage_event_map: {
          ...current.stage_event_map,
          [stage]: {
            ...currentRow,
            [field]: value.trim() ? value : null,
          },
        },
      };
    });
  }, []);

  const saveStageMap = useCallback(async () => {
    if (!orgId) return;
    setSavingStageMap(true);
    try {
      const nextMap: StageEventMap = {};
      Object.entries(settings.stage_event_map).forEach(([stage, row]) => {
        nextMap[stage] = {
          event_key: row?.event_key || stage,
          meta: row?.meta?.trim() ? row.meta : null,
          google_ads: row?.google_ads?.trim() ? row.google_ads : null,
          ga4: row?.ga4?.trim() ? row.ga4 : null,
        };
      });
      const { error } = await supabase
        .from('org_tracking_settings')
        .upsert({ org_id: orgId, stage_event_map: nextMap }, { onConflict: 'org_id' });
      if (error) throw error;
      toast.success('Mapeamento salvo.');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao salvar mapeamento.');
    } finally {
      setSavingStageMap(false);
    }
  }, [orgId, settings.stage_event_map]);

  const restoreDefaultStageMap = useCallback(() => {
    setSettings((current) => ({ ...current, stage_event_map: getDefaultStageEventMap() }));
    toast.success('Mapeamento padrão restaurado.');
  }, []);

  const toggleSecretField = useCallback((field: SecretFieldKey) => {
    setSecretVisibility((current) => ({ ...current, [field]: !current[field] }));
  }, []);

  const summary = useMemo(() => {
    const snapshot = { sent: 0, pending: 0, failed: 0, skipped: 0 };
    deliveries.forEach((row) => {
      if (row.status === 'sent') snapshot.sent += 1;
      else if (row.status === 'failed') snapshot.failed += 1;
      else if (row.status === 'skipped' || row.status === 'disabled') snapshot.skipped += 1;
      else snapshot.pending += 1;
    });
    return snapshot;
  }, [deliveries]);

  if (!orgId) return null;

  return (
    <ScrollArea className="h-full flex-1">
      <div className="min-h-full bg-muted/30">
        <PageHeader
          title="Tracking & Conversões"
          subtitle="Gerencie atribuição, plataformas, gatilhos e monitoramento de entregas."
          icon={Activity}
          actionContent={
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <Badge
                variant="outline"
                className={cn(
                  'border-0 px-3 py-1.5 text-xs font-semibold',
                  settings.tracking_enabled
                    ? 'bg-emerald-500/10 text-emerald-700 animate-pulse'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {settings.tracking_enabled ? 'Tracking ativo' : 'Tracking inativo'}
              </Badge>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void loadPanel(true);
                  void loadDeliveries();
                }}
                disabled={loading || refreshing || loadingDeliveries}
              >
                <RefreshCw className={cn('h-4 w-4', (loading || refreshing || loadingDeliveries) && 'animate-spin')} />
                Atualizar
              </Button>
            </div>
          }
        />

        <div className="w-full space-y-6 px-6 py-6">
          <Tabs defaultValue="geral" className="space-y-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border bg-background p-1 shadow-sm">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="webhook">Webhook & Snippet</TabsTrigger>
              <TabsTrigger value="plataformas">Plataformas</TabsTrigger>
              <TabsTrigger value="mapeamento">Mapeamento de Etapas</TabsTrigger>
              <TabsTrigger value="gatilhos">Mensagens Gatilho</TabsTrigger>
              <TabsTrigger value="entregas">Entregas</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="space-y-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Configurações gerais</CardTitle>
                  <CardDescription>Controle o comportamento global do tracking e da atribuição automática.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex items-center justify-between rounded-xl border bg-background p-4">
                      <span className="text-sm font-medium">Tracking ativado</span>
                      <Switch checked={settings.tracking_enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, tracking_enabled: v }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border bg-background p-4">
                      <span className="text-sm font-medium">Auto-atribuição</span>
                      <Switch checked={settings.auto_channel_attribution} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_channel_attribution: v }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border bg-background p-4">
                      <span className="text-sm font-medium">Forçar overwrite</span>
                      <Switch checked={settings.force_channel_overwrite} onCheckedChange={(v) => setSettings((s) => ({ ...s, force_channel_overwrite: v }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border bg-background p-4">
                      <span className="text-sm font-medium">Google validate-only</span>
                      <Switch checked={settings.google_validate_only} onCheckedChange={(v) => setSettings((s) => ({ ...s, google_validate_only: v }))} />
                    </label>
                  </div>
                  <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="w-full max-w-sm space-y-2">
                      <Label htmlFor="tracking-rate-limit">Rate limit por minuto</Label>
                      <Input
                        id="tracking-rate-limit"
                        type="number"
                        min={1}
                        value={settings.rate_limit_per_minute}
                        onChange={(event) => setSettings((s) => ({ ...s, rate_limit_per_minute: Number(event.target.value || 60) }))}
                      />
                    </div>
                    <Button className="gap-2" onClick={() => void saveSettings()} disabled={savingSettings}>
                      {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar configurações
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhook" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Endpoint do webhook</CardTitle>
                    <CardDescription>Use este endpoint para receber dados de atribuição do site.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Label htmlFor="webhook-url">URL</Label>
                    <div className="flex gap-2">
                      <Input id="webhook-url" value={webhookEndpoint} readOnly className="font-mono text-xs" />
                      <Button type="button" variant="outline" className="gap-2" onClick={() => void copy(webhookEndpoint, 'Endpoint copiado.') }>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Chave pública da organização</CardTitle>
                    <CardDescription>Use a chave no formulário para validar chamadas ao webhook.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input value={settings.webhook_public_key || 'Nenhuma chave gerada'} readOnly className="font-mono text-xs" />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="gap-2" onClick={() => void generatePublicKey()} disabled={generatingKey}>
                        {generatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                        Gerar chave
                      </Button>
                      <Button type="button" variant="outline" className="gap-2" onClick={() => void revokePublicKey()} disabled={revokingKey}>
                        {revokingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Revogar chave
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Snippet universal</CardTitle>
                  <CardDescription>Instale este snippet no site para capturar UTMs e click IDs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea value={snippet} readOnly className="min-h-[220px] font-mono text-[11px]" />
                  <Button type="button" variant="outline" className="gap-2" onClick={() => void copy(snippet, 'Snippet copiado.') }>
                    <Copy className="h-4 w-4" />
                    Copiar snippet
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="plataformas" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Meta CAPI</CardTitle>
                        <CardDescription>Envio de conversões para Meta Ads.</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('border-0', platformConnected.meta ? 'bg-emerald-500/10 text-emerald-700 animate-pulse' : 'bg-muted text-muted-foreground')}>
                        {platformConnected.meta ? 'Conectado' : 'Desconectado'}
                      </Badge>
                    </div>
                    <label className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm">Ativar Meta CAPI</span>
                      <Switch checked={forms.meta.enabled} onCheckedChange={(value) => {
                        setForms((current) => ({ ...current, meta: { ...current.meta, enabled: value } }));
                        setSettings((current) => ({ ...current, meta_capi_enabled: value }));
                      }} />
                    </label>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Pixel ID</Label>
                      <Input value={forms.meta.meta_pixel_id} onChange={(event) => setForms((current) => ({ ...current, meta: { ...current.meta, meta_pixel_id: event.target.value } }))} placeholder="Ex: 123456789012345" />
                    </div>
                    <SecretField
                      label="Access Token"
                      placeholder="Insira o access token"
                      value={forms.meta.meta_access_token}
                      visible={secretVisibility.meta_access_token}
                      onToggle={() => toggleSecretField('meta_access_token')}
                      onChange={(value) => setForms((current) => ({ ...current, meta: { ...current.meta, meta_access_token: value } }))}
                    />
                    <div className="space-y-2">
                      <Label>Test Event Code</Label>
                      <Input value={forms.meta.meta_test_event_code} onChange={(event) => setForms((current) => ({ ...current, meta: { ...current.meta, meta_test_event_code: event.target.value } }))} placeholder="Opcional" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button className="gap-2" onClick={() => void savePlatform('meta')} disabled={savingPlatform === 'meta'}>
                        {savingPlatform === 'meta' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => void testPlatform('meta')} disabled={testingPlatform === 'meta'}>
                        {testingPlatform === 'meta' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Testar conexão
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Google Ads</CardTitle>
                        <CardDescription>Conversões offline para Google Ads.</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('border-0', platformConnected.google_ads ? 'bg-emerald-500/10 text-emerald-700 animate-pulse' : 'bg-muted text-muted-foreground')}>
                        {platformConnected.google_ads ? 'Conectado' : 'Desconectado'}
                      </Badge>
                    </div>
                    <label className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm">Ativar Google Ads</span>
                      <Switch checked={forms.google_ads.enabled} onCheckedChange={(value) => {
                        if (value && !googleAdsConnected) {
                          toast.error('Conecte o Google Ads antes de ativar.');
                          return;
                        }
                        if (value && (!forms.google_ads.google_customer_id || !forms.google_ads.google_conversion_action_id)) {
                          toast.error('Selecione a conta e ação de conversão antes de ativar.');
                          return;
                        }
                        setForms((current) => ({ ...current, google_ads: { ...current.google_ads, enabled: value } }));
                        setSettings((current) => ({ ...current, google_ads_enabled: value }));
                      }} />
                    </label>
                  </CardHeader>
                  {!googleAdsConnected ? (
                    <CardContent className="space-y-4">
                      <div className="flex flex-col items-center gap-3 py-6">
                        <p className="text-center text-sm text-muted-foreground">
                          Conecte sua conta Google Ads para enviar conversões offline automaticamente.
                        </p>
                        <Button className="gap-2" onClick={() => void connectGoogleAds()} disabled={googleAdsConnecting}>
                          {googleAdsConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Conectar Google Ads
                        </Button>
                      </div>

                      {(forms.google_ads.google_customer_id || forms.google_ads.google_client_id) && (
                        <details className="rounded-lg border p-3">
                          <summary className="cursor-pointer text-xs text-muted-foreground">Configuração manual (legado)</summary>
                          <div className="mt-3 space-y-3">
                            <div className="space-y-2"><Label>MCC ID</Label><Input value={forms.google_ads.google_mcc_id} onChange={(event) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_mcc_id: event.target.value } }))} /></div>
                            <div className="space-y-2"><Label>Customer ID</Label><Input value={forms.google_ads.google_customer_id} onChange={(event) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_customer_id: event.target.value } }))} /></div>
                            <div className="space-y-2"><Label>Conversion Action ID</Label><Input value={forms.google_ads.google_conversion_action_id} onChange={(event) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_conversion_action_id: event.target.value } }))} /></div>
                            <div className="space-y-2"><Label>Client ID</Label><Input value={forms.google_ads.google_client_id} onChange={(event) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_client_id: event.target.value } }))} /></div>
                            <SecretField label="Client Secret" placeholder="Insira o client secret" value={forms.google_ads.google_client_secret} visible={secretVisibility.google_client_secret} onToggle={() => toggleSecretField('google_client_secret')} onChange={(value) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_client_secret: value } }))} />
                            <SecretField label="Refresh Token" placeholder="Insira o refresh token" value={forms.google_ads.google_refresh_token} visible={secretVisibility.google_refresh_token} onToggle={() => toggleSecretField('google_refresh_token')} onChange={(value) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_refresh_token: value } }))} />
                            <SecretField label="Developer Token" placeholder="Insira o developer token" value={forms.google_ads.google_developer_token} visible={secretVisibility.google_developer_token} onToggle={() => toggleSecretField('google_developer_token')} onChange={(value) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_developer_token: value } }))} />
                            <div className="flex flex-wrap gap-2">
                              <Button className="gap-2" onClick={() => void savePlatform('google_ads')} disabled={savingPlatform === 'google_ads'}>{savingPlatform === 'google_ads' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
                              <Button variant="outline" className="gap-2" onClick={() => void testPlatform('google_ads')} disabled={testingPlatform === 'google_ads'}>{testingPlatform === 'google_ads' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Testar conexão</Button>
                            </div>
                          </div>
                        </details>
                      )}
                    </CardContent>
                  ) : (
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">
                          Conectado{googleAdsEmail ? ` (${googleAdsEmail})` : ''}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <Label>Conta MCC (Manager)</Label>
                        <div className="flex gap-2">
                          <Select
                            value={forms.google_ads.google_mcc_id}
                            onValueChange={(value) => {
                              setForms((current) => ({
                                ...current,
                                google_ads: { ...current.google_ads, google_mcc_id: value, google_customer_id: '', google_conversion_action_id: '' },
                              }));
                              setCustomerList([]);
                              setConversionActions([]);
                              void loadAccountHierarchy(value);
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione a MCC" /></SelectTrigger>
                            <SelectContent>
                              {mccList.map((mcc) => (
                                <SelectItem key={mcc.customerId} value={mcc.customerId}>
                                  {mcc.descriptiveName || mcc.customerId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="icon" onClick={() => void loadAccessibleCustomers()} disabled={loadingMcc}>
                            <RefreshCw className={cn('h-4 w-4', loadingMcc && 'animate-spin')} />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Conta de Anúncios</Label>
                        <Select
                          value={forms.google_ads.google_customer_id}
                          onValueChange={(value) => {
                            setForms((current) => ({
                              ...current,
                              google_ads: { ...current.google_ads, google_customer_id: value, google_conversion_action_id: '' },
                            }));
                            setConversionActions([]);
                            void loadConversionActions(value, forms.google_ads.google_mcc_id);
                          }}
                          disabled={!forms.google_ads.google_mcc_id || loadingCustomers}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                          <SelectContent>
                            {customerList.filter((customer) => !customer.isManager).map((customer) => (
                              <SelectItem key={customer.customerId} value={customer.customerId}>
                                {customer.descriptiveName || customer.customerId} ({customer.customerId})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Ação de Conversão</Label>
                        <Select
                          value={forms.google_ads.google_conversion_action_id}
                          onValueChange={(value) => setForms((current) => ({ ...current, google_ads: { ...current.google_ads, google_conversion_action_id: value } }))}
                          disabled={!forms.google_ads.google_customer_id || loadingConversions}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione a conversão" /></SelectTrigger>
                          <SelectContent>
                            {conversionActions.map((action) => (
                              <SelectItem key={action.id} value={action.id}>
                                {action.name} ({action.id})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="gap-2"
                          onClick={() => void saveAdsSelection()}
                          disabled={savingSelection || !forms.google_ads.google_customer_id || !forms.google_ads.google_conversion_action_id}
                        >
                          {savingSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar seleção
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={() => void testPlatform('google_ads')} disabled={testingPlatform === 'google_ads'}>
                          {testingPlatform === 'google_ads' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Testar conexão
                        </Button>
                        <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={() => void disconnectGoogleAds()} disabled={googleAdsDisconnecting}>
                          {googleAdsDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Desconectar
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">GA4</CardTitle>
                        <CardDescription>Eventos para Google Analytics 4.</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('border-0', platformConnected.ga4 ? 'bg-emerald-500/10 text-emerald-700 animate-pulse' : 'bg-muted text-muted-foreground')}>
                        {platformConnected.ga4 ? 'Conectado' : 'Desconectado'}
                      </Badge>
                    </div>
                    <label className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm">Ativar GA4</span>
                      <Switch checked={forms.ga4.enabled} onCheckedChange={(value) => {
                        setForms((current) => ({ ...current, ga4: { ...current.ga4, enabled: value } }));
                        setSettings((current) => ({ ...current, ga4_enabled: value }));
                      }} />
                    </label>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2"><Label>Measurement ID</Label><Input value={forms.ga4.ga4_measurement_id} onChange={(event) => setForms((current) => ({ ...current, ga4: { ...current.ga4, ga4_measurement_id: event.target.value } }))} placeholder="Ex: G-XXXXXXXXXX" /></div>
                    <SecretField label="API Secret" placeholder="Insira o API Secret" value={forms.ga4.ga4_api_secret} visible={secretVisibility.ga4_api_secret} onToggle={() => toggleSecretField('ga4_api_secret')} onChange={(value) => setForms((current) => ({ ...current, ga4: { ...current.ga4, ga4_api_secret: value } }))} />
                    <div className="flex flex-wrap gap-2">
                      <Button className="gap-2" onClick={() => void savePlatform('ga4')} disabled={savingPlatform === 'ga4'}>{savingPlatform === 'ga4' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
                      <Button variant="outline" className="gap-2" onClick={() => void testPlatform('ga4')} disabled={testingPlatform === 'ga4'}>{testingPlatform === 'ga4' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Testar conexão</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="mapeamento" className="space-y-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Mapeamento de etapas do CRM</CardTitle>
                  <CardDescription>Defina os eventos enviados para cada plataforma em cada etapa.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[260px]">Etapa</TableHead>
                          <TableHead>Evento Meta</TableHead>
                          <TableHead>Evento Google Ads</TableHead>
                          <TableHead>Evento GA4</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stageRows.map((row) => (
                          <TableRow key={row.stage}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-foreground">{formatStageLabel(row.stage)}</p>
                                <p className="text-xs text-muted-foreground">{row.stage}</p>
                              </div>
                            </TableCell>
                            <TableCell><Input value={row.meta} onChange={(event) => updateStageMapField(row.stage, 'meta', event.target.value)} /></TableCell>
                            <TableCell><Input value={row.google_ads} onChange={(event) => updateStageMapField(row.stage, 'google_ads', event.target.value)} /></TableCell>
                            <TableCell><Input value={row.ga4} onChange={(event) => updateStageMapField(row.stage, 'ga4', event.target.value)} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="gap-2" onClick={() => void saveStageMap()} disabled={savingStageMap}>{savingStageMap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar mapeamento</Button>
                    <Button variant="outline" onClick={restoreDefaultStageMap}>Restaurar padrão</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="gatilhos" className="space-y-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Novo gatilho de atribuição</CardTitle>
                  <CardDescription>Crie regras para inferir canal e campanha com base nas mensagens recebidas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2 xl:col-span-2">
                      <Label>Texto</Label>
                      <Input value={trigger.trigger_text} onChange={(event) => setTrigger((current) => ({ ...current, trigger_text: event.target.value }))} placeholder="Ex: Quero orçamento" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de correspondência</Label>
                      <Select value={trigger.match_type} onValueChange={(value) => setTrigger((current) => ({ ...current, match_type: value as TriggerRow['match_type'] }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {MATCH_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Canal inferido</Label>
                      <Select value={trigger.inferred_channel} onValueChange={(value) => setTrigger((current) => ({ ...current, inferred_channel: value }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {CHANNEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nome da campanha (opcional)</Label>
                      <Input value={trigger.campaign_name} onChange={(event) => setTrigger((current) => ({ ...current, campaign_name: event.target.value }))} placeholder="Ex: Meta - Outubro" />
                    </div>
                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Input type="number" value={trigger.priority} onChange={(event) => setTrigger((current) => ({ ...current, priority: Number(event.target.value || 100) }))} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                      <Switch checked={trigger.is_active} onCheckedChange={(value) => setTrigger((current) => ({ ...current, is_active: value }))} />
                      <span className="text-sm">Ativo</span>
                    </label>
                    <Button className="gap-2" onClick={() => void saveTrigger()} disabled={savingTrigger}>
                      {savingTrigger ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editingTriggerId ? 'Atualizar gatilho' : 'Salvar gatilho'}
                    </Button>
                    {editingTriggerId && (
                      <Button variant="outline" onClick={() => { setEditingTriggerId(null); setTrigger(DEFAULT_TRIGGER); }}>
                        Cancelar edição
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Gatilhos cadastrados</CardTitle>
                  <CardDescription>Edite ou remova gatilhos existentes para refinar a inferência de canal.</CardDescription>
                </CardHeader>
                <CardContent>
                  {triggers.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-background p-10 text-center">
                      <Webhook className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="font-medium">Nenhum gatilho criado ainda</p>
                      <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro gatilho para começar a classificar origens automaticamente.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {triggers.map((row) => (
                        <div key={row.id} className="rounded-xl border bg-background p-4 shadow-sm">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">{row.trigger_text}</p>
                              <p className="text-xs text-muted-foreground">
                                Canal: {formatChannel(row.inferred_channel)}{row.campaign_name ? ` | Campanha: ${row.campaign_name}` : ''}
                              </p>
                            </div>
                            <Badge variant={row.is_active ? 'default' : 'outline'}>{row.is_active ? 'Ativo' : 'Inativo'}</Badge>
                          </div>
                          <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">{formatMatchType(row.match_type)}</Badge>
                            <Badge variant="secondary">Prioridade {row.priority}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTrigger({
                                  trigger_text: row.trigger_text,
                                  match_type: row.match_type,
                                  inferred_channel: row.inferred_channel,
                                  campaign_name: row.campaign_name || '',
                                  priority: row.priority,
                                  is_active: row.is_active,
                                });
                                setEditingTriggerId(row.id);
                              }}
                            >
                              Editar
                            </Button>
                            <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => void deleteTrigger(row.id)} disabled={deletingTriggerId === row.id}>
                              {deletingTriggerId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Excluir
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="entregas" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Enviados</p><p className="mt-2 text-2xl font-bold text-emerald-600">{summary.sent}</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Pendentes</p><p className="mt-2 text-2xl font-bold text-amber-600">{summary.pending}</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Falhos</p><p className="mt-2 text-2xl font-bold text-destructive">{summary.failed}</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Ignorados</p><p className="mt-2 text-2xl font-bold text-foreground/78">{summary.skipped}</p></CardContent></Card>
              </div>

              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Fila de entregas</CardTitle>
                      <CardDescription>Histórico de eventos enviados para plataformas de anúncios e analytics.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={String(periodDays)} onValueChange={(value) => setPeriodDays(Number(value))}>
                        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Período" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Últimos 7 dias</SelectItem>
                          <SelectItem value="30">Últimos 30 dias</SelectItem>
                          <SelectItem value="90">Últimos 90 dias</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" className="gap-2" onClick={() => void loadDeliveries()} disabled={loadingDeliveries}>
                        <RefreshCw className={cn('h-4 w-4', loadingDeliveries && 'animate-spin')} /> Atualizar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingDeliveries ? (
                    <div className="flex items-center justify-center gap-3 py-16"><Loader2 className="h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Carregando entregas...</p></div>
                  ) : deliveries.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-background p-10 text-center">
                      <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="font-medium">Nenhuma entrega encontrada neste período</p>
                      <p className="mt-1 text-sm text-muted-foreground">Assim que os eventos forem processados, eles aparecerão aqui com status e tentativas.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Plataforma</TableHead><TableHead>Status</TableHead><TableHead>Evento</TableHead><TableHead>Etapa</TableHead><TableHead>Tentativas</TableHead><TableHead>Próxima</TableHead><TableHead>Erro</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deliveries.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{formatPlatform(row.platform)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn('border-0', row.status === 'sent' && 'bg-emerald-500/10 text-emerald-700', row.status === 'failed' && 'bg-destructive/10 text-destructive', (row.status === 'pending' || row.status === 'processing') && 'bg-amber-500/10 text-amber-700', (row.status === 'skipped' || row.status === 'disabled') && 'bg-muted text-muted-foreground')}>
                                  {row.status === 'sent' && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                                  {(row.status === 'pending' || row.status === 'processing') && <Clock3 className="mr-1 h-3.5 w-3.5" />}
                                  {(row.status === 'failed' || row.status === 'skipped' || row.status === 'disabled') && <AlertCircle className="mr-1 h-3.5 w-3.5" />}
                                  {formatDeliveryStatus(row.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>{row.conversion_event?.event_name || '-'}</TableCell>
                              <TableCell>{row.conversion_event?.crm_stage ? formatStageLabel(row.conversion_event.crm_stage) : '-'}</TableCell>
                              <TableCell>{row.attempt_count}</TableCell>
                              <TableCell>{formatDateTime(row.next_attempt_at)}</TableCell>
                              <TableCell>{row.last_error ? <span className="line-clamp-2 text-xs text-destructive">{row.last_error}</span> : '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ScrollArea>
  );
}

