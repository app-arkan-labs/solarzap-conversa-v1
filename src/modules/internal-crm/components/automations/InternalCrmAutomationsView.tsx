import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MessageSquare,
  Phone,
  Save,
  Settings2,
  UserX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import { useInternalCrmAutomationsModule } from '@/modules/internal-crm/hooks/useInternalCrmAutomations';
import type { InternalCrmAutomationRule, InternalCrmAutomationRun } from '@/modules/internal-crm/types';

/* ──── helpers ──── */

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  lp_form_submitted: <MessageSquare className="w-5 h-5 text-sky-500" />,
  lp_form_no_schedule: <Clock className="w-5 h-5 text-amber-500" />,
  appointment_scheduled: <Calendar className="w-5 h-5 text-purple-500" />,
  appointment_no_show: <UserX className="w-5 h-5 text-red-500" />,
  appointment_done: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  deal_closed: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  deal_not_closed: <AlertTriangle className="w-5 h-5 text-orange-500" />,
  call_scheduled: <Phone className="w-5 h-5 text-indigo-500" />,
};

function formatDelay(minutes: number): string {
  if (minutes === 0) return 'Imediato';
  const abs = Math.abs(minutes);
  const suffix = minutes < 0 ? ' antes' : '';
  const prefix = minutes > 0 ? 'Após ' : '';
  if (abs < 60) return `${prefix}${abs} min${suffix}`;
  if (abs % 1440 === 0) return `${prefix}${abs / 1440} dia(s)${suffix}`;
  if (abs % 60 === 0) return `${prefix}${abs / 60}h${suffix}`;
  return `${prefix}${abs} min${suffix}`;
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Enviada', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    pending: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    processing: { label: 'Processando', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    failed: { label: 'Falhou', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    canceled: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
    skipped: { label: 'Ignorada', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  };
  const m = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <Badge className={cn('border-0 text-xs font-medium', m.cls)}>{m.label}</Badge>;
}

/* ──── AutomationCard ──── */

type RuleDraft = { isActive: boolean; template: string };

function AutomationCard({
  rule,
  draft,
  onToggle,
  onTemplateChange,
}: {
  rule: InternalCrmAutomationRule;
  draft: RuleDraft;
  onToggle: (active: boolean) => void;
  onTemplateChange: (t: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const icon = TRIGGER_ICONS[rule.trigger_event] || <Zap className="w-5 h-5 text-primary" />;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200',
        draft.isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/50',
      )}
    >
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
            draft.isActive ? 'bg-primary/10' : 'bg-muted',
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground truncate">{rule.name}</span>
            <Badge
              className={cn('border-0 text-[10px]', draft.isActive ? 'bg-primary/10 text-primary' : '')}
              variant={draft.isActive ? 'default' : 'secondary'}
            >
              {draft.isActive ? 'Ativa' : 'Inativa'}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {formatDelay(rule.delay_minutes)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rule.description}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        <Switch checked={draft.isActive} onCheckedChange={onToggle} />
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          <Label className="text-xs text-muted-foreground">
            Mensagem (variáveis: {'{{nome}}'}, {'{{data_hora}}'}, {'{{hora}}'}, {'{{link_agendamento}}'},{' '}
            {'{{link_reuniao}}'})
          </Label>
          <Textarea
            value={draft.template}
            onChange={(e) => onTemplateChange(e.target.value)}
            rows={4}
            className="resize-none text-sm"
            disabled={!draft.isActive}
            placeholder="Insira o template da mensagem..."
          />
        </div>
      )}
    </div>
  );
}

/* ──── Main View ──── */

export function InternalCrmAutomationsView() {
  const { toast } = useToast();
  const mod = useInternalCrmAutomationsModule();

  const rules = mod.rulesQuery.data?.rules || [];
  const runs = mod.runsQuery.data?.runs || [];
  const instances = mod.instancesQuery.data?.instances || [];
  const settings = mod.settingsQuery.data?.settings;
  const health = mod.healthQuery?.data;

  /* drafts */
  const [settingsDraft, setSettingsDraft] = useState({
    defaultWhatsappInstanceId: 'none',
    adminNotificationNumbers: '',
    notificationCooldownMinutes: '60',
  });
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleDraft>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSettingsDraft({
      defaultWhatsappInstanceId: settings.default_whatsapp_instance_id || 'none',
      adminNotificationNumbers: settings.admin_notification_numbers.join(', '),
      notificationCooldownMinutes: String(settings.notification_cooldown_minutes || 60),
    });
  }, [settings]);

  useEffect(() => {
    if (rules.length === 0) return;
    setRuleDrafts(
      rules.reduce<Record<string, RuleDraft>>((acc, r) => {
        acc[r.id] = { isActive: r.is_active, template: r.template || '' };
        return acc;
      }, {}),
    );
    setDirty(false);
  }, [rules]);

  const leadRules = useMemo(() => rules.filter((r) => r.channel === 'whatsapp_lead'), [rules]);
  const adminRules = useMemo(() => rules.filter((r) => r.channel === 'whatsapp_admin'), [rules]);

  function updateDraft(ruleId: string, patch: Partial<RuleDraft>) {
    setRuleDrafts((prev) => ({ ...prev, [ruleId]: { ...prev[ruleId], ...patch } }));
    setDirty(true);
  }

  /* save settings */
  async function handleSaveSettings() {
    try {
      await mod.upsertAutomationSettingsMutation.mutateAsync({
        action: 'upsert_automation_settings',
        default_whatsapp_instance_id:
          settingsDraft.defaultWhatsappInstanceId === 'none' ? null : settingsDraft.defaultWhatsappInstanceId,
        admin_notification_numbers: settingsDraft.adminNotificationNumbers
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        notification_cooldown_minutes: Number(settingsDraft.notificationCooldownMinutes || 60),
      });
      toast({ title: 'Configuração salva' });
    } catch {
      toast({ title: 'Erro ao salvar configuração', variant: 'destructive' });
    }
  }

  /* save all rule drafts */
  async function handleSaveAllRules() {
    let ok = 0;
    let fail = 0;
    for (const rule of rules) {
      const draft = ruleDrafts[rule.id];
      if (!draft) continue;
      if (draft.isActive === rule.is_active && draft.template === (rule.template || '')) continue;
      try {
        await mod.upsertAutomationRuleMutation.mutateAsync({
          action: 'upsert_automation_rule',
          automation_id: rule.id,
          automation_key: rule.automation_key,
          name: rule.name,
          description: rule.description,
          trigger_event: rule.trigger_event,
          condition: rule.condition,
          channel: rule.channel,
          delay_minutes: rule.delay_minutes,
          template: draft.template,
          is_active: draft.isActive,
          is_system: rule.is_system,
          sort_order: rule.sort_order,
          cancel_on_event_types: rule.cancel_on_event_types,
          metadata: rule.metadata,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    if (fail > 0) {
      toast({ title: `${ok} salvas, ${fail} falharam`, variant: 'destructive' });
    } else {
      toast({ title: `${ok} automação(ões) salva(s)` });
      setDirty(false);
    }
  }

  function handleCancelDrafts() {
    setRuleDrafts(
      rules.reduce<Record<string, RuleDraft>>((acc, r) => {
        acc[r.id] = { isActive: r.is_active, template: r.template || '' };
        return acc;
      }, {}),
    );
    setDirty(false);
  }

  const isLoading = mod.rulesQuery.isLoading || mod.settingsQuery.isLoading;

  return (
    <div className="space-y-6 pb-24">
      <PageHeader title="Automações" subtitle="Configure disparos automáticos de WhatsApp para leads e alertas operacionais." icon={Zap} />

      {/* ──── Health Status Banner ──── */}
      {health && (
        <Card
          className={cn(
            'border-l-4',
            health.whatsapp_connected && health.evolution_api_reachable
              ? 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20'
              : 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
          )}
        >
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                {health.whatsapp_connected ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className={health.whatsapp_connected ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                  {health.whatsapp_connected
                    ? `WhatsApp conectado${health.whatsapp_instance_name ? ` (${health.whatsapp_instance_name})` : ''}`
                    : 'Nenhum WhatsApp conectado'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {health.evolution_api_reachable ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                )}
                <span className={health.evolution_api_reachable ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                  {health.evolution_api_reachable ? 'API de envio OK' : 'API de envio indisponível'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>{health.pending_runs_count} pendente(s)</span>
                <span>{health.failed_runs_last_24h} falha(s) 24h</span>
                {health.last_processed_at && <span>Último envio: {formatDateTime(health.last_processed_at)}</span>}
              </div>
            </div>
            {!health.whatsapp_connected && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                As automações não conseguirão enviar mensagens sem uma instância WhatsApp conectada. Acesse a aba Instâncias para configurar.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* ──── Configuração Geral ──── */}
        <Card className="border-primary/20">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent rounded-t-xl">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-primary" />
              Configuração Geral
            </CardTitle>
            <CardDescription>Instância WhatsApp e números para notificações operacionais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Instância WhatsApp padrão</Label>
                <Select
                  value={settingsDraft.defaultWhatsappInstanceId}
                  onValueChange={(v) => setSettingsDraft((c) => ({ ...c, defaultWhatsappInstanceId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a instância" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem instância fixa</SelectItem>
                    {instances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.display_name} — {i.status === 'connected' ? '🟢 Conectado' : '🔴 Desconectado'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Intervalo mínimo entre alertas (minutos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={settingsDraft.notificationCooldownMinutes}
                  onChange={(e) => setSettingsDraft((c) => ({ ...c, notificationCooldownMinutes: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Números para notificações (separar por vírgula)</Label>
              <Textarea
                rows={2}
                value={settingsDraft.adminNotificationNumbers}
                onChange={(e) => setSettingsDraft((c) => ({ ...c, adminNotificationNumbers: e.target.value }))}
                placeholder="5511999999999, 5511988888888"
              />
              <p className="text-xs text-muted-foreground">
                Os alertas operacionais (novo lead, reunião agendada, etc.) serão enviados para esses números.
              </p>
            </div>
            <Button
              onClick={() => void handleSaveSettings()}
              disabled={mod.upsertAutomationSettingsMutation.isPending}
              size="sm"
            >
              {mod.upsertAutomationSettingsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar configuração
            </Button>
          </CardContent>
        </Card>

        {/* ──── Automações de Lead (whatsapp_lead) ──── */}
        <Card>
          <CardHeader className="bg-gradient-to-r from-sky-500/5 to-transparent rounded-t-xl">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-sky-500" />
              Automações de Lead
            </CardTitle>
            <CardDescription>
              Mensagens automáticas enviadas para leads quando preenchem formulário, agendam reunião, não comparecem, etc.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : leadRules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhuma automação de lead configurada.</p>
            ) : (
              leadRules.map((rule) => {
                const draft = ruleDrafts[rule.id] || { isActive: rule.is_active, template: rule.template || '' };
                return (
                  <AutomationCard
                    key={rule.id}
                    rule={rule}
                    draft={draft}
                    onToggle={(active) => updateDraft(rule.id, { isActive: active })}
                    onTemplateChange={(t) => updateDraft(rule.id, { template: t })}
                  />
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ──── Alertas Operacionais (whatsapp_admin) ──── */}
        <Card>
          <CardHeader className="bg-gradient-to-r from-amber-500/5 to-transparent rounded-t-xl">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alertas Operacionais
            </CardTitle>
            <CardDescription>
              Notificações enviadas para os números admin quando acontecem eventos importantes (novo lead, reunião, fechamento).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : adminRules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum alerta operacional configurado.</p>
            ) : (
              adminRules.map((rule) => {
                const draft = ruleDrafts[rule.id] || { isActive: rule.is_active, template: rule.template || '' };
                return (
                  <AutomationCard
                    key={rule.id}
                    rule={rule}
                    draft={draft}
                    onToggle={(active) => updateDraft(rule.id, { isActive: active })}
                    onTemplateChange={(t) => updateDraft(rule.id, { template: t })}
                  />
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ──── Execuções Recentes ──── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Execuções Recentes
            </CardTitle>
            <CardDescription>Últimas 40 automações processadas.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem execuções recentes.</p>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {runs.map((run: InternalCrmAutomationRun) => (
                    <div
                      key={run.id}
                      className="flex items-start gap-3 rounded-lg border border-border/50 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{run.automation_name || run.automation_key}</span>
                          <RunStatusBadge status={run.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {run.client_company_name || 'Sem cliente'} · Agendado: {formatDateTime(run.scheduled_at)}
                          {run.processed_at ? ` · Processado: ${formatDateTime(run.processed_at)}` : ''}
                        </p>
                        {run.last_error && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1">
                            {run.last_error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* ──── Card de Dica ──── */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Como funciona:</strong> As automações são disparadas automaticamente quando um lead preenche o
              formulário, quando uma reunião é agendada/cancelada, ou quando um negócio é fechado. Mensagens agendadas
              (com atraso ou que dependem do horário da reunião) são processadas automaticamente a cada minuto.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ──── Floating Save Bar ──── */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Você tem alterações não salvas nas automações.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancelDrafts}>
                <X className="mr-1 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveAllRules()}
                disabled={mod.upsertAutomationRuleMutation.isPending}
              >
                {mod.upsertAutomationRuleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar tudo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}