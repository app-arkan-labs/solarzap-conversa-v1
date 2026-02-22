import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Bell,
  MessageCircle,
  Mail,
  AlarmClock,
  Clock,
  Globe,
  Settings2,
  X,
  Loader2,
  BarChart3,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';
import { useToast } from '@/hooks/use-toast';

/* ── Timezone list ── */
const FALLBACK_TIMEZONES = [
  'America/Sao_Paulo',
  'America/Araguaina',
  'America/Bahia',
  'America/Belem',
  'America/Boa_Vista',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Fortaleza',
  'America/Maceio',
  'America/Manaus',
  'America/Noronha',
  'America/Porto_Velho',
  'America/Recife',
  'America/Rio_Branco',
  'UTC',
];

const SUPPORTED_TIMEZONES = (() => {
  const intlExt = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  if (typeof intlExt.supportedValuesOf === 'function') {
    try {
      const vals = intlExt.supportedValuesOf('timeZone');
      if (vals.length > 0) return vals;
    } catch { /* fallback */ }
  }
  return FALLBACK_TIMEZONES;
})();

/* ── Component ── */
interface Props {
  onClose: () => void;
}

export function NotificationConfigPanel({ onClose }: Props) {
  const { toast } = useToast();
  const { settings, loading, saving, updateSettings } = useNotificationSettings();
  const { instances } = useUserWhatsAppInstances();
  const [emailInput, setEmailInput] = useState('');
  const [tzOpen, setTzOpen] = useState(false);

  useEffect(() => {
    if (settings) setEmailInput((settings.email_recipients || []).join(', '));
  }, [settings]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      await updateSettings(patch);
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const on = !!settings?.enabled_notifications;

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      {/* ── Header ── */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Configurações</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">

            {/* ═══ MASTER TOGGLE ═══ */}
            <div
              className={cn(
                'p-4 rounded-xl border-2 transition-all',
                on ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-muted/20',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      on ? 'bg-emerald-500/15' : 'bg-muted',
                    )}
                  >
                    <Bell className={cn('w-5 h-5', on ? 'text-emerald-600' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Notificações</p>
                    <p className="text-xs text-muted-foreground">Liga/desliga todos os canais</p>
                  </div>
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(v) => save({ enabled_notifications: v })}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>
            </div>

            {/* ═══ CANAIS DE ENVIO ═══ */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Canais de Envio
              </p>

              {/* WhatsApp */}
              <div className="rounded-xl border bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        settings?.enabled_whatsapp ? 'bg-green-500/15' : 'bg-muted',
                      )}
                    >
                      <MessageCircle
                        className={cn('w-4 h-4', settings?.enabled_whatsapp ? 'text-green-600' : 'text-muted-foreground')}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">WhatsApp</p>
                      <p className="text-xs text-muted-foreground">Notificações operacionais</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.enabled_whatsapp}
                    onCheckedChange={(v) => save({ enabled_whatsapp: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
                {settings?.enabled_whatsapp && (
                  <div className="px-3 pb-3 pt-0">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Instância de disparo</Label>
                    <Select
                      value={settings.whatsapp_instance_name || '__none'}
                      onValueChange={(v) => save({ whatsapp_instance_name: v === '__none' ? null : v })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Nenhuma</SelectItem>
                        {instances.map((inst) => (
                          <SelectItem key={inst.id} value={inst.instance_name}>
                            {inst.display_name || inst.instance_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* E-mail */}
              <div className="rounded-xl border bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        settings?.enabled_email ? 'bg-blue-500/15' : 'bg-muted',
                      )}
                    >
                      <Mail className={cn('w-4 h-4', settings?.enabled_email ? 'text-blue-600' : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">E-mail</p>
                      <p className="text-xs text-muted-foreground">Via Resend</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.enabled_email}
                    onCheckedChange={(v) => save({ enabled_email: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-blue-500"
                  />
                </div>
                {settings?.enabled_email && (
                  <div className="px-3 pb-3 pt-0">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Destinatários (separar por vírgula)
                    </Label>
                    <Input
                      className="h-9 text-sm"
                      value={emailInput}
                      placeholder="gestor@empresa.com"
                      onChange={(e) => setEmailInput(e.target.value)}
                      onBlur={() => {
                        const list = emailInput
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        save({ email_recipients: list });
                      }}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ═══ LEMBRETES ═══ */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Lembretes
              </p>
              <div className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        settings?.enabled_reminders ? 'bg-amber-500/15' : 'bg-muted',
                      )}
                    >
                      <AlarmClock
                        className={cn('w-4 h-4', settings?.enabled_reminders ? 'text-amber-600' : 'text-muted-foreground')}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Lembretes Automáticos</p>
                      <p className="text-xs text-muted-foreground">Alertas de acompanhamento</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.enabled_reminders}
                    onCheckedChange={(v) => save({ enabled_reminders: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
              </div>
            </section>

            {/* ═══ RESUMOS PERIÓDICOS ═══ */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Resumos Periódicos
              </p>

              {/* Diário */}
              <div className="rounded-xl border bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        settings?.daily_digest_enabled ? 'bg-violet-500/15' : 'bg-muted',
                      )}
                    >
                      <BarChart3
                        className={cn('w-4 h-4', settings?.daily_digest_enabled ? 'text-violet-600' : 'text-muted-foreground')}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Resumo Diário</p>
                      <p className="text-xs text-muted-foreground">Relatório de atividades do dia</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.daily_digest_enabled}
                    onCheckedChange={(v) => save({ daily_digest_enabled: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-violet-500"
                  />
                </div>
                {settings?.daily_digest_enabled && (
                  <div className="px-3 pb-3 pt-0 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Horário:</Label>
                    <Input
                      type="time"
                      className="h-8 w-28 text-sm"
                      value={(settings.daily_digest_time || '19:00:00').slice(0, 5)}
                      onChange={(e) => save({ daily_digest_time: `${e.target.value}:00` })}
                    />
                  </div>
                )}
              </div>

              {/* Semanal */}
              <div className="rounded-xl border bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        settings?.weekly_digest_enabled ? 'bg-violet-500/15' : 'bg-muted',
                      )}
                    >
                      <BarChart3
                        className={cn(
                          'w-4 h-4',
                          settings?.weekly_digest_enabled ? 'text-violet-600' : 'text-muted-foreground',
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Resumo Semanal</p>
                      <p className="text-xs text-muted-foreground">Toda sexta-feira</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.weekly_digest_enabled}
                    onCheckedChange={(v) => save({ weekly_digest_enabled: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-violet-500"
                  />
                </div>
                {settings?.weekly_digest_enabled && (
                  <div className="px-3 pb-3 pt-0 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Horário:</Label>
                    <Input
                      type="time"
                      className="h-8 w-28 text-sm"
                      value={(settings.weekly_digest_time || '18:00:00').slice(0, 5)}
                      onChange={(e) => save({ weekly_digest_time: `${e.target.value}:00` })}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ═══ FUSO HORÁRIO ═══ */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Fuso Horário
              </p>
              <div className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Timezone operacional</p>
                </div>
                <Popover open={tzOpen} onOpenChange={setTzOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal h-9 text-sm"
                    >
                      <span className="truncate">{settings?.timezone || 'America/Sao_Paulo'}</span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar..." />
                      <CommandList>
                        <CommandEmpty>Nenhuma encontrada.</CommandEmpty>
                        <CommandGroup>
                          {SUPPORTED_TIMEZONES.map((tz) => (
                            <CommandItem
                              key={tz}
                              value={tz}
                              onSelect={() => {
                                save({ timezone: tz });
                                setTzOpen(false);
                              }}
                            >
                              {tz}
                              <Check
                                className={cn(
                                  'ml-auto h-4 w-4',
                                  (settings?.timezone || 'America/Sao_Paulo') === tz
                                    ? 'opacity-100'
                                    : 'opacity-0',
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </section>

            {/* Saving indicator */}
            {saving && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Salvando...
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
