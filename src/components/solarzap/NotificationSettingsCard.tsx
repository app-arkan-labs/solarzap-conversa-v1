import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Bell, MessageCircle, Mail, AlarmClock, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

interface AutomationCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}

const FALLBACK_TIMEZONES = [
    'America/Sao_Paulo',
    'America/Araguaina',
    'America/Bahia',
    'America/Belem',
    'America/Boa_Vista',
    'America/Campo_Grande',
    'America/Cuiaba',
    'America/Eirunepe',
    'America/Fortaleza',
    'America/Maceio',
    'America/Manaus',
    'America/Noronha',
    'America/Porto_Velho',
    'America/Recife',
    'America/Rio_Branco',
    'America/Santarem',
    'UTC',
];

const SUPPORTED_TIMEZONES = (() => {
    const intlWithSupportedValuesOf = Intl as typeof Intl & {
        supportedValuesOf?: (key: string) => string[];
    };

    if (typeof intlWithSupportedValuesOf.supportedValuesOf === 'function') {
        try {
            const values = intlWithSupportedValuesOf.supportedValuesOf('timeZone');
            if (values.length > 0) return values;
        } catch {
            // Fallback list below
        }
    }

    return FALLBACK_TIMEZONES;
})();

function AutomationCard({ title, description, icon, enabled, onToggle }: AutomationCardProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
                enabled
                    ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                    : "bg-muted/30 border-border/50 hover:bg-muted/50"
            )}
        >
            <div className="flex items-center gap-4">
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                    enabled ? "bg-primary/10" : "bg-muted"
                )}>
                    {icon}
                </div>
                <div>
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                        {title}
                        {enabled ? (
                            <Badge className="bg-primary/10 text-primary border-0 text-xs">
                                Ativa
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="text-xs">
                                Inativa
                            </Badge>
                        )}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {description}
                    </p>
                </div>
            </div>
            <Switch
                checked={enabled}
                onCheckedChange={onToggle}
                className="data-[state=checked]:bg-primary"
            />
        </div>
    );
}

export function NotificationSettingsCard() {
    const { toast } = useToast();
    const {
        settings: notificationSettings,
        loading: notificationSettingsLoading,
        saving: notificationSettingsSaving,
        updateSettings: updateNotificationSettings,
    } = useNotificationSettings();
    const { instances } = useUserWhatsAppInstances();
    const [emailRecipientsInput, setEmailRecipientsInput] = useState('');
    const [timezoneOpen, setTimezoneOpen] = useState(false);

    useEffect(() => {
        if (!notificationSettings) return;
        setEmailRecipientsInput((notificationSettings.email_recipients || []).join(', '));
    }, [notificationSettings]);

    const saveNotificationPatch = async (patch: Record<string, unknown>) => {
        try {
            await updateNotificationSettings(patch);
        } catch (error) {
            console.error('Failed to update notification settings:', error);
            toast({
                title: "Erro ao salvar notificações",
                description: "Não foi possível salvar a configuração.",
                variant: "destructive",
            });
        }
    };

    return (
        <Card className="border-0 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/5">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Bell className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Notificações e Resumo da IA</CardTitle>
                            <CardDescription className="mt-1">
                                Configurações globais de notificação e resumos
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </div>

            <CardContent className="p-6 space-y-4">
                <AutomationCard
                    title="Ativar notificações"
                    description="Liga/desliga o envio de notificações em todos os canais"
                    icon={<Bell className="w-5 h-5 text-emerald-600" />}
                    enabled={!!notificationSettings?.enabled_notifications}
                    onToggle={(enabled) => saveNotificationPatch({ enabled_notifications: enabled })}
                />

                <AutomationCard
                    title="WhatsApp"
                    description="Enviar notificações operacionais no WhatsApp"
                    icon={<MessageCircle className="w-5 h-5 text-green-600" />}
                    enabled={!!notificationSettings?.enabled_whatsapp}
                    onToggle={(enabled) => saveNotificationPatch({ enabled_whatsapp: enabled })}
                />

                {notificationSettings?.enabled_whatsapp && (
                    <div className="space-y-2 p-4 rounded-xl border bg-background/50">
                        <Label>Instância WhatsApp</Label>
                        <Select
                            value={notificationSettings.whatsapp_instance_name || '__none'}
                            onValueChange={(value) => saveNotificationPatch({
                                whatsapp_instance_name: value === '__none' ? null : value,
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma instância" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none">Nenhuma</SelectItem>
                                {instances.map((instance) => (
                                    <SelectItem key={instance.id} value={instance.instance_name}>
                                        {instance.display_name || instance.instance_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <AutomationCard
                    title="E-mail"
                    description="Enviar notificações por e-mail (Resend)"
                    icon={<Mail className="w-5 h-5 text-blue-600" />}
                    enabled={!!notificationSettings?.enabled_email}
                    onToggle={(enabled) => saveNotificationPatch({ enabled_email: enabled })}
                />

                {notificationSettings?.enabled_email && (
                    <div className="space-y-2 p-4 rounded-xl border bg-background/50">
                        <Label>Destinatários (separar por vírgula)</Label>
                        <Input
                            value={emailRecipientsInput}
                            placeholder="gestor@empresa.com, vendas@empresa.com"
                            onChange={(e) => setEmailRecipientsInput(e.target.value)}
                            onBlur={() => {
                                const recipients = Array.from(
                                    new Set(
                                        emailRecipientsInput
                                            .split(/[,\n;]+/)
                                            .map((item) => item.trim().toLowerCase())
                                            .filter(Boolean)
                                    )
                                );
                                saveNotificationPatch({ email_recipients: recipients });
                            }}
                        />
                    </div>
                )}

                <AutomationCard
                    title="Lembretes"
                    description="Permite envio de lembretes automáticos"
                    icon={<AlarmClock className="w-5 h-5 text-amber-600" />}
                    enabled={!!notificationSettings?.enabled_reminders}
                    onToggle={(enabled) => saveNotificationPatch({ enabled_reminders: enabled })}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border bg-background/50">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Resumo da IA diário</Label>
                            <Switch
                                checked={!!notificationSettings?.daily_digest_enabled}
                                onCheckedChange={(checked) => saveNotificationPatch({ daily_digest_enabled: checked })}
                            />
                        </div>
                        <Input
                            type="time"
                            value={(notificationSettings?.daily_digest_time || '19:00:00').slice(0, 5)}
                            onChange={(e) => saveNotificationPatch({ daily_digest_time: `${e.target.value}:00` })}
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Resumo da IA semanal (sexta)</Label>
                            <Switch
                                checked={!!notificationSettings?.weekly_digest_enabled}
                                onCheckedChange={(checked) => saveNotificationPatch({ weekly_digest_enabled: checked })}
                            />
                        </div>
                        <Input
                            type="time"
                            value={(notificationSettings?.weekly_digest_time || '18:00:00').slice(0, 5)}
                            onChange={(e) => saveNotificationPatch({ weekly_digest_time: `${e.target.value}:00` })}
                        />
                    </div>
                </div>

                <div className="space-y-2 p-4 rounded-xl border bg-background/50">
                    <Label>Timezone operacional</Label>
                    <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between font-normal"
                            >
                                <span className="truncate">
                                    {notificationSettings?.timezone || 'America/Sao_Paulo'}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[340px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Buscar timezone..." />
                                <CommandList>
                                    <CommandEmpty>Nenhuma timezone encontrada.</CommandEmpty>
                                    <CommandGroup>
                                        {SUPPORTED_TIMEZONES.map((timezone) => (
                                            <CommandItem
                                                key={timezone}
                                                value={timezone}
                                                onSelect={() => {
                                                    saveNotificationPatch({ timezone });
                                                    setTimezoneOpen(false);
                                                }}
                                            >
                                                {timezone}
                                                <Check
                                                    className={cn(
                                                        'ml-auto h-4 w-4',
                                                        (notificationSettings?.timezone || 'America/Sao_Paulo') === timezone
                                                            ? 'opacity-100'
                                                            : 'opacity-0'
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

                {(notificationSettingsLoading || notificationSettingsSaving) && (
                    <p className="text-xs text-muted-foreground">
                        Sincronizando configurações de notificação...
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
