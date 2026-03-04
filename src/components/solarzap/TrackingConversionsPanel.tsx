import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Save, Trash2, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { buildUniversalAttributionSnippet } from '@/lib/tracking/snippet';
import { getDefaultStageEventMap, type StageEventMap, type StageEventMapEntry } from '@/lib/tracking/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

type DeliveryRow = {
  id: string;
  platform: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  conversion_event: { event_name: string | null; crm_stage: string | null } | null;
};

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

const DEFAULT_TRIGGER = {
  trigger_text: '',
  match_type: 'contains' as TriggerRow['match_type'],
  inferred_channel: 'google_ads',
  campaign_name: '',
  priority: 100,
  is_active: true,
};

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

function validStageMap(input: unknown): input is StageEventMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return Object.values(input as Record<string, unknown>).every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const typed = row as Partial<StageEventMapEntry>;
    return typeof typed.event_key === 'string' && typed.event_key.trim().length > 0;
  });
}

export function TrackingConversionsPanel() {
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<TrackingSettingsForm>(DEFAULT_SETTINGS);
  const [forms, setForms] = useState<PlatformFormState>(DEFAULT_FORMS);
  const [savingPlatform, setSavingPlatform] = useState<'meta' | 'google_ads' | 'ga4' | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<'meta' | 'google_ads' | 'ga4' | null>(null);
  const [trigger, setTrigger] = useState(DEFAULT_TRIGGER);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [periodDays, setPeriodDays] = useState(30);
  const [stageMapText, setStageMapText] = useState(JSON.stringify(getDefaultStageEventMap(), null, 2));
  const snippet = useMemo(() => buildUniversalAttributionSnippet(), []);
  const webhookEndpoint = `${import.meta.env.VITE_SUPABASE_URL || '<SUPABASE_URL>'}/functions/v1/attribution-webhook`;

  const copy = useCallback(async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error('Falha ao copiar.');
    }
  }, []);

  const loadPanel = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
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
          .select('platform, enabled, meta_pixel_id, meta_test_event_code, google_mcc_id, google_customer_id, google_conversion_action_id, google_client_id, ga4_measurement_id')
          .eq('org_id', orgId),
        supabase
          .from('ad_trigger_messages')
          .select('id, trigger_text, match_type, inferred_channel, campaign_name, priority, is_active')
          .eq('org_id', orgId)
          .order('priority', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

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
      setStageMapText(JSON.stringify(stageMap, null, 2));

      const nextForms = structuredClone(DEFAULT_FORMS);
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
        }
        if (row.platform === 'ga4') {
          nextForms.ga4.enabled = row.enabled === true;
          nextForms.ga4.ga4_measurement_id = row.ga4_measurement_id || '';
        }
      });
      setForms(nextForms);

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
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadDeliveries = useCallback(async () => {
    if (!orgId) return;
    const fromIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('conversion_deliveries')
      .select('id, platform, status, attempt_count, next_attempt_at, last_error, conversion_event:conversion_events(event_name, crm_stage)')
      .eq('org_id', orgId)
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })
      .limit(200);

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
  }, [orgId, periodDays]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  const saveSettings = useCallback(async () => {
    if (!orgId) return;
    await supabase.from('org_tracking_settings').upsert({ org_id: orgId, ...settings }, { onConflict: 'org_id' });
    toast.success('Configurações salvas.');
    void loadPanel();
  }, [loadPanel, orgId, settings]);

  const savePlatform = useCallback(
    async (platform: 'meta' | 'google_ads' | 'ga4') => {
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
        toast.success(`Credenciais de ${platform} salvas.`);
        void loadPanel();
      } catch (error) {
        console.error(error);
        toast.error(`Falha ao salvar ${platform}.`);
      } finally {
        setSavingPlatform(null);
      }
    },
    [forms, loadPanel, orgId],
  );

  const testPlatform = useCallback(
    async (platform: 'meta' | 'google_ads' | 'ga4') => {
      if (!orgId) return;
      setTestingPlatform(platform);
      try {
        const { data, error } = await supabase.functions.invoke('tracking-credentials', {
          body: { action: 'test_platform_connection', org_id: orgId, platform, validate_only: settings.google_validate_only },
        });
        if (error || !data?.success) throw new Error(error?.message || data?.error || 'test_failed');
        toast.success(`Conexão ${platform} validada.`);
      } catch {
        toast.error(`Falha no teste ${platform}.`);
      } finally {
        setTestingPlatform(null);
      }
    },
    [orgId, settings.google_validate_only],
  );

  const saveTrigger = useCallback(async () => {
    if (!orgId || !trigger.trigger_text || !trigger.inferred_channel) return;
    const payload = { org_id: orgId, ...trigger, campaign_name: trigger.campaign_name || null };
    if (editingTriggerId) {
      await supabase.from('ad_trigger_messages').update(payload).eq('id', editingTriggerId).eq('org_id', orgId);
    } else {
      await supabase.from('ad_trigger_messages').insert(payload);
    }
    setTrigger(DEFAULT_TRIGGER);
    setEditingTriggerId(null);
    toast.success('Gatilho salvo.');
    void loadPanel();
  }, [editingTriggerId, loadPanel, orgId, trigger]);

  const summary = useMemo(
    () => deliveries.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {} as Record<string, number>),
    [deliveries],
  );

  if (!orgId) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Tracking & Conversões</CardTitle>
            <CardDescription>Chaves, plataformas, gatilhos, mapeamento e dashboard de entregas.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void loadPanel()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="flex items-center justify-between rounded border p-3"><span className="text-sm">Tracking</span><Switch checked={settings.tracking_enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, tracking_enabled: v }))} /></label>
          <label className="flex items-center justify-between rounded border p-3"><span className="text-sm">Auto atribuição</span><Switch checked={settings.auto_channel_attribution} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_channel_attribution: v }))} /></label>
          <label className="flex items-center justify-between rounded border p-3"><span className="text-sm">Force overwrite canal</span><Switch checked={settings.force_channel_overwrite} onCheckedChange={(v) => setSettings((s) => ({ ...s, force_channel_overwrite: v }))} /></label>
          <label className="flex items-center justify-between rounded border p-3"><span className="text-sm">Google validate_only</span><Switch checked={settings.google_validate_only} onCheckedChange={(v) => setSettings((s) => ({ ...s, google_validate_only: v }))} /></label>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-40"><div className="text-xs text-muted-foreground mb-1">Rate/min</div><Input type="number" value={settings.rate_limit_per_minute} onChange={(e) => setSettings((s) => ({ ...s, rate_limit_per_minute: Number(e.target.value || 60) }))} /></div>
          <Button className="gap-1.5" onClick={() => void saveSettings()}><Save className="w-3.5 h-3.5" />Salvar</Button>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Webhook e chave pública</CardTitle></CardHeader><CardContent className="space-y-2">
            <div className="flex items-center gap-2"><Input value={webhookEndpoint} readOnly className="font-mono text-xs" /><Button variant="outline" size="sm" onClick={() => void copy(webhookEndpoint, 'Endpoint copiado')}><Copy className="w-3.5 h-3.5" /></Button></div>
            <Input value={settings.webhook_public_key || 'Não gerada'} readOnly className="font-mono text-xs" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={async () => { const { data } = await supabase.rpc('tracking_generate_public_org_key'); if (data) { const key = String(data); setSettings((s) => ({ ...s, webhook_public_key: key })); await supabase.from('org_tracking_settings').upsert({ org_id: orgId, webhook_public_key: key }, { onConflict: 'org_id' }); toast.success('Chave gerada.'); } }}><WandSparkles className="w-3.5 h-3.5 mr-1" />Gerar</Button>
              <Button variant="outline" onClick={async () => { await supabase.from('org_tracking_settings').upsert({ org_id: orgId, webhook_public_key: null }, { onConflict: 'org_id' }); setSettings((s) => ({ ...s, webhook_public_key: null })); toast.success('Chave revogada.'); }}>Revogar</Button>
            </div>
            <Textarea value={snippet} readOnly className="min-h-[170px] font-mono text-[11px]" />
            <Button variant="outline" onClick={() => void copy(snippet, 'Snippet copiado')}>Copiar snippet</Button>
          </CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Stage event map</CardTitle></CardHeader><CardContent className="space-y-2">
            <Textarea value={stageMapText} onChange={(e) => setStageMapText(e.target.value)} className="min-h-[260px] font-mono text-[11px]" />
            <div className="flex gap-2">
              <Button onClick={async () => { try { const parsed = JSON.parse(stageMapText); if (!validStageMap(parsed)) throw new Error(); const map = parseStageMap(parsed); setSettings((s) => ({ ...s, stage_event_map: map })); await supabase.from('org_tracking_settings').upsert({ org_id: orgId, stage_event_map: map }, { onConflict: 'org_id' }); toast.success('Mapeamento salvo.'); } catch { toast.error('JSON inválido.'); } }}>Salvar map</Button>
              <Button variant="outline" onClick={() => { const defaults = getDefaultStageEventMap(); setStageMapText(JSON.stringify(defaults, null, 2)); }}>Restaurar</Button>
            </div>
          </CardContent></Card>
        </div>
        <div className="grid lg:grid-cols-3 gap-3">
          {(['meta', 'google_ads', 'ga4'] as const).map((platform) => (
            <Card key={platform}><CardHeader className="pb-3"><CardTitle className="text-sm">{platform}</CardTitle></CardHeader><CardContent className="space-y-2">
              <label className="flex items-center justify-between rounded border p-2"><span className="text-sm">Habilitado</span><Switch checked={forms[platform].enabled} onCheckedChange={(v) => setForms((f) => ({ ...f, [platform]: { ...f[platform], enabled: v } }))} /></label>
              <Textarea
                value={JSON.stringify(forms[platform], null, 2)}
                onChange={(e) => {
                  try {
                    const next = JSON.parse(e.target.value);
                    setForms((f) => ({ ...f, [platform]: { ...f[platform], ...next } }));
                  } catch {
                    // Ignore partial JSON while user is typing.
                  }
                }}
                className="min-h-[140px] font-mono text-[11px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void savePlatform(platform)} disabled={savingPlatform === platform}>Salvar</Button>
                <Button variant="outline" size="sm" onClick={() => void testPlatform(platform)} disabled={testingPlatform === platform}>Testar</Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Mensagens gatilho (CRUD)</CardTitle></CardHeader><CardContent className="space-y-2">
          <div className="grid md:grid-cols-6 gap-2">
            <Input className="md:col-span-2" placeholder="trigger_text" value={trigger.trigger_text} onChange={(e) => setTrigger((t) => ({ ...t, trigger_text: e.target.value }))} />
            <select className="h-10 rounded-md border px-3 text-sm bg-background" value={trigger.match_type} onChange={(e) => setTrigger((t) => ({ ...t, match_type: e.target.value as TriggerRow['match_type'] }))}><option value="contains">contains</option><option value="exact">exact</option><option value="starts_with">starts_with</option><option value="regex">regex</option></select>
            <Input placeholder="inferred_channel" value={trigger.inferred_channel} onChange={(e) => setTrigger((t) => ({ ...t, inferred_channel: e.target.value }))} />
            <Input placeholder="campaign_name" value={trigger.campaign_name} onChange={(e) => setTrigger((t) => ({ ...t, campaign_name: e.target.value }))} />
            <Input type="number" placeholder="priority" value={trigger.priority} onChange={(e) => setTrigger((t) => ({ ...t, priority: Number(e.target.value || 100) }))} />
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 rounded border px-3"><Switch checked={trigger.is_active} onCheckedChange={(v) => setTrigger((t) => ({ ...t, is_active: v }))} /><span className="text-sm">Ativo</span></label>
            <Button onClick={() => void saveTrigger()}>{editingTriggerId ? 'Atualizar' : 'Criar'}</Button>
            {editingTriggerId && <Button variant="outline" onClick={() => { setEditingTriggerId(null); setTrigger(DEFAULT_TRIGGER); }}>Cancelar</Button>}
          </div>
          <div className="space-y-2">
            {triggers.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 rounded border p-2">
                <div><Badge variant={row.is_active ? 'default' : 'outline'}>{row.match_type}</Badge> <span className="text-sm font-medium">{row.trigger_text}</span><div className="text-xs text-muted-foreground">canal={row.inferred_channel} | prioridade={row.priority}</div></div>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setEditingTriggerId(row.id); setTrigger({ trigger_text: row.trigger_text, match_type: row.match_type, inferred_channel: row.inferred_channel, campaign_name: row.campaign_name || '', priority: row.priority, is_active: row.is_active }); }}>Editar</Button><Button variant="outline" size="sm" className="text-destructive" onClick={async () => { await supabase.from('ad_trigger_messages').delete().eq('id', row.id).eq('org_id', orgId); toast.success('Gatilho removido.'); void loadPanel(); }}><Trash2 className="w-3.5 h-3.5" /></Button></div>
              </div>
            ))}
          </div>
        </CardContent></Card>
        <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">Dashboard de deliveries</CardTitle><select className="h-9 rounded-md border px-3 text-sm bg-background" value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}><option value={7}>7d</option><option value={30}>30d</option><option value={90}>90d</option></select></div></CardHeader><CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">{Object.entries(summary).map(([status, count]) => <Badge key={status} variant="secondary">{status}: {count}</Badge>)}</div>
          <div className="max-h-[260px] overflow-auto rounded border">
            <table className="w-full text-sm"><thead className="bg-muted/50 sticky top-0"><tr><th className="text-left px-2 py-2">Platform</th><th className="text-left px-2 py-2">Status</th><th className="text-left px-2 py-2">Evento</th><th className="text-left px-2 py-2">Etapa</th><th className="text-left px-2 py-2">Tent.</th><th className="text-left px-2 py-2">Próxima</th><th className="text-left px-2 py-2">Erro</th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id} className="border-t"><td className="px-2 py-2">{row.platform}</td><td className="px-2 py-2">{row.status}</td><td className="px-2 py-2">{row.conversion_event?.event_name || '-'}</td><td className="px-2 py-2">{row.conversion_event?.crm_stage || '-'}</td><td className="px-2 py-2">{row.attempt_count}</td><td className="px-2 py-2">{row.next_attempt_at ? new Date(row.next_attempt_at).toLocaleString('pt-BR') : '-'}</td><td className="px-2 py-2">{row.last_error || '-'}</td></tr>)}{deliveries.length < 1 && <tr><td className="px-2 py-3 text-muted-foreground" colSpan={7}>Sem deliveries no período.</td></tr>}</tbody></table>
          </div>
        </CardContent></Card>
      </CardContent>
    </Card>
  );
}
