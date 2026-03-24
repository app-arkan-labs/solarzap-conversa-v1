import { useState } from 'react';
import {
  AlertCircle,
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTrackingData } from './tracking/useTrackingData';
import { SecretField } from './tracking/SecretField';
import {
  statusLabel,
  statusColor,
  formatStageLabel,
  formatPlatform,
  formatDeliveryStatus,
  formatDateTime,
  formatMatchType,
  formatChannel,
} from './tracking/formatters';
import { DEFAULT_TRIGGER, MATCH_TYPE_OPTIONS, CHANNEL_OPTIONS } from './tracking/constants';
import type { TriggerRow } from './tracking/types';

export function TrackingView() {
  const isMobileViewport = useMobileViewport();
  const {
    orgId, loading, refreshing, loadingDeliveries, savingSettings, savingStageMap,
    generatingKey, revokingKey, settings, setSettings, forms, setForms,
    savingPlatform, testingPlatform, trigger, setTrigger,
    editingTriggerId, setEditingTriggerId, savingTrigger, deletingTriggerId,
    triggers, deliveries, periodDays, setPeriodDays,
    googleAdsConnected, googleAdsEmail, googleAdsConnecting, googleAdsDisconnecting,
    mccList, customerList, conversionActions,
    loadingMcc, loadingCustomers, loadingConversions, savingSelection,
    secretVisibility, snippet, webhookEndpoint, stageRows, summary, platformStatus,
    copy, loadPanel, loadDeliveries, connectGoogleAds, disconnectGoogleAds,
    loadAccessibleCustomers, loadAccountHierarchy, loadConversionActions,
    saveAdsSelection, saveSettings, savePlatform, testPlatform,
    saveTrigger, deleteTrigger, generatePublicKey, revokePublicKey,
    updateStageMapField, saveStageMap, restoreDefaultStageMap, toggleSecretField,
    setCustomerList, setConversionActions,
  } = useTrackingData();

  const [scriptVisible, setScriptVisible] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
  const [activationChecklist, setActivationChecklist] = useState({
    endpointCopied: false,
    scriptInstalled: false,
    formConnected: false,
    headerSent: false,
  });

  const hasPublicKey = Boolean(settings.webhook_public_key);
  const quickChecklistDoneCount = [
    hasPublicKey,
    activationChecklist.endpointCopied,
    activationChecklist.formConnected,
    activationChecklist.headerSent,
  ].filter(Boolean).length;

  const setChecklistItem = (
    key: 'endpointCopied' | 'scriptInstalled' | 'formConnected' | 'headerSent',
    value: boolean,
  ) => {
    setActivationChecklist((current) => ({ ...current, [key]: value }));
  };

  const handleCopyEndpoint = async () => {
    const copied = await copy(webhookEndpoint, 'Endpoint copiado');
    if (copied) setChecklistItem('endpointCopied', true);
  };

  const handleCopyScript = async () => {
    const copied = await copy(snippet, 'Script copiado');
    if (copied) setScriptVisible(true);
  };

  if (!orgId) return null;

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col overflow-hidden bg-muted/30">
      <PageHeader
        title="Tracking & Conversões"
        subtitle="Gerencie atribuição, plataformas, gatilhos e monitoramento de entregas."
        icon={Activity}
        actionContent={
          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
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
        mobileToolbar={
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'border-0 px-2 py-1 text-[10px] font-semibold',
                settings.tracking_enabled
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {settings.tracking_enabled ? 'Ativo' : 'Inativo'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                void loadPanel(true);
                void loadDeliveries();
              }}
              disabled={loading || refreshing || loadingDeliveries}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (loading || refreshing || loadingDeliveries) && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="min-h-full bg-muted/30">
        <div className="w-full space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          <Tabs defaultValue="configuracao" className="space-y-4">
            <div className="relative">
            <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList className="flex h-auto min-w-full flex-nowrap justify-start gap-1 rounded-xl border bg-background p-1 shadow-sm sm:flex-wrap">
                <TabsTrigger value="configuracao" className="shrink-0">{isMobileViewport ? 'Config' : 'Configuração'}</TabsTrigger>
                <TabsTrigger value="regras" className="shrink-0">Regras</TabsTrigger>
                <TabsTrigger value="monitoramento" className="shrink-0">{isMobileViewport ? 'Fila' : 'Monitoramento'}</TabsTrigger>
              </TabsList>
            </div>
            {isMobileViewport && <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-muted/80 to-transparent rounded-r-xl sm:hidden" />}
            </div>

            {/* ─── ABA CONFIGURAÇÃO ─── */}
            <TabsContent value="configuracao" className="space-y-6">

              {/* Mini-badges de status das plataformas */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn('border-0 text-xs', statusColor(platformStatus.meta))}>{statusLabel(platformStatus.meta)} — Meta CAPI</Badge>
                <Badge variant="outline" className={cn('border-0 text-xs', statusColor(platformStatus.google))}>{statusLabel(platformStatus.google)} — Google Ads</Badge>
                <Badge variant="outline" className={cn('border-0 text-xs', statusColor(platformStatus.ga4))}>{statusLabel(platformStatus.ga4)} — GA4</Badge>
              </div>

              {/* Seção 1: Comportamento do Tracking (ex-aba Geral) */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Comportamento do Tracking</CardTitle>
                  <CardDescription>Controle o comportamento global do tracking e da atribuição automática.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Tracking ativado</span>
                        <Switch checked={settings.tracking_enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, tracking_enabled: v }))} />
                      </div>
                      <p className="text-xs text-muted-foreground">Liga ou desliga todo o sistema de tracking. Quando desativado, nenhuma conversão é enviada.</p>
                    </label>
                    <label className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Auto-atribuição</span>
                        <Switch checked={settings.auto_channel_attribution} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_channel_attribution: v }))} />
                      </div>
                      <p className="text-xs text-muted-foreground">Infere automaticamente o canal de origem (Google, Meta, etc.) pelo UTM/Click ID da mensagem.</p>
                    </label>
                    <label className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Forçar overwrite</span>
                        <Switch checked={settings.force_channel_overwrite} onCheckedChange={(v) => setSettings((s) => ({ ...s, force_channel_overwrite: v }))} />
                      </div>
                      <p className="text-xs text-muted-foreground">Reescreve o canal de origem mesmo que o lead já tenha um canal atribuído anteriormente.</p>
                    </label>
                    <label className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Google validate-only</span>
                        <Switch checked={settings.google_validate_only} onCheckedChange={(v) => setSettings((s) => ({ ...s, google_validate_only: v }))} />
                      </div>
                      <p className="text-xs text-muted-foreground">Eventos Google Ads enviados em modo de validação (não contam como conversão real). Útil para testar.</p>
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
                      <p className="text-xs text-muted-foreground">Limite máximo de requisições de webhook por minuto. Protege contra spam/bots.</p>
                    </div>
                    <Button className="gap-2" onClick={() => void saveSettings()} disabled={savingSettings}>
                      {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar configurações
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Para envio real no Google Ads, o lead precisa ter <code className="px-1 bg-muted rounded">gclid</code>, <code className="px-1 bg-muted rounded">gbraid</code> ou <code className="px-1 bg-muted rounded">wbraid</code>. Sem isso, o evento pode ser validado, mas não enviado como conversão offline.</p>
                </CardContent>
              </Card>

              {/* Seção 2: Plataformas de Anúncios (ex-aba Plataformas) */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Plataformas de Anúncios</CardTitle>
                  <CardDescription>Configure as plataformas que receberão eventos de conversão.</CardDescription>
                </CardHeader>
                <CardContent>
              <div className="grid gap-4 xl:grid-cols-3">
                {/* Meta CAPI card */}
                <Card className="border shadow-none">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Meta CAPI</CardTitle>
                        <CardDescription>Envio de conversões para Meta Ads.</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('border-0 text-xs', statusColor(platformStatus.meta))}>
                        {statusLabel(platformStatus.meta)}
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

                {/* Google Ads card */}
                <Card className="border shadow-none">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Google Ads</CardTitle>
                        <CardDescription>Conversões offline para Google Ads.</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('border-0 text-xs', statusColor(platformStatus.google))}>
                        {statusLabel(platformStatus.google)}
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

                {/* GA4 card */}
                <Card className="border shadow-none">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">GA4</CardTitle>
                        <CardDescription>Eventos para Google Analytics 4.</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('border-0 text-xs', statusColor(platformStatus.ga4))}>
                        {statusLabel(platformStatus.ga4)}
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
                </CardContent>
              </Card>

              {/* Seção 3: Integração com Site */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Integração com Site</CardTitle>
                  <CardDescription>Organize a integração em etapas claras para receber leads do seu formulário ou CRM.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <p className="mb-2 text-sm font-semibold text-foreground">Integração simples (Recomendada)</p>
                    <p className="text-xs text-muted-foreground">
                      Se seu formulário ou CRM já envia webhook, você só precisa apontar esse envio para o endpoint do SolarZap
                      e incluir a chave no header.
                    </p>
                    <div className="mt-3 rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground">
                      Formulário/CRM -&gt; Webhook SolarZap -&gt; Lead recebido e atribuído
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
                      <h4 className="text-sm font-semibold">Gerar chave de integração</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">Essa chave autoriza o envio dos dados do seu sistema para o SolarZap.</p>
                    {hasPublicKey ? (
                      <>
                        <Badge variant="outline" className="w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                          Chave ativa
                        </Badge>
                        <Input value={settings.webhook_public_key || ''} readOnly className="font-mono text-xs" />
                        <p className="text-xs text-muted-foreground">Use essa chave no header da requisição.</p>
                      </>
                    ) : (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <p className="text-sm font-medium text-foreground">Nenhuma chave gerada</p>
                        <p className="text-xs text-muted-foreground">Gere uma chave para habilitar o recebimento de leads.</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="gap-2" onClick={() => void generatePublicKey()} disabled={generatingKey}>
                        {generatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                        Gerar chave
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() => setConfirmRevokeOpen(true)}
                        disabled={!hasPublicKey || revokingKey}
                      >
                        {revokingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Revogar chave
                      </Button>
                    </div>
                    {(generatingKey || revokingKey) && (
                      <p className="text-xs text-muted-foreground">Atualizando chave de integração...</p>
                    )}
                  </div>

                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
                      <h4 className="text-sm font-semibold">Copiar endpoint do SolarZap</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Copie este endpoint e cole no campo de webhook de saída do seu CRM ou formulário.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={webhookEndpoint} readOnly className="font-mono text-xs" />
                      <Button type="button" variant="outline" className="gap-2 sm:self-start" onClick={() => void handleCopyEndpoint()}>
                        <Copy className="h-4 w-4" />
                        Copiar endpoint
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Procure no seu sistema por campos como: <strong>Webhook URL</strong>, <strong>URL de destino</strong> ou <strong>POST URL</strong>.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
                      <h4 className="text-sm font-semibold">Configurar envio no CRM/Formulário</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      No webhook de saída, envie os dados do lead para o endpoint acima.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      <li>Campos do lead: nome, telefone e e-mail.</li>
                      <li>Header obrigatório de autenticação.</li>
                    </ul>
                    <div className="rounded-lg border bg-muted/30 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Header obrigatório</p>
                      <code className="mt-1 inline-block rounded bg-background px-2 py-1 font-mono text-xs">x-szap-org-key</code>
                      <p className="mt-2 text-xs text-muted-foreground">Sem esse header, o SolarZap não aceita a requisição.</p>
                    </div>
                    <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700">
                      <AlertCircle className="h-4 w-4 !text-amber-600" />
                      <AlertDescription className="text-xs">
                        Formulários HTML nativos não enviam headers customizados. Para isso, use fetch, XHR ou um backend intermediário.
                      </AlertDescription>
                    </Alert>
                    <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <Checkbox
                        checked={activationChecklist.formConnected}
                        onCheckedChange={(checked) => setChecklistItem('formConnected', checked === true)}
                      />
                      <span className="text-xs text-foreground">Webhook de saída configurado no meu CRM/Formulário</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <Checkbox
                        checked={activationChecklist.headerSent}
                        onCheckedChange={(checked) => setChecklistItem('headerSent', checked === true)}
                      />
                      <span className="text-xs text-foreground">Header x-szap-org-key configurado no envio</span>
                    </label>
                  </div>

                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">Checklist rápido de ativação</h4>
                      <Badge variant="outline" className="text-xs">{quickChecklistDoneCount}/4 concluído</Badge>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <Checkbox checked={hasPublicKey} disabled />
                        <span className="text-xs text-foreground">Chave gerada</span>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <Checkbox
                          checked={activationChecklist.endpointCopied}
                          onCheckedChange={(checked) => setChecklistItem('endpointCopied', checked === true)}
                        />
                        <span className="text-xs text-foreground">Endpoint copiado</span>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <Checkbox checked={activationChecklist.formConnected} disabled />
                        <span className="text-xs text-foreground">Webhook de saída configurado</span>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <Checkbox checked={activationChecklist.headerSent} disabled />
                        <span className="text-xs text-foreground">Header x-szap-org-key configurado</span>
                      </label>
                    </div>
                  </div>

                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Atribuição avançada (Opcional)</p>
                        <p className="text-xs text-muted-foreground">
                          Use esta etapa só se você quer capturar UTMs e click IDs direto no site antes do envio do formulário.
                        </p>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button type="button" variant="outline" className="gap-2">
                          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {advancedOpen ? 'Ocultar avançado' : 'Mostrar avançado'}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="mt-3 space-y-3">
                      <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700">
                        <AlertCircle className="h-4 w-4 !text-amber-600" />
                        <AlertTitle>Importante</AlertTitle>
                        <AlertDescription className="text-xs">
                          O script de captura não envia os dados sozinho. Ele só prepara as informações para o formulário enviar.
                        </AlertDescription>
                      </Alert>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="gap-2" onClick={() => void handleCopyScript()}>
                          <Copy className="h-4 w-4" />
                          Copiar script
                        </Button>
                        <Button type="button" variant="outline" className="gap-2" onClick={() => setScriptVisible((current) => !current)}>
                          {scriptVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {scriptVisible ? 'Ocultar script' : 'Ver script'}
                        </Button>
                      </div>
                      {scriptVisible && <Textarea value={snippet} readOnly className="min-h-[220px] font-mono text-[11px]" />}
                      <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <Checkbox
                          checked={activationChecklist.scriptInstalled}
                          onCheckedChange={(checked) => setChecklistItem('scriptInstalled', checked === true)}
                        />
                        <span className="text-xs text-foreground">Script instalado no site (opcional)</span>
                      </label>
                    </CollapsibleContent>
                  </Collapsible>

                  <AlertDialog open={confirmRevokeOpen} onOpenChange={setConfirmRevokeOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revogar chave de integração?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso pode interromper o envio de leads do seu site. Deseja continuar?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={revokingKey}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={revokingKey}
                          onClick={() => {
                            setConfirmRevokeOpen(false);
                            void revokePublicKey();
                          }}
                        >
                          {revokingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Revogar chave
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── ABA REGRAS ─── */}
            <TabsContent value="regras" className="space-y-6">

              {/* Seção 1: Mapeamento de Etapas */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Mapeamento de etapas do CRM</CardTitle>
                  <CardDescription>Quando um lead muda de etapa no CRM, o sistema envia um evento de conversão com o nome configurado abaixo para cada plataforma ativa. Deixe o campo vazio para não enviar evento naquela etapa.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto rounded-xl border bg-background">
                    <Table className="min-w-[760px]">
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

              {/* Seção 2: Gatilhos de Atribuição */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Gatilhos de Atribuição</CardTitle>
                  <CardDescription>Gatilhos permitem inferir o canal de origem com base no texto da mensagem recebida. Exemplo: se a mensagem contém &quot;vi seu anúncio no Instagram&quot;, o sistema atribui o canal como Instagram.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">Regex inválida é ignorada pelo backend sem quebrar o fluxo, mas deve ser evitada. Valide antes de salvar.</p>
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

            {/* ─── ABA MONITORAMENTO ─── */}
            <TabsContent value="monitoramento" className="space-y-4">
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
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <Select value={String(periodDays)} onValueChange={(value) => setPeriodDays(Number(value))}>
                        <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Período" /></SelectTrigger>
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
                      <p className="font-medium">Nenhuma entrega encontrada</p>
                      <p className="mt-1 text-sm text-muted-foreground">Entregas aparecem quando leads mudam de etapa e as plataformas (Meta, Google Ads, GA4) estão configuradas e ativas.</p>
                    </div>
                  ) : (
                    isMobileViewport ? (
                      <div className="grid gap-3">
                        {deliveries.map((row) => (
                          <div key={row.id} className="rounded-xl border bg-background p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{formatPlatform(row.platform)}</span>
                              <Badge variant="outline" className={cn('border-0 text-xs', row.status === 'sent' && 'bg-emerald-500/10 text-emerald-700', row.status === 'failed' && 'bg-destructive/10 text-destructive', (row.status === 'pending' || row.status === 'processing') && 'bg-amber-500/10 text-amber-700', (row.status === 'skipped' || row.status === 'disabled') && 'bg-muted text-muted-foreground')}>
                                {formatDeliveryStatus(row.status)}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Evento: {row.conversion_event?.event_name || '-'}</span>
                              <span>Etapa: {row.conversion_event?.crm_stage ? formatStageLabel(row.conversion_event.crm_stage) : '-'}</span>
                              <span>Tentativas: {row.attempt_count}</span>
                              <span>Próxima: {formatDateTime(row.next_attempt_at)}</span>
                            </div>
                            {row.last_error && <p className="text-xs text-destructive line-clamp-2 break-all">{row.last_error}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div className="overflow-x-auto rounded-xl border bg-background">
                      <p className="px-3 py-1.5 text-[10px] text-muted-foreground md:hidden">Arraste para ver mais colunas →</p>
                      <Table className="min-w-[980px]">
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
                    )
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
    </div>
  );
}

