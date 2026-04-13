import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  UserCircle,
  Reply,
  Info,
  UserPlus,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Phone,
  Landmark,
  CircleDollarSign,
  Zap,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useToast } from "@/hooks/use-toast";
import {
  mergeRecipientInput,
  normalizeRecipients,
  removeRecipient,
} from "@/lib/notificationRecipientEditor";

/* â”€â”€ Timezone list â”€â”€ */
const FALLBACK_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Araguaina",
  "America/Bahia",
  "America/Belem",
  "America/Boa_Vista",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Fortaleza",
  "America/Maceio",
  "America/Manaus",
  "America/Noronha",
  "America/Porto_Velho",
  "America/Recife",
  "America/Rio_Branco",
  "UTC",
];

const SUPPORTED_TIMEZONES = (() => {
  const intlExt = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intlExt.supportedValuesOf === "function") {
    try {
      const vals = intlExt.supportedValuesOf("timeZone");
      if (vals.length > 0) return vals;
    } catch {
      /* fallback */
    }
  }
  return FALLBACK_TIMEZONES;
})();

/* â”€â”€ Component â”€â”€ */
interface Props {
  onClose: () => void;
}

export function NotificationConfigPanel({ onClose }: Props) {
  const { toast } = useToast();
  const { settings, loading, saving, updateSettings } =
    useNotificationSettings();
  const [emailInput, setEmailInput] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [whatsappRecipients, setWhatsappRecipients] = useState<string[]>([]);
  const [senderNameInput, setSenderNameInput] = useState("");
  const [replyToInput, setReplyToInput] = useState("");
  const [tzOpen, setTzOpen] = useState(false);

  useEffect(() => {
    if (settings) {
      setWhatsappRecipients(
        normalizeRecipients(settings.whatsapp_recipients || [], "whatsapp"),
      );
      setEmailRecipients(
        normalizeRecipients(settings.email_recipients || [], "email"),
      );
      setSenderNameInput(settings.email_sender_name || "");
      setReplyToInput(settings.email_reply_to || "");
    }
  }, [settings]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      await updateSettings(patch);
    } catch {
      toast({
        title: "Erro ao salvar",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const addWhatsappRecipients = async () => {
    const result = mergeRecipientInput(
      whatsappRecipients,
      whatsappInput,
      "whatsapp",
    );
    if (result.parsedCount === 0) return;
    if (result.invalid.length > 0) {
      toast({
        title: "Numero WhatsApp invalido",
        description: "Use DDD + numero (10 ou 11 digitos), sem + ou espacos.",
        variant: "destructive",
      });
    }
    if (result.added.length === 0) {
      setWhatsappInput("");
      return;
    }
    setWhatsappRecipients(result.next);
    setWhatsappInput("");
    await save({ whatsapp_recipients: result.next });
  };

  const removeWhatsappRecipient = async (value: string) => {
    const next = removeRecipient(whatsappRecipients, value, "whatsapp");
    setWhatsappRecipients(next);
    await save({ whatsapp_recipients: next });
  };

  const addEmailRecipients = async () => {
    const result = mergeRecipientInput(emailRecipients, emailInput, "email");
    if (result.parsedCount === 0) return;
    if (result.invalid.length > 0) {
      toast({
        title: "E-mail invalido",
        description: "Revise o formato dos e-mails informados.",
        variant: "destructive",
      });
    }
    if (result.added.length === 0) {
      setEmailInput("");
      return;
    }
    setEmailRecipients(result.next);
    setEmailInput("");
    await save({ email_recipients: result.next });
  };

  const removeEmailRecipient = async (value: string) => {
    const next = removeRecipient(emailRecipients, value, "email");
    setEmailRecipients(next);
    await save({ email_recipients: next });
  };

  const handleWhatsappToggle = async (nextValue: boolean) => {
    await save({ enabled_whatsapp: nextValue });
  };

  const on = !!settings?.enabled_notifications;

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      {/* â”€â”€ Header â”€â”€ */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">ConfiguraÃ§Ãµes</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
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
            {/* â•â•â• MASTER TOGGLE â•â•â• */}
            <div
              className={cn(
                "p-4 rounded-xl border-2 transition-all",
                on
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border bg-muted/20",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      on ? "bg-emerald-500/15" : "bg-muted",
                    )}
                  >
                    <Bell
                      className={cn(
                        "w-5 h-5",
                        on ? "text-emerald-600" : "text-muted-foreground",
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">NotificaÃ§Ãµes</p>
                    <p className="text-xs text-muted-foreground">
                      Liga/desliga todos os canais
                    </p>
                  </div>
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(v) => save({ enabled_notifications: v })}
                  data-testid="notification-global-toggle"
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>
            </div>

            {/* â•â•â• CANAIS DE ENVIO â•â•â• */}
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
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        settings?.enabled_whatsapp
                          ? "bg-green-500/15"
                          : "bg-muted",
                      )}
                    >
                      <MessageCircle
                        className={cn(
                          "w-4 h-4",
                          settings?.enabled_whatsapp
                            ? "text-green-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">WhatsApp</p>
                      <p className="text-xs text-muted-foreground">
                        NotificaÃ§Ãµes operacionais
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.enabled_whatsapp}
                    onCheckedChange={handleWhatsappToggle}
                    disabled={!on}
                    data-testid="notification-whatsapp-toggle"
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
                <div className="px-3 pb-3 pt-0 space-y-3">
                  <div className="rounded-lg border border-green-500/15 bg-green-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                      <div className="space-y-1 text-[11px] text-green-700/90">
                        <p>As notificacoes sao enviadas pela instancia SolarZap configurada no painel admin.</p>
                        <p>Voce define aqui apenas os numeros que devem receber os alertas.</p>
                      </div>
                    </div>
                  </div>

                  {settings?.enabled_whatsapp && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">
                        DestinatÃ¡rios WhatsApp (equipe interna)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-9 text-sm"
                          value={whatsappInput}
                          data-testid="notification-whatsapp-input"
                          placeholder="11999999999"
                          onChange={(e) => setWhatsappInput(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addWhatsappRecipients();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          data-testid="notification-whatsapp-add"
                          className="h-9"
                          onClick={() => {
                            void addWhatsappRecipients();
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                      <div
                        className="flex flex-wrap gap-2 mt-2"
                        data-testid="notification-whatsapp-list"
                      >
                        {whatsappRecipients.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground/70">
                            Nenhum numero cadastrado.
                          </p>
                        ) : (
                          whatsappRecipients.map((recipient) => (
                            <div
                              key={recipient}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
                            >
                              <span>{recipient}</span>
                              <button
                                type="button"
                                data-testid={`notification-whatsapp-remove-${recipient}`}
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  void removeWhatsappRecipient(recipient);
                                }}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        Use DDD + numero. Aceita colagem de multiplos numeros
                        (virgula, ; ou quebra de linha).
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        Envio somente para os nÃºmeros listados acima (sem
                        destinatÃ¡rio padrÃ£o oculto).
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* E-mail */}
              <div className="rounded-xl border bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        settings?.enabled_email ? "bg-blue-500/15" : "bg-muted",
                      )}
                    >
                      <Mail
                        className={cn(
                          "w-4 h-4",
                          settings?.enabled_email
                            ? "text-blue-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">E-mail</p>
                      <p className="text-xs text-muted-foreground">
                        NotificaÃ§Ãµes por e-mail
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.enabled_email}
                    onCheckedChange={(v) => save({ enabled_email: v })}
                    disabled={!on}
                    data-testid="notification-email-toggle"
                    className="data-[state=checked]:bg-blue-500"
                  />
                </div>
                {settings?.enabled_email && (
                  <div className="px-3 pb-3 pt-0 space-y-3">
                    <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 p-3">
                      <div className="flex items-start gap-2">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                        <div className="space-y-1 text-[11px] text-blue-700/90">
                          <p>Os e-mails saem como ARKAN SOLAR.</p>
                          <p>As respostas vao para contato@arkanlabs.com.br.</p>
                        </div>
                      </div>
                    </div>
                    {/* Recipients */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">
                        DestinatÃ¡rios de e-mail
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-9 text-sm"
                          value={emailInput}
                          data-testid="notification-email-input"
                          placeholder="gestor@empresa.com"
                          onChange={(e) => setEmailInput(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addEmailRecipients();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          data-testid="notification-email-add"
                          className="h-9"
                          onClick={() => {
                            void addEmailRecipients();
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                      <div
                        className="flex flex-wrap gap-2 mt-2"
                        data-testid="notification-email-list"
                      >
                        {emailRecipients.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground/70">
                            Nenhum e-mail cadastrado.
                          </p>
                        ) : (
                          emailRecipients.map((recipient) => (
                            <div
                              key={recipient}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
                            >
                              <span>{recipient}</span>
                              <button
                                type="button"
                                data-testid={`notification-email-remove-${recipient.replace(/[^a-z0-9]/g, "-")}`}
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  void removeEmailRecipient(recipient);
                                }}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        Aceita colagem de multiplos e-mails (virgula, ; ou
                        quebra de linha).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* â•â•â• LEMBRETES â•â•â• */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Lembretes
              </p>
              <div className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        settings?.enabled_reminders
                          ? "bg-amber-500/15"
                          : "bg-muted",
                      )}
                    >
                      <AlarmClock
                        className={cn(
                          "w-4 h-4",
                          settings?.enabled_reminders
                            ? "text-amber-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Lembretes AutomÃ¡ticos
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Alertas de acompanhamento
                      </p>
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

            {/* â•â•â• EVENTOS MONITORADOS â•â•â• */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Eventos Monitorados
              </p>
              <p className="text-[11px] text-muted-foreground/70 px-1 -mt-1">
                Escolha quais eventos geram notificaÃ§Ãµes
              </p>

              <div className="rounded-xl border bg-background/50 divide-y divide-border overflow-hidden">
                {/* Novo Lead */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_novo_lead
                          ? "bg-emerald-500/15"
                          : "bg-muted",
                      )}
                    >
                      <UserPlus
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_novo_lead
                            ? "text-emerald-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Novo Lead</p>
                      <p className="text-[10px] text-muted-foreground">
                        Lead criado no CRM
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_novo_lead !== false}
                    onCheckedChange={(v) => save({ evt_novo_lead: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-emerald-500 scale-90"
                  />
                </div>

                {/* MudanÃ§a de Etapa */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_stage_changed
                          ? "bg-blue-500/15"
                          : "bg-muted",
                      )}
                    >
                      <ArrowRightLeft
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_stage_changed
                            ? "text-blue-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">MudanÃ§a de Etapa</p>
                      <p className="text-[10px] text-muted-foreground">
                        Lead mudou no pipeline
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_stage_changed !== false}
                    onCheckedChange={(v) => save({ evt_stage_changed: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-blue-500 scale-90"
                  />
                </div>

                {/* Visita Agendada */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_visita_agendada
                          ? "bg-teal-500/15"
                          : "bg-muted",
                      )}
                    >
                      <Calendar
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_visita_agendada
                            ? "text-teal-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Visita Agendada</p>
                      <p className="text-[10px] text-muted-foreground">
                        Nova visita marcada
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_visita_agendada !== false}
                    onCheckedChange={(v) => save({ evt_visita_agendada: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-teal-500 scale-90"
                  />
                </div>

                {/* Visita Realizada */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_visita_realizada
                          ? "bg-green-500/15"
                          : "bg-muted",
                      )}
                    >
                      <CheckCircle2
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_visita_realizada
                            ? "text-green-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Visita Realizada</p>
                      <p className="text-[10px] text-muted-foreground">
                        Visita concluÃ­da
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_visita_realizada !== false}
                    onCheckedChange={(v) => save({ evt_visita_realizada: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-green-500 scale-90"
                  />
                </div>

                {/* Chamada Agendada */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_chamada_agendada
                          ? "bg-purple-500/15"
                          : "bg-muted",
                      )}
                    >
                      <Phone
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_chamada_agendada
                            ? "text-purple-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Chamada Agendada</p>
                      <p className="text-[10px] text-muted-foreground">
                        Nova chamada marcada
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_chamada_agendada !== false}
                    onCheckedChange={(v) => save({ evt_chamada_agendada: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-purple-500 scale-90"
                  />
                </div>

                {/* Chamada Realizada */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_chamada_realizada
                          ? "bg-green-600/15"
                          : "bg-muted",
                      )}
                    >
                      <CheckCircle2
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_chamada_realizada
                            ? "text-green-700"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Chamada Realizada</p>
                      <p className="text-[10px] text-muted-foreground">
                        Chamada concluÃ­da
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_chamada_realizada !== false}
                    onCheckedChange={(v) => save({ evt_chamada_realizada: v })}
                    disabled={!on}
                    className="data-[state=checked]:bg-green-600 scale-90"
                  />
                </div>

                {/* Financiamento */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_financiamento_update
                          ? "bg-amber-500/15"
                          : "bg-muted",
                      )}
                    >
                      <Landmark
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_financiamento_update
                            ? "text-amber-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Financiamento</p>
                      <p className="text-[10px] text-muted-foreground">
                        AtualizaÃ§Ã£o de financiamento
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_financiamento_update !== false}
                    onCheckedChange={(v) =>
                      save({ evt_financiamento_update: v })
                    }
                    disabled={!on}
                    className="data-[state=checked]:bg-amber-500 scale-90"
                  />
                </div>

                {/* Parcela vencida */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        settings?.evt_installment_due_check
                          ? "bg-emerald-500/15"
                          : "bg-muted",
                      )}
                    >
                      <CircleDollarSign
                        className={cn(
                          "w-3.5 h-3.5",
                          settings?.evt_installment_due_check
                            ? "text-emerald-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Parcela Vencida</p>
                      <p className="text-[10px] text-muted-foreground">
                        ConfirmaÃ§Ã£o de pagamento
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.evt_installment_due_check !== false}
                    onCheckedChange={(v) =>
                      save({ evt_installment_due_check: v })
                    }
                    disabled={!on}
                    className="data-[state=checked]:bg-emerald-500 scale-90"
                  />
                </div>
              </div>
            </section>

            {/* â•â•â• RESUMOS PERIÃ“DICOS â•â•â• */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Resumos PeriÃ³dicos
              </p>

              {/* DiÃ¡rio */}
              <div className="rounded-xl border bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        settings?.daily_digest_enabled
                          ? "bg-violet-500/15"
                          : "bg-muted",
                      )}
                    >
                      <BarChart3
                        className={cn(
                          "w-4 h-4",
                          settings?.daily_digest_enabled
                            ? "text-violet-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Resumo DiÃ¡rio</p>
                      <p className="text-xs text-muted-foreground">
                        RelatÃ³rio de atividades do dia
                      </p>
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
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      HorÃ¡rio:
                    </Label>
                    <Input
                      type="time"
                      className="h-8 w-28 text-sm"
                      value={(settings.daily_digest_time || "19:00:00").slice(
                        0,
                        5,
                      )}
                      onChange={(e) =>
                        save({ daily_digest_time: `${e.target.value}:00` })
                      }
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
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        settings?.weekly_digest_enabled
                          ? "bg-violet-500/15"
                          : "bg-muted",
                      )}
                    >
                      <BarChart3
                        className={cn(
                          "w-4 h-4",
                          settings?.weekly_digest_enabled
                            ? "text-violet-600"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Resumo Semanal</p>
                      <p className="text-xs text-muted-foreground">
                        Toda sexta-feira
                      </p>
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
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      HorÃ¡rio:
                    </Label>
                    <Input
                      type="time"
                      className="h-8 w-28 text-sm"
                      value={(settings.weekly_digest_time || "18:00:00").slice(
                        0,
                        5,
                      )}
                      onChange={(e) =>
                        save({ weekly_digest_time: `${e.target.value}:00` })
                      }
                    />
                  </div>
                )}
              </div>
            </section>

            {/* â•â•â• FUSO HORÃRIO â•â•â• */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Fuso HorÃ¡rio
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
                      <span className="truncate">
                        {settings?.timezone || "America/Sao_Paulo"}
                      </span>
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
                                  "ml-auto h-4 w-4",
                                  (settings?.timezone ||
                                    "America/Sao_Paulo") === tz
                                    ? "opacity-100"
                                    : "opacity-0",
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
