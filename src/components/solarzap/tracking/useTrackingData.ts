import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { buildUniversalAttributionSnippet } from '@/lib/tracking/snippet';
import { getDefaultStageEventMap, type StageEventMap } from '@/lib/tracking/constants';
import { parseStageMap, formatPlatform } from './formatters';
import { DEFAULT_SETTINGS, DEFAULT_FORMS, DEFAULT_TRIGGER } from './constants';
import type {
  TrackingSettingsForm,
  PlatformFormState,
  PlatformKey,
  TriggerRow,
  TriggerDraft,
  DeliveryRow,
  SecretFieldKey,
  CustomerOption,
  ConversionActionOption,
} from './types';

/** Extract the real error key from a supabase.functions.invoke result.
 *  FunctionsHttpError.context is a raw Response object whose body contains
 *  the JSON with the `error` field. We read it async, falling back gracefully. */
async function extractInvokeError(error: any, data: any, fallback: string): Promise<string> {
  // FunctionsHttpError → context is the raw Response
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch { /* body already consumed or not JSON */ }
  }
  // FunctionsFetchError (network / CORS failure)
  if (error?.name === 'FunctionsFetchError') return 'network_error';
  if (error?.message && error.message !== 'Edge Function returned a non-2xx status code') return error.message;
  if (data?.error) return String(data.error);
  return fallback;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('missing_authorization');
  return { Authorization: `Bearer ${session.access_token}` };
}

export function useTrackingData() {
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
  const [trigger, setTrigger] = useState<TriggerDraft>(DEFAULT_TRIGGER);
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
  const [mccList, setMccList] = useState<CustomerOption[]>([]);
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [conversionActions, setConversionActions] = useState<ConversionActionOption[]>([]);
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
      return true;
    } catch {
      toast.error('Não foi possível copiar. Tente novamente.');
      return false;
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
      const headers = await getAuthHeaders();
      const { data, error } = await supabase.functions.invoke('google-ads-oauth', {
        headers,
        body: { org_id: orgId },
      });
      if (error || !data?.authUrl) throw new Error(await extractInvokeError(error, data, 'failed_to_get_auth_url'));
      window.location.href = String(data.authUrl);
    } catch (error: any) {
      console.error(error);
      const msg = String(error?.message || '');
      const errorMap: Record<string, string> = {
        missing_authorization: 'Sessão expirada. Faça login novamente e tente conectar.',
        unauthenticated: 'Token de sessão inválido ou expirado. Faça logout e login novamente.',
        forbidden: 'Seu usuário não possui acesso a esta organização.',
        missing_org_id: 'Organização não identificada para iniciar OAuth.',
        missing_global_google_config: 'Configuração de Google Ads ausente no Supabase (CLIENT_ID/SECRET).',
        missing_allowed_origin: 'Configuração CORS ausente na Edge Function. Configure ALLOWED_ORIGIN.',
        origin_not_allowed: 'Origem não permitida pelo CORS. Verifique ALLOWED_ORIGIN ou ALLOW_LOCALHOST_CORS.',
        network_error: 'Erro de rede ao conectar. Verifique CORS (ALLOW_LOCALHOST_CORS) e se a Edge Function está ativa.',
        method_not_allowed: 'Método HTTP não permitido pela Edge Function.',
        failed_to_get_auth_url: 'Falha ao gerar URL de autorização do Google.',
      };
      toast.error(errorMap[msg] || 'Falha ao iniciar conexão com Google Ads. Verifique OAuth, permissões e secrets do Supabase.');
      setGoogleAdsConnecting(false);
    }
  }, [orgId]);

  const disconnectGoogleAds = useCallback(async () => {
    if (!orgId) return;
    setGoogleAdsDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      const { data, error } = await supabase.functions.invoke('tracking-credentials', {
        headers,
        body: { action: 'disconnect_google_ads', org_id: orgId },
      });
      if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'disconnect_failed'));
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
      const headers = await getAuthHeaders();
      const { data, error } = await supabase.functions.invoke('tracking-credentials', {
        headers,
        body: { action: 'list_accessible_customers', org_id: orgId },
      });
      if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'list_accessible_failed'));
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
        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          headers,
          body: { action: 'account_hierarchy', org_id: orgId, login_customer_id: loginCustomerId },
        });
        if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'account_hierarchy_failed'));
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
        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          headers,
          body: {
            action: 'list_conversion_actions',
            org_id: orgId,
            customer_id: customerId,
            login_customer_id: loginCustomerId,
          },
        });
        if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'list_conversion_actions_failed'));
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
      const headers = await getAuthHeaders();
      const { data, error } = await supabase.functions.invoke('tracking-credentials', {
        headers,
        body: {
          action: 'save_ads_selection',
          org_id: orgId,
          login_customer_id: forms.google_ads.google_mcc_id,
          customer_id: forms.google_ads.google_customer_id,
          conversion_action_id: forms.google_ads.google_conversion_action_id,
        },
      });
      if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'save_ads_selection_failed'));
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

  // ── Effects ──

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

  // ── Mutations ──

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

        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          headers,
          body: { action: 'upsert_platform_credentials', org_id: orgId, platform, enabled: forms[platform].enabled, metadata, secrets },
        });
        if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'platform_save_failed'));

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
        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          headers,
          body: { action: 'test_platform_connection', org_id: orgId, platform, validate_only: settings.google_validate_only },
        });
        if (error || !data?.success) throw new Error(await extractInvokeError(error, data, 'test_failed'));
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
      toast.success('Chave gerada com sucesso');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível gerar a chave. Tente novamente.');
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
      toast.success('Chave revogada com sucesso');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível revogar a chave. Tente novamente.');
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

  // ── Derived data ──

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

  const platformStatus = useMemo(() => {
    const meta = forms.meta.enabled
      ? forms.meta.meta_pixel_id.trim() ? 'connected' : 'incomplete'
      : 'disabled';
    const google = googleAdsConnected
      ? (forms.google_ads.google_customer_id.trim() && forms.google_ads.google_conversion_action_id.trim() ? 'connected' : 'incomplete')
      : (forms.google_ads.enabled ? 'incomplete' : 'disabled');
    const ga4 = forms.ga4.enabled
      ? forms.ga4.ga4_measurement_id.trim() ? 'connected' : 'incomplete'
      : 'disabled';
    return { meta, google, ga4 };
  }, [forms, googleAdsConnected]);

  return {
    orgId,
    loading,
    refreshing,
    loadingDeliveries,
    savingSettings,
    savingStageMap,
    generatingKey,
    revokingKey,
    settings,
    setSettings,
    forms,
    setForms,
    savingPlatform,
    testingPlatform,
    trigger,
    setTrigger,
    editingTriggerId,
    setEditingTriggerId,
    savingTrigger,
    deletingTriggerId,
    triggers,
    deliveries,
    periodDays,
    setPeriodDays,
    googleAdsConnected,
    googleAdsEmail,
    googleAdsConnecting,
    googleAdsDisconnecting,
    mccList,
    customerList,
    conversionActions,
    loadingMcc,
    loadingCustomers,
    loadingConversions,
    savingSelection,
    secretVisibility,
    snippet,
    webhookEndpoint,
    stageRows,
    summary,
    platformStatus,
    copy,
    loadPanel,
    loadDeliveries,
    connectGoogleAds,
    disconnectGoogleAds,
    loadAccessibleCustomers,
    loadAccountHierarchy,
    loadConversionActions,
    saveAdsSelection,
    saveSettings,
    savePlatform,
    testPlatform,
    saveTrigger,
    deleteTrigger,
    generatePublicKey,
    revokePublicKey,
    updateStageMapField,
    saveStageMap,
    restoreDefaultStageMap,
    toggleSecretField,
    setCustomerList,
    setConversionActions,
  };
}
