import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  type LucideIcon,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import { useInternalCrmAutomationsModule } from '@/modules/internal-crm/hooks/useInternalCrmAutomations';
import type {
  InternalCrmAutomationRule,
  InternalCrmAutomationRun,
  InternalCrmAutomationSettings,
  InternalCrmWhatsappInstance,
} from '@/modules/internal-crm/types';

type AutomationTab = 'lead' | 'admin';
type RuleFilter = 'all' | 'active' | 'inactive';
type RuleDraft = { isActive: boolean; template: string };
type SettingsDraft = {
  defaultWhatsappInstanceId: string;
  adminNotificationNumbers: string;
  notificationCooldownMinutes: string;
};

const COMMON_TEMPLATE_TOKENS = ['{{nome}}', '{{data_hora}}', '{{hora}}', '{{link_agendamento}}', '{{link_reuniao}}'];

const TRIGGER_META: Record<
  string,
  {
    label: string;
    description: string;
    icon: LucideIcon;
    surfaceClassName: string;
    tokens: string[];
  }
> = {
  lp_form_submitted: {
    label: 'Formulario enviado',
    description: 'Contato inicial imediatamente apos a captura do lead.',
    icon: MessageSquare,
    surfaceClassName: 'border-sky-200/70 bg-sky-500/10 text-sky-600 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  lp_form_no_schedule: {
    label: 'Formulario sem agendamento',
    description: 'Recupera leads que preencheram a LP, mas ainda nao agendaram.',
    icon: Clock,
    surfaceClassName: 'border-amber-200/70 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  appointment_scheduled: {
    label: 'Reuniao agendada',
    description: 'Confirma o compromisso com data, hora ou link de reuniao.',
    icon: Calendar,
    surfaceClassName: 'border-violet-200/70 bg-violet-500/10 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  appointment_no_show: {
    label: 'Nao compareceu',
    description: 'Recupera agendas perdidas e reabre o canal rapidamente.',
    icon: UserX,
    surfaceClassName: 'border-rose-200/70 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  appointment_done: {
    label: 'Reuniao concluida',
    description: 'Dispara follow-up logo apos a reuniao acontecer.',
    icon: CheckCircle2,
    surfaceClassName: 'border-emerald-200/70 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  deal_closed: {
    label: 'Negocio fechado',
    description: 'Confirma fechamentos e avanca a operacao comercial.',
    icon: CheckCircle2,
    surfaceClassName: 'border-emerald-200/70 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  deal_not_closed: {
    label: 'Negocio nao fechado',
    description: 'Aciona reengajamento quando a negociacao esfria ou trava.',
    icon: AlertTriangle,
    surfaceClassName: 'border-orange-200/70 bg-orange-500/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
  call_scheduled: {
    label: 'Chamada agendada',
    description: 'Confirma slots reservados e reduz faltas de comparecimento.',
    icon: Phone,
    surfaceClassName: 'border-indigo-200/70 bg-indigo-500/10 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300',
    tokens: COMMON_TEMPLATE_TOKENS,
  },
};

const RUN_STATUS_MAP: Record<string, { label: string; className: string }> = {
  completed: {
    label: 'Enviada',
    className: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  pending: {
    label: 'Pendente',
    className: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  },
  processing: {
    label: 'Processando',
    className: 'bg-sky-500/10 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  },
  failed: {
    label: 'Falhou',
    className: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  },
  canceled: {
    label: 'Cancelada',
    className: 'bg-zinc-500/10 text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-300',
  },
  skipped: {
    label: 'Ignorada',
    className: 'bg-slate-500/10 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
  },
  idle: {
    label: 'Sem historico',
    className: 'bg-muted text-muted-foreground',
  },
};

const SUMMARY_TONES = {
  sky: {
    card: 'border-sky-200/70 bg-sky-50/70 dark:border-sky-500/20 dark:bg-sky-500/10',
    icon: 'bg-sky-500 text-white shadow-[0_18px_36px_-24px_rgba(14,165,233,0.7)]',
    label: 'text-sky-700 dark:text-sky-300',
    hint: 'text-sky-800/80 dark:text-sky-200/80',
    bar: 'bg-sky-500',
  },
  emerald: {
    card: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10',
    icon: 'bg-emerald-500 text-white shadow-[0_18px_36px_-24px_rgba(16,185,129,0.7)]',
    label: 'text-emerald-700 dark:text-emerald-300',
    hint: 'text-emerald-800/80 dark:text-emerald-200/80',
    bar: 'bg-emerald-500',
  },
  amber: {
    card: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10',
    icon: 'bg-amber-500 text-white shadow-[0_18px_36px_-24px_rgba(245,158,11,0.7)]',
    label: 'text-amber-700 dark:text-amber-300',
    hint: 'text-amber-800/80 dark:text-amber-200/80',
    bar: 'bg-amber-500',
  },
  rose: {
    card: 'border-rose-200/70 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10',
    icon: 'bg-rose-500 text-white shadow-[0_18px_36px_-24px_rgba(244,63,94,0.7)]',
    label: 'text-rose-700 dark:text-rose-300',
    hint: 'text-rose-800/80 dark:text-rose-200/80',
    bar: 'bg-rose-500',
  },
  slate: {
    card: 'border-border/70 bg-muted/30',
    icon: 'bg-foreground text-background shadow-[0_18px_36px_-24px_rgba(15,23,42,0.45)]',
    label: 'text-foreground',
    hint: 'text-muted-foreground',
    bar: 'bg-foreground',
  },
} as const;

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function clampCooldown(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 60;
  return Math.min(1440, Math.max(1, Math.round(numeric)));
}

function parseAdminNotificationNumbers(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatDelay(minutes: number): string {
  if (minutes === 0) return 'Imediata';

  const abs = Math.abs(minutes);
  const prefix = minutes > 0 ? 'Apos ' : '';
  const suffix = minutes < 0 ? ' antes' : '';

  if (abs < 60) {
    return `${prefix}${pluralize(abs, 'minuto', 'minutos')}${suffix}`;
  }

  if (abs % 1440 === 0) {
    const days = abs / 1440;
    return `${prefix}${pluralize(days, 'dia', 'dias')}${suffix}`;
  }

  if (abs % 60 === 0) {
    const hours = abs / 60;
    return `${prefix}${pluralize(hours, 'hora', 'horas')}${suffix}`;
  }

  return `${prefix}${pluralize(abs, 'minuto', 'minutos')}${suffix}`;
}

function buildSettingsDraft(settings?: InternalCrmAutomationSettings | null): SettingsDraft {
  return {
    defaultWhatsappInstanceId: settings?.default_whatsapp_instance_id || 'none',
    adminNotificationNumbers: settings?.admin_notification_numbers.join(', ') || '',
    notificationCooldownMinutes: String(settings?.notification_cooldown_minutes || 60),
  };
}

function normalizeSettingsDraft(draft: SettingsDraft): SettingsDraft {
  return {
    defaultWhatsappInstanceId: draft.defaultWhatsappInstanceId || 'none',
    adminNotificationNumbers: parseAdminNotificationNumbers(draft.adminNotificationNumbers).join(', '),
    notificationCooldownMinutes: String(clampCooldown(draft.notificationCooldownMinutes)),
  };
}

function areSettingsDraftsEqual(a: SettingsDraft, b: SettingsDraft): boolean {
  return (
    a.defaultWhatsappInstanceId === b.defaultWhatsappInstanceId &&
    a.adminNotificationNumbers === b.adminNotificationNumbers &&
    a.notificationCooldownMinutes === b.notificationCooldownMinutes
  );
}

function buildRuleDraft(rule: InternalCrmAutomationRule): RuleDraft {
  return {
    isActive: rule.is_active,
    template: rule.template || '',
  };
}

function buildRuleDraftMap(rules: InternalCrmAutomationRule[]): Record<string, RuleDraft> {
  return rules.reduce<Record<string, RuleDraft>>((acc, rule) => {
    acc[rule.id] = buildRuleDraft(rule);
    return acc;
  }, {});
}

function getRuleDraft(rule: InternalCrmAutomationRule, drafts: Record<string, RuleDraft>): RuleDraft {
  return drafts[rule.id] || buildRuleDraft(rule);
}

function isRuleChanged(
  rule: InternalCrmAutomationRule,
  drafts: Record<string, RuleDraft>,
  baselines: Record<string, RuleDraft>,
): boolean {
  const draft = getRuleDraft(rule, drafts);
  const baseline = baselines[rule.id] || buildRuleDraft(rule);
  return draft.isActive !== baseline.isActive || draft.template !== baseline.template;
}

function filterRules(
  rules: InternalCrmAutomationRule[],
  drafts: Record<string, RuleDraft>,
  filter: RuleFilter,
): InternalCrmAutomationRule[] {
  if (filter === 'all') return rules;
  return rules.filter((rule) => {
    const draft = getRuleDraft(rule, drafts);
    return filter === 'active' ? draft.isActive : !draft.isActive;
  });
}

function getTriggerMeta(rule: InternalCrmAutomationRule | InternalCrmAutomationRun) {
  return (
    TRIGGER_META[rule.trigger_event] || {
      label: rule.trigger_event,
      description: 'Rotina operacional personalizada deste motor de automacoes.',
      icon: Zap,
      surfaceClassName: 'border-primary/20 bg-primary/10 text-primary',
      tokens: COMMON_TEMPLATE_TOKENS,
    }
  );
}

function formatInstanceStatus(instance: InternalCrmWhatsappInstance): string {
  switch (instance.status) {
    case 'connected':
      return 'Conectada';
    case 'connecting':
      return 'Conectando';
    case 'error':
      return 'Com erro';
    default:
      return 'Desconectada';
  }
}

function SummaryMetricCard(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: keyof typeof SUMMARY_TONES;
  progressValue?: number;
}) {
  const tone = SUMMARY_TONES[props.tone];
  const Icon = props.icon;
  const progressValue = Math.max(0, Math.min(100, props.progressValue ?? 0));

  return (
    <Card className={cn('overflow-hidden shadow-sm', tone.card)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', tone.label)}>{props.label}</p>
            <div className="text-3xl font-semibold tracking-tight text-foreground">{props.value}</div>
          </div>
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', tone.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className={cn('mt-3 text-sm', tone.hint)}>{props.hint}</p>
        {props.progressValue !== undefined ? (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background/80 dark:bg-background/20">
            <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${progressValue}%` }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunStatusBadge({ status }: { status: string | null | undefined }) {
  const meta = RUN_STATUS_MAP[status || ''] || RUN_STATUS_MAP.idle;
  return <Badge className={cn('border-0 text-[11px] font-medium', meta.className)}>{meta.label}</Badge>;
}

function SectionEmptyState(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{props.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{props.description}</p>
    </div>
  );
}

function AutomationRuleCard(props: {
  rule: InternalCrmAutomationRule;
  draft: RuleDraft;
  isChanged: boolean;
  onToggle: (active: boolean) => void;
  onTemplateChange: (template: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const triggerMeta = getTriggerMeta(props.rule);
  const TriggerIcon = triggerMeta.icon;
  const lastStatus = props.rule.last_run_status ? RUN_STATUS_MAP[props.rule.last_run_status] : RUN_STATUS_MAP.idle;
  const templateLength = props.draft.template.trim().length;

  return (
    <div
      className={cn(
        'rounded-2xl border shadow-sm transition-colors',
        props.draft.isActive ? 'border-primary/20 bg-background' : 'border-border/70 bg-muted/15',
        props.isChanged && 'ring-1 ring-amber-500/30',
      )}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border', triggerMeta.surfaceClassName)}>
              <TriggerIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{props.rule.name}</h3>
                <Badge className={cn('border-0', props.draft.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  {props.draft.isActive ? 'Ativa' : 'Inativa'}
                </Badge>
                {props.isChanged ? (
                  <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    Alterada
                  </Badge>
                ) : null}
                {props.rule.is_system ? <Badge variant="secondary">Sistema</Badge> : null}
              </div>

              <p className="text-sm text-muted-foreground">{props.rule.description || triggerMeta.description}</p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="rounded-xl px-2.5 py-1 text-[11px] font-medium">
                  {triggerMeta.label}
                </Badge>
                <Badge variant="outline" className="rounded-xl px-2.5 py-1 text-[11px] font-medium">
                  {formatDelay(props.rule.delay_minutes)}
                </Badge>
                <Badge variant="outline" className="rounded-xl px-2.5 py-1 text-[11px] font-medium">
                  {props.rule.channel === 'whatsapp_admin' ? 'Canal interno' : 'WhatsApp lead'}
                </Badge>
                <Badge className={cn('border-0 text-[11px] font-medium', lastStatus.className)}>{lastStatus.label}</Badge>
                {props.rule.last_run_at ? <span>Ultima execucao: {formatDateTime(props.rule.last_run_at)}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setExpanded((current) => !current)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? 'Ocultar editor' : 'Editar template'}
            </Button>
            <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">{props.draft.isActive ? 'Ligada' : 'Desligada'}</span>
              <Switch checked={props.draft.isActive} onCheckedChange={props.onToggle} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Trigger</p>
            <p className="mt-1 text-sm font-medium text-foreground">{triggerMeta.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{triggerMeta.description}</p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Template</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {templateLength > 0 ? pluralize(templateLength, 'caractere', 'caracteres') : 'Template vazio'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {templateLength > 0
                ? 'Voce pode editar a mensagem mesmo deixando a automacao inativa.'
                : 'Preencha o conteudo para evitar disparos sem mensagem.'}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 sm:col-span-2 xl:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cancelamento</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {props.rule.cancel_on_event_types.length > 0 ? props.rule.cancel_on_event_types.join(', ') : 'Nao configurado'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Eventos que interrompem esta mensagem antes do envio final.
            </p>
          </div>
        </div>

        {expanded ? (
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Variaveis disponiveis
              </span>
              {triggerMeta.tokens.map((token) => (
                <Badge key={`${props.rule.id}-${token}`} variant="outline" className="rounded-xl border-border/70 bg-background/80 text-[11px]">
                  {token}
                </Badge>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor={`automation-template-${props.rule.id}`}>Mensagem automatica</Label>
              <Textarea
                id={`automation-template-${props.rule.id}`}
                value={props.draft.template}
                onChange={(event) => props.onTemplateChange(event.target.value)}
                rows={6}
                className="min-h-[160px] resize-y bg-background"
                placeholder="Escreva aqui a mensagem automatica que sera enviada nesse trigger..."
              />
            </div>

            <div className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className={cn(templateLength === 0 && props.draft.isActive ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                {templateLength === 0 && props.draft.isActive
                  ? 'Esta regra esta ativa, mas ainda nao possui mensagem preenchida.'
                  : 'As alteracoes ficam em rascunho ate voce salvar a pagina.'}
              </p>
              <span className="text-muted-foreground">{pluralize(templateLength, 'caractere', 'caracteres')}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InternalCrmAutomationsView() {
  const { toast } = useToast();
  const mod = useInternalCrmAutomationsModule();

  const rules = mod.rulesQuery.data?.rules || [];
  const runs = mod.runsQuery.data?.runs || [];
  const instances = mod.instancesQuery.data?.instances || [];
  const settings = mod.settingsQuery.data?.settings;
  const health = mod.healthQuery.data;

  const [activeTab, setActiveTab] = useState<AutomationTab>('lead');
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => buildSettingsDraft(null));
  const [settingsBaseline, setSettingsBaseline] = useState<SettingsDraft>(() => buildSettingsDraft(null));
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleDraft>>({});
  const [ruleBaselines, setRuleBaselines] = useState<Record<string, RuleDraft>>({});

  const normalizedSettingsDraft = useMemo(() => normalizeSettingsDraft(settingsDraft), [settingsDraft]);
  const normalizedSettingsBaseline = useMemo(() => normalizeSettingsDraft(settingsBaseline), [settingsBaseline]);
  const settingsDirty = useMemo(
    () => !areSettingsDraftsEqual(normalizedSettingsDraft, normalizedSettingsBaseline),
    [normalizedSettingsBaseline, normalizedSettingsDraft],
  );

  const changedRuleIds = useMemo(
    () => rules.filter((rule) => isRuleChanged(rule, ruleDrafts, ruleBaselines)).map((rule) => rule.id),
    [ruleBaselines, ruleDrafts, rules],
  );
  const changedRuleSet = useMemo(() => new Set(changedRuleIds), [changedRuleIds]);
  const changedRuleCount = changedRuleIds.length;
  const rulesDirty = changedRuleCount > 0;

  const settingsDirtyRef = useRef(settingsDirty);
  const rulesDirtyRef = useRef(rulesDirty);

  useEffect(() => {
    settingsDirtyRef.current = settingsDirty;
  }, [settingsDirty]);

  useEffect(() => {
    rulesDirtyRef.current = rulesDirty;
  }, [rulesDirty]);

  useEffect(() => {
    if (!settings || settingsDirtyRef.current) return;
    const next = buildSettingsDraft(settings);
    setSettingsDraft(next);
    setSettingsBaseline(next);
  }, [settings]);

  useEffect(() => {
    if (rulesDirtyRef.current) return;
    const next = buildRuleDraftMap(rules);
    setRuleDrafts(next);
    setRuleBaselines(next);
  }, [rules]);

  const leadRules = useMemo(() => rules.filter((rule) => rule.channel === 'whatsapp_lead'), [rules]);
  const adminRules = useMemo(() => rules.filter((rule) => rule.channel === 'whatsapp_admin'), [rules]);

  const visibleLeadRules = useMemo(() => filterRules(leadRules, ruleDrafts, ruleFilter), [leadRules, ruleDrafts, ruleFilter]);
  const visibleAdminRules = useMemo(() => filterRules(adminRules, ruleDrafts, ruleFilter), [adminRules, ruleDrafts, ruleFilter]);

  const activeRuleCount = useMemo(() => rules.filter((rule) => getRuleDraft(rule, ruleDrafts).isActive).length, [ruleDrafts, rules]);
  const leadActiveCount = useMemo(() => leadRules.filter((rule) => getRuleDraft(rule, ruleDrafts).isActive).length, [leadRules, ruleDrafts]);
  const adminActiveCount = useMemo(() => adminRules.filter((rule) => getRuleDraft(rule, ruleDrafts).isActive).length, [adminRules, ruleDrafts]);

  const totalRuleCount = rules.length;
  const coveragePercent = totalRuleCount > 0 ? Math.round((activeRuleCount / totalRuleCount) * 100) : 0;
  const leadCoveragePercent = leadRules.length > 0 ? Math.round((leadActiveCount / leadRules.length) * 100) : 0;
  const adminCoveragePercent = adminRules.length > 0 ? Math.round((adminActiveCount / adminRules.length) * 100) : 0;

  const notificationRecipients = useMemo(() => parseAdminNotificationNumbers(normalizedSettingsDraft.adminNotificationNumbers), [normalizedSettingsDraft.adminNotificationNumbers]);
  const notificationRecipientCount = notificationRecipients.length;

  const connectedInstances = useMemo(() => instances.filter((instance) => instance.status === 'connected'), [instances]);
  const connectedInstancesCount = connectedInstances.length;
  const selectedInstance = useMemo(() => instances.find((instance) => instance.id === settingsDraft.defaultWhatsappInstanceId), [instances, settingsDraft.defaultWhatsappInstanceId]);

  const pendingRunsCount = health?.pending_runs_count ?? 0;
  const failedRunsCount = health?.failed_runs_last_24h ?? 0;
  const issueMessages = useMemo(() => {
    const messages: string[] = [];

    if (health && activeRuleCount > 0 && !health.whatsapp_connected) {
      messages.push('Nenhuma instancia WhatsApp esta conectada para realizar os disparos.');
    }

    if (health && activeRuleCount > 0 && !health.evolution_api_reachable) {
      messages.push('A API de envio esta indisponivel no momento.');
    }

    if (adminActiveCount > 0 && notificationRecipientCount === 0) {
      messages.push('Existem alertas operacionais ativos, mas nenhum numero admin configurado para recebe-los.');
    }

    if (failedRunsCount > 0) {
      messages.push(`${pluralize(failedRunsCount, 'falha registrada', 'falhas registradas')} nas ultimas 24h.`);
    }

    return messages;
  }, [activeRuleCount, adminActiveCount, failedRunsCount, health, notificationRecipientCount]);
  const requiresAttention = issueMessages.length > 0;

  const settingsPanelLoading = mod.settingsQuery.isLoading && !settings;
  const rulesLoading = mod.rulesQuery.isLoading && rules.length === 0;
  const runsLoading = mod.runsQuery.isLoading && runs.length === 0;
  const isSaving = isSavingAll || mod.upsertAutomationSettingsMutation.isPending || mod.upsertAutomationRuleMutation.isPending;
  const hasAnyChanges = settingsDirty || rulesDirty;

  const headerChips = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="rounded-xl border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium">
        {activeRuleCount}/{totalRuleCount || 0} ativas
      </Badge>
      <Badge
        className={cn(
          'rounded-xl border-0 px-3 py-1.5 text-xs font-medium',
          requiresAttention
            ? 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
            : 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
        )}
      >
        {requiresAttention ? 'Operacao exige atencao' : 'Operacao estavel'}
      </Badge>
      {hasAnyChanges ? (
        <Badge className="rounded-xl border-0 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Alteracoes pendentes
        </Badge>
      ) : null}
    </div>
  );

  function updateRuleDraft(rule: InternalCrmAutomationRule, patch: Partial<RuleDraft>) {
    setRuleDrafts((current) => ({
      ...current,
      [rule.id]: {
        ...getRuleDraft(rule, current),
        ...patch,
      },
    }));
  }

  async function persistSettingsDrafts() {
    const nextDraft = normalizeSettingsDraft(settingsDraft);

    await mod.upsertAutomationSettingsMutation.mutateAsync({
      action: 'upsert_automation_settings',
      default_whatsapp_instance_id: nextDraft.defaultWhatsappInstanceId === 'none' ? null : nextDraft.defaultWhatsappInstanceId,
      admin_notification_numbers: parseAdminNotificationNumbers(nextDraft.adminNotificationNumbers),
      notification_cooldown_minutes: Number(nextDraft.notificationCooldownMinutes),
    });

    setSettingsDraft(nextDraft);
    setSettingsBaseline(nextDraft);
  }

  async function persistRuleDrafts() {
    const changedRules = rules.filter((rule) => isRuleChanged(rule, ruleDrafts, ruleBaselines));
    const savedDrafts: Array<{ id: string; draft: RuleDraft }> = [];
    let updated = 0;
    let failed = 0;

    for (const rule of changedRules) {
      const draft = getRuleDraft(rule, ruleDrafts);

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

        savedDrafts.push({ id: rule.id, draft: { ...draft } });
        updated += 1;
      } catch {
        failed += 1;
      }
    }

    if (savedDrafts.length > 0) {
      setRuleBaselines((current) => {
        const next = { ...current };
        for (const savedDraft of savedDrafts) {
          next[savedDraft.id] = savedDraft.draft;
        }
        return next;
      });
    }

    return { updated, failed };
  }

  async function handleSaveAllChanges() {
    if (!hasAnyChanges) return;

    setIsSavingAll(true);
    try {
      let settingsSaved = false;

      if (settingsDirty) {
        await persistSettingsDrafts();
        settingsSaved = true;
      }

      const ruleResult = rulesDirty ? await persistRuleDrafts() : { updated: 0, failed: 0 };

      if (ruleResult.failed > 0) {
        const description = [
          settingsSaved ? 'A configuracao geral foi salva.' : null,
          ruleResult.updated > 0 ? `${pluralize(ruleResult.updated, 'automacao atualizada', 'automacoes atualizadas')}.` : null,
          `${pluralize(ruleResult.failed, 'automacao falhou', 'automacoes falharam')} ao salvar.`,
        ]
          .filter(Boolean)
          .join(' ');

        toast({
          title: 'Algumas alteracoes exigem revisao',
          description,
          variant: 'destructive',
        });
        return;
      }

      const updatedParts = [
        settingsSaved ? 'configuracao geral' : null,
        ruleResult.updated > 0 ? pluralize(ruleResult.updated, 'automacao', 'automacoes') : null,
      ].filter(Boolean);

      toast({
        title: 'Alteracoes salvas',
        description:
          updatedParts.length > 0
            ? `Atualizado: ${updatedParts.join(' e ')}.`
            : 'Nao havia alteracoes pendentes para salvar.',
      });
    } catch {
      toast({
        title: 'Erro ao salvar alteracoes',
        description: 'Revise os dados preenchidos e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingAll(false);
    }
  }

  function handleDiscardAll() {
    setSettingsDraft({ ...settingsBaseline });
    setRuleDrafts({ ...ruleBaselines });
    toast({
      title: 'Alteracoes descartadas',
      description: 'A aba voltou para o ultimo estado salvo.',
    });
  }

  return (
    <div className="space-y-6 pb-28">
      <PageHeader
        title="Automações"
        subtitle="Orquestre mensagens automáticas de WhatsApp e alertas operacionais com contexto visual e operacional claro."
        icon={Zap}
        actionContent={headerChips}
        mobileToolbar={headerChips}
      />

      {requiresAttention ? (
        <Alert className="border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-50">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-300" />
          <AlertTitle>A operacao precisa de ajustes antes de confiar nos disparos</AlertTitle>
          <AlertDescription>{issueMessages.join(' ')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          icon={Zap}
          label="Cobertura ativa"
          value={`${activeRuleCount}/${totalRuleCount || 0}`}
          hint={
            totalRuleCount > 0
              ? `${coveragePercent}% das automacoes estao habilitadas agora.`
              : 'Nenhuma automacao cadastrada para este escopo.'
          }
          tone={activeRuleCount > 0 ? 'sky' : 'slate'}
          progressValue={coveragePercent}
        />
        <SummaryMetricCard
          icon={Wifi}
          label="Instancias prontas"
          value={instances.length > 0 ? `${connectedInstancesCount}/${instances.length}` : '0'}
          hint={
            instances.length > 0
              ? `${pluralize(connectedInstancesCount, 'instancia conectada', 'instancias conectadas')} para envio.`
              : 'Nenhuma instancia WhatsApp foi cadastrada ainda.'
          }
          tone={connectedInstancesCount > 0 ? 'emerald' : 'rose'}
          progressValue={instances.length > 0 ? Math.round((connectedInstancesCount / instances.length) * 100) : 0}
        />
        <SummaryMetricCard
          icon={Activity}
          label="Fila atual"
          value={health ? String(pendingRunsCount) : '--'}
          hint={
            health?.last_processed_at
              ? `Ultimo processamento em ${formatDateTime(health.last_processed_at)}.`
              : 'Sem registro recente de processamento.'
          }
          tone={pendingRunsCount > 0 ? 'amber' : 'sky'}
        />
        <SummaryMetricCard
          icon={AlertTriangle}
          label="Falhas em 24h"
          value={health ? String(failedRunsCount) : '--'}
          hint={
            failedRunsCount > 0
              ? 'Existe atrito recente no motor de envio e isso merece revisao.'
              : 'Nenhuma falha registrada no periodo recente.'
          }
          tone={failedRunsCount > 0 ? 'rose' : 'emerald'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AutomationTab)}>
            <Card className="overflow-hidden border-border/70 shadow-sm">
              <CardHeader className="space-y-4 border-b bg-[linear-gradient(180deg,hsl(var(--primary)/0.08),transparent)] pb-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl">Catalogo de automacoes</CardTitle>
                      {rulesDirty ? (
                        <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          {pluralize(changedRuleCount, 'alteracao pendente', 'alteracoes pendentes')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border/70 bg-background/70">
                          Sem pendencias
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Separe por contexto, filtre rapidamente e edite templates sem perder a visao operacional da aba.
                    </CardDescription>
                  </div>

                  <ToggleGroup
                    type="single"
                    value={ruleFilter}
                    onValueChange={(value) => {
                      if (value) setRuleFilter(value as RuleFilter);
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-wrap justify-start lg:justify-end"
                  >
                    <ToggleGroupItem value="all" aria-label="Mostrar todas as automacoes">
                      Todas
                    </ToggleGroupItem>
                    <ToggleGroupItem value="active" aria-label="Mostrar apenas automacoes ativas">
                      Ativas
                    </ToggleGroupItem>
                    <ToggleGroupItem value="inactive" aria-label="Mostrar apenas automacoes inativas">
                      Inativas
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-background/70 p-1">
                  <TabsTrigger value="lead" className="gap-2 rounded-xl py-2.5 text-sm">
                    <MessageSquare className="h-4 w-4" />
                    Leads
                    <span className="text-xs text-muted-foreground">{leadRules.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="admin" className="gap-2 rounded-xl py-2.5 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Operacao
                    <span className="text-xs text-muted-foreground">{adminRules.length}</span>
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="p-6">
                <TabsContent value="lead" className="mt-0 space-y-4">
                  <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4 dark:border-sky-500/20 dark:bg-sky-500/10">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">Jornada do lead</h3>
                          <Badge variant="outline" className="border-sky-200/70 bg-background/70 text-sky-700 dark:border-sky-500/20 dark:text-sky-200">
                            {visibleLeadRules.length} visiveis
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Disparos para captura, agendamento, no-show, reuniao concluida e reengajamento comercial.
                        </p>
                      </div>

                      <div className="min-w-[220px] space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{pluralize(leadActiveCount, 'rotina ativa', 'rotinas ativas')}</span>
                          <span>{pluralize(leadRules.length, 'regra', 'regras')}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950/40">
                          <div className="h-full rounded-full bg-sky-500" style={{ width: `${leadCoveragePercent}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {rulesLoading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando automacoes de lead...
                    </div>
                  ) : visibleLeadRules.length === 0 ? (
                    <SectionEmptyState
                      title="Nenhuma automacao de lead neste filtro"
                      description="Ajuste o filtro acima ou habilite novas rotinas para este grupo."
                    />
                  ) : (
                    <div className="space-y-4">
                      {visibleLeadRules.map((rule) => (
                        <AutomationRuleCard
                          key={rule.id}
                          rule={rule}
                          draft={getRuleDraft(rule, ruleDrafts)}
                          isChanged={changedRuleSet.has(rule.id)}
                          onToggle={(active) => updateRuleDraft(rule, { isActive: active })}
                          onTemplateChange={(template) => updateRuleDraft(rule, { template })}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="admin" className="mt-0 space-y-4">
                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">Alertas da operacao</h3>
                          <Badge variant="outline" className="border-amber-200/70 bg-background/70 text-amber-700 dark:border-amber-500/20 dark:text-amber-200">
                            {visibleAdminRules.length} visiveis
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Notificacoes internas para novo lead, agenda, fechamento e outros marcos criticos do CRM interno.
                        </p>
                      </div>

                      <div className="min-w-[220px] space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{pluralize(adminActiveCount, 'rotina ativa', 'rotinas ativas')}</span>
                          <span>{pluralize(adminRules.length, 'regra', 'regras')}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950/40">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${adminCoveragePercent}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {rulesLoading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando alertas operacionais...
                    </div>
                  ) : visibleAdminRules.length === 0 ? (
                    <SectionEmptyState
                      title="Nenhum alerta operacional neste filtro"
                      description="Revise o filtro acima ou configure os numeros de destino para usar esta area com seguranca."
                    />
                  ) : (
                    <div className="space-y-4">
                      {visibleAdminRules.map((rule) => (
                        <AutomationRuleCard
                          key={rule.id}
                          rule={rule}
                          draft={getRuleDraft(rule, ruleDrafts)}
                          isChanged={changedRuleSet.has(rule.id)}
                          onToggle={(active) => updateRuleDraft(rule, { isActive: active })}
                          onTemplateChange={(template) => updateRuleDraft(rule, { template })}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Saude operacional</CardTitle>
                  <CardDescription>Confira infraestrutura, fila e risco antes de mexer nas regras.</CardDescription>
                </div>
                <Badge
                  className={cn(
                    'border-0',
                    requiresAttention
                      ? 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                      : 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
                  )}
                >
                  {health ? (requiresAttention ? 'Atencao' : 'Pronto') : 'Consultando'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {health ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {health.whatsapp_connected ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-rose-600" />}
                        WhatsApp
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {health.whatsapp_connected
                          ? `Conectado${health.whatsapp_instance_name ? ` em ${health.whatsapp_instance_name}` : ''}`
                          : 'Nenhuma instancia conectada'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {health.evolution_api_reachable ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                        API de envio
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {health.evolution_api_reachable ? 'Disponivel' : 'Indisponivel'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <Activity className="h-3.5 w-3.5 text-sky-600" />
                        Fila pendente
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{pluralize(pendingRunsCount, 'item', 'itens')}</p>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        Falhas 24h
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{pluralize(failedRunsCount, 'erro', 'erros')}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                    {health.last_processed_at
                      ? `Ultimo processamento em ${formatDateTime(health.last_processed_at)}.`
                      : 'Sem processamento recente registrado.'}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando o motor de automacoes...
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="h-4 w-4 text-primary" />
                    Configuracao de envio
                  </CardTitle>
                  <CardDescription>Defina a instancia padrao, o cooldown e quem recebe alertas internos.</CardDescription>
                </div>
                <Badge
                  className={cn(
                    'border-0',
                    settingsDirty
                      ? 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {settingsDirty ? 'Alterado' : 'Sincronizado'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-border/70 bg-background/70">
                  {pluralize(connectedInstancesCount, 'instancia pronta', 'instancias prontas')}
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-background/70">
                  {pluralize(notificationRecipientCount, 'destino', 'destinos')}
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-background/70">
                  Cooldown {normalizedSettingsDraft.notificationCooldownMinutes} min
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {settingsPanelLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando configuracao de envio...
                </div>
              ) : null}

              {instances.length === 0 ? (
                <Alert className="border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  <AlertTitle>Nenhuma instancia cadastrada</AlertTitle>
                  <AlertDescription>
                    Conecte uma instancia na aba Integracoes antes de depender de disparos automaticos.
                  </AlertDescription>
                </Alert>
              ) : null}

              {adminActiveCount > 0 && notificationRecipientCount === 0 ? (
                <Alert className="border-rose-200 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/10">
                  <AlertTriangle className="h-4 w-4 text-rose-700 dark:text-rose-300" />
                  <AlertTitle>Alertas ativos sem destino</AlertTitle>
                  <AlertDescription>
                    Existem regras internas ligadas, mas nenhum numero admin configurado para recebe-las.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label>Instancia WhatsApp padrao</Label>
                <Select
                  value={settingsDraft.defaultWhatsappInstanceId}
                  onValueChange={(value) => setSettingsDraft((current) => ({ ...current, defaultWhatsappInstanceId: value }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione a instancia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem instancia fixa</SelectItem>
                    {instances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.display_name} - {formatInstanceStatus(instance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedInstance ? (
                  <p className="text-xs text-muted-foreground">
                    Status da instancia padrao: {formatInstanceStatus(selectedInstance)}.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Intervalo minimo entre alertas</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={settingsDraft.notificationCooldownMinutes}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      notificationCooldownMinutes: event.target.value,
                    }))
                  }
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Use este intervalo para evitar notificacoes internas duplicadas em sequencia curta.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Numeros para alertas internos</Label>
                <Textarea
                  rows={3}
                  value={settingsDraft.adminNotificationNumbers}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      adminNotificationNumbers: event.target.value,
                    }))
                  }
                  className="bg-background"
                  placeholder="5511999999999, 5511988888888"
                />
                <p className="text-xs text-muted-foreground">
                  Separe por virgula, ponto e virgula ou quebra de linha. Duplicidades sao removidas ao salvar.
                </p>
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground">
                As mudancas desta caixa entram no mesmo fluxo de salvar da pagina para evitar configuracoes desencontradas.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Execucoes recentes</CardTitle>
                  <CardDescription>Ultimas automacoes processadas pelo motor de envio.</CardDescription>
                </div>
                <Badge variant="outline" className="border-border/70 bg-background/70">
                  {pluralize(runs.length, 'registro', 'registros')}
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              {runsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando historico recente...
                </div>
              ) : runs.length === 0 ? (
                <SectionEmptyState
                  title="Sem execucoes recentes"
                  description="Quando o motor processar automacoes, o historico mais novo aparece aqui."
                />
              ) : (
                <ScrollArea className="h-[420px] pr-4">
                  <div className="space-y-3">
                    {runs.map((run: InternalCrmAutomationRun) => {
                      const meta = getTriggerMeta(run);
                      const TriggerIcon = meta.icon;
                      return (
                        <div key={run.id} className="rounded-2xl border border-border/70 bg-muted/15 p-3">
                          <div className="flex items-start gap-3">
                            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border', meta.surfaceClassName)}>
                              <TriggerIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{run.automation_name || run.automation_key}</p>
                                <RunStatusBadge status={run.status} />
                              </div>
                              <p className="text-xs text-muted-foreground">{run.client_company_name || 'Sem cliente identificado'}</p>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span>Agendado: {formatDateTime(run.scheduled_at)}</span>
                                {run.processed_at ? <span>Processado: {formatDateTime(run.processed_at)}</span> : null}
                                {run.attempt_count > 1 ? <span>{pluralize(run.attempt_count, 'tentativa', 'tentativas')}</span> : null}
                              </div>
                              {run.last_error ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-2.5 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                                  {run.last_error}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed bg-muted/20 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Como operar esta aba</CardTitle>
              <CardDescription>Fluxo recomendado para configurar sem se perder nos detalhes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                Primeiro valide conectividade, fila e falhas. Sem isso, editar template vira maquiagem de um problema operacional.
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                Depois ajuste a configuracao de envio: instancia padrao, cooldown e numeros administrativos precisam estar coerentes com as regras ativas.
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                Por fim revise os templates, ative o que fizer sentido e use a barra fixa no rodape para salvar tudo de uma vez.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {hasAnyChanges ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:w-[460px]">
          <div className="rounded-2xl border border-primary/20 bg-background/95 shadow-[0_24px_80px_-32px_hsl(var(--foreground)/0.35)] backdrop-blur-xl">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Alteracoes pendentes</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    settingsDirty ? 'configuracao geral' : null,
                    changedRuleCount > 0 ? pluralize(changedRuleCount, 'automacao', 'automacoes') : null,
                  ]
                    .filter(Boolean)
                    .join(' e ')}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:justify-end">
                <Button variant="outline" size="sm" onClick={handleDiscardAll} disabled={isSaving}>
                  <X className="mr-1.5 h-4 w-4" />
                  Descartar
                </Button>
                <Button size="sm" onClick={() => void handleSaveAllChanges()} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Salvar tudo
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
