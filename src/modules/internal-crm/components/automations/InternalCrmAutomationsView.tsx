import { useEffect, useState } from 'react';
import { Activity, BellRing, Loader2, Save, Settings2, TestTube2, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import { useInternalCrmAutomationsModule } from '@/modules/internal-crm/hooks/useInternalCrmAutomations';
import type { InternalCrmAutomationRule } from '@/modules/internal-crm/types';

type RuleDraft = {
  template: string;
  delayMinutes: string;
  isActive: boolean;
};

function normalizeRuleDrafts(rules: InternalCrmAutomationRule[]): Record<string, RuleDraft> {
  return rules.reduce<Record<string, RuleDraft>>((accumulator, rule) => {
    accumulator[rule.id] = {
      template: rule.template || '',
      delayMinutes: String(rule.delay_minutes),
      isActive: rule.is_active,
    };
    return accumulator;
  }, {});
}

export function InternalCrmAutomationsView() {
  const { toast } = useToast();
  const automationsModule = useInternalCrmAutomationsModule();

  const rules = automationsModule.rulesQuery.data?.rules || [];
  const runs = automationsModule.runsQuery.data?.runs || [];
  const instances = automationsModule.instancesQuery.data?.instances || [];
  const clients = automationsModule.clientsQuery.data?.clients || [];
  const settings = automationsModule.settingsQuery.data?.settings;

  const [settingsDraft, setSettingsDraft] = useState({
    defaultWhatsappInstanceId: 'none',
    adminNotificationNumbers: '',
    notificationCooldownMinutes: '60',
  });
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleDraft>>({});
  const [selectedRuleId, setSelectedRuleId] = useState('none');
  const [selectedClientId, setSelectedClientId] = useState('none');
  const [testDealId, setTestDealId] = useState('');
  const [testPayloadText, setTestPayloadText] = useState('{\n  "event_at": ""\n}');

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
    setRuleDrafts(normalizeRuleDrafts(rules));
    if (selectedRuleId === 'none') {
      setSelectedRuleId(rules[0].id);
    }
  }, [rules, selectedRuleId]);

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) || null;

  async function handleSaveSettings() {
    try {
      await automationsModule.upsertAutomationSettingsMutation.mutateAsync({
        action: 'upsert_automation_settings',
        default_whatsapp_instance_id:
          settingsDraft.defaultWhatsappInstanceId === 'none' ? null : settingsDraft.defaultWhatsappInstanceId,
        admin_notification_numbers: settingsDraft.adminNotificationNumbers
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        notification_cooldown_minutes: Number(settingsDraft.notificationCooldownMinutes || 60),
      });

      toast({ title: 'Configuracao salva', description: 'As automacoes operacionais foram atualizadas.' });
    } catch {
      toast({
        title: 'Falha ao salvar configuracao',
        description: 'Nao foi possivel persistir as configuracoes de automacao.',
        variant: 'destructive',
      });
    }
  }

  async function handleSaveRule(rule: InternalCrmAutomationRule) {
    const draft = ruleDrafts[rule.id];
    if (!draft) return;

    try {
      await automationsModule.upsertAutomationRuleMutation.mutateAsync({
        action: 'upsert_automation_rule',
        automation_id: rule.id,
        automation_key: rule.automation_key,
        name: rule.name,
        description: rule.description,
        trigger_event: rule.trigger_event,
        condition: rule.condition,
        channel: rule.channel,
        delay_minutes: Number(draft.delayMinutes || 0),
        template: draft.template,
        is_active: draft.isActive,
        is_system: rule.is_system,
        sort_order: rule.sort_order,
        cancel_on_event_types: rule.cancel_on_event_types,
        metadata: rule.metadata,
      });

      toast({ title: 'Regra atualizada', description: `${rule.name} foi salva.` });
    } catch {
      toast({
        title: 'Falha ao salvar regra',
        description: 'Nao foi possivel atualizar a regra selecionada.',
        variant: 'destructive',
      });
    }
  }

  async function handleTestRule() {
    if (!selectedRule) return;

    let extraPayload: Record<string, unknown> = {};
    try {
      extraPayload = JSON.parse(testPayloadText || '{}') as Record<string, unknown>;
    } catch {
      toast({
        title: 'Payload invalido',
        description: 'Revise o JSON antes de disparar o teste.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await automationsModule.testAutomationRuleMutation.mutateAsync({
        action: 'test_automation_rule',
        automation_id: selectedRule.id,
        client_id: selectedClientId === 'none' ? null : selectedClientId,
        deal_id: testDealId.trim() || null,
        ...extraPayload,
      });

      toast({
        title: 'Teste executado',
        description: `${result.processed.processed_count} execucao(oes) concluida(s), ${result.processed.failed_count} falha(s).`,
      });
    } catch {
      toast({
        title: 'Falha ao testar regra',
        description: 'Nao foi possivel executar o teste manual agora.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automacoes"
        subtitle="Regras deterministicas da esteira ARKAN, alertas no WhatsApp interno e historico de execucao."
        icon={Workflow}
      />

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                Configuracao operacional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Instancia WhatsApp padrao</Label>
                <Select
                  value={settingsDraft.defaultWhatsappInstanceId}
                  onValueChange={(value) => setSettingsDraft((current) => ({ ...current, defaultWhatsappInstanceId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a instancia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem instancia fixa</SelectItem>
                    {instances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.display_name} - {instance.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Numeros admin para alerta</Label>
                <Textarea
                  rows={4}
                  value={settingsDraft.adminNotificationNumbers}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, adminNotificationNumbers: event.target.value }))}
                  placeholder="5511999999999, 5511988888888"
                />
                <p className="text-xs text-muted-foreground">
                  Separe os numeros por virgula. A automacao envia o mesmo alerta para todos os destinatarios ativos.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Cooldown de alerta admin (minutos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={settingsDraft.notificationCooldownMinutes}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, notificationCooldownMinutes: event.target.value }))}
                />
              </div>

              <Button
                onClick={() => void handleSaveSettings()}
                disabled={automationsModule.upsertAutomationSettingsMutation.isPending}
              >
                {automationsModule.upsertAutomationSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar configuracao
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TestTube2 className="h-4 w-4" />
                Teste manual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Regra</Label>
                <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a regra" />
                  </SelectTrigger>
                  <SelectContent>
                    {rules.map((rule) => (
                      <SelectItem key={rule.id} value={rule.id}>
                        {rule.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cliente opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cliente vinculado</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deal ID opcional</Label>
                <Input value={testDealId} onChange={(event) => setTestDealId(event.target.value)} placeholder="uuid do deal" />
              </div>

              <div className="space-y-2">
                <Label>Payload extra (JSON)</Label>
                <Textarea rows={8} value={testPayloadText} onChange={(event) => setTestPayloadText(event.target.value)} />
              </div>

              <Button onClick={() => void handleTestRule()} disabled={automationsModule.testAutomationRuleMutation.isPending || !selectedRule}>
                {automationsModule.testAutomationRuleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
                Disparar teste
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regras ativas da esteira</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma regra encontrada.</p>
              ) : (
                rules.map((rule) => {
                  const draft = ruleDrafts[rule.id] || {
                    template: rule.template || '',
                    delayMinutes: String(rule.delay_minutes),
                    isActive: rule.is_active,
                  };

                  return (
                    <div key={rule.id} className="rounded-2xl border border-border/70 p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{rule.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{rule.description || 'Sem descricao.'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <TokenBadge token={rule.channel} />
                          <TokenBadge token={rule.trigger_event} label={rule.trigger_event} />
                          <div className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
                            <span className="text-xs text-muted-foreground">Ativa</span>
                            <Switch
                              checked={draft.isActive}
                              onCheckedChange={(checked) =>
                                setRuleDrafts((current) => ({
                                  ...current,
                                  [rule.id]: { ...draft, isActive: checked },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr]">
                        <div className="space-y-2">
                          <Label>Atraso (min)</Label>
                          <Input
                            type="number"
                            value={draft.delayMinutes}
                            onChange={(event) =>
                              setRuleDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...draft, delayMinutes: event.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Template</Label>
                          <Textarea
                            rows={4}
                            value={draft.template}
                            onChange={(event) =>
                              setRuleDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...draft, template: event.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          Cancela em: {rule.cancel_on_event_types.length > 0 ? rule.cancel_on_event_types.join(', ') : 'sem cancelamentos'}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => void handleSaveRule(rule)}
                          disabled={automationsModule.upsertAutomationRuleMutation.isPending}
                        >
                          {automationsModule.upsertAutomationRuleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Salvar regra
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Execucoes recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem execucoes recentes de automacao.</p>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-border/70 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{run.automation_name || run.automation_key}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {run.client_company_name || 'Sem cliente'} - {run.trigger_event}
                        </p>
                      </div>
                      <TokenBadge token={run.status} />
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <p>Agendado em: {formatDateTime(run.scheduled_at)}</p>
                      <p>Processado em: {formatDateTime(run.processed_at)}</p>
                    </div>

                    {run.last_error ? (
                      <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {run.last_error}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}