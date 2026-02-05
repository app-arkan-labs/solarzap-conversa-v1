import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Zap,
    GripVertical,
    MessageSquare,
    Phone,
    Calendar,
    Home,
    FileText,
    RotateCcw,
    Save,
    X,
    ChevronDown,
    ChevronUp,
    ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutomationSettings, AutomationSettings, DEFAULT_SETTINGS } from '@/hooks/useAutomationSettings';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface AutomationCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}

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

export function AutomationsView() {
    const {
        settings,
        hasChanges,
        updateSetting,
        saveChanges,
        cancelChanges,
        resetToDefaults
    } = useAutomationSettings();
    const [expandedMessages, setExpandedMessages] = useState(true);
    const { toast } = useToast();

    const handleSave = () => {
        saveChanges();
        toast({
            title: "✅ Configurações salvas",
            description: "Suas alterações foram salvas com sucesso.",
        });
    };

    const handleCancel = () => {
        cancelChanges();
        toast({
            title: "Alterações descartadas",
            description: "As configurações foram restauradas.",
        });
    };

    const handleReset = () => {
        resetToDefaults();
        toast({
            title: "Configurações restauradas",
            description: "Todas as automações foram restauradas para o padrão.",
        });
    };

    const dragDropAutomations = [
        {
            key: 'dragDropChamadaRealizada' as keyof AutomationSettings,
            title: 'Após Chamada Realizada',
            description: 'Perguntar se deseja mover para "Aguardando Proposta"',
            icon: <Phone className="w-5 h-5 text-green-500" />,
        },
        {
            key: 'dragDropAguardandoProposta' as keyof AutomationSettings,
            title: 'Aguardando Proposta',
            description: 'Sugerir geração de proposta após mover para esta etapa',
            icon: <FileText className="w-5 h-5 text-orange-500" />,
        },
        {
            key: 'dragDropPropostaPronta' as keyof AutomationSettings,
            title: 'Proposta Pronta',
            description: 'Abrir modal para agendar apresentação da proposta',
            icon: <FileText className="w-5 h-5 text-indigo-500" />,
        },
        {
            key: 'dragDropChamadaAgendada' as keyof AutomationSettings,
            title: 'Chamada Agendada',
            description: 'Abrir modal de agendamento ao mover para esta etapa',
            icon: <Calendar className="w-5 h-5 text-purple-500" />,
        },
        {
            key: 'dragDropVisitaAgendada' as keyof AutomationSettings,
            title: 'Visita Agendada',
            description: 'Abrir modal de agendamento de visita técnica',
            icon: <Home className="w-5 h-5 text-teal-500" />,
        },
    ];

    const messageSettings = [
        {
            key: 'videoCallMessage' as keyof AutomationSettings,
            enabledKey: 'videoCallMessageEnabled' as keyof AutomationSettings,
            title: 'Google Meet',
            description: 'Link do Google Meet para vídeo chamadas. Use {nome} para o nome do cliente.',
            placeholder: DEFAULT_SETTINGS.videoCallMessage,
        },
        {
            key: 'proposalReadyMessage' as keyof AutomationSettings,
            enabledKey: 'proposalReadyMessageEnabled' as keyof AutomationSettings,
            title: 'Mensagem de Proposta Pronta',
            description: 'Preenche o chat quando a proposta está pronta. Use {nome} para o nome do cliente.',
            placeholder: DEFAULT_SETTINGS.proposalReadyMessage,
        },
        {
            key: 'visitScheduledMessage' as keyof AutomationSettings,
            enabledKey: 'visitScheduledMessageEnabled' as keyof AutomationSettings,
            title: 'Mensagem de Visita Agendada',
            description: 'Preenche o chat ao agendar visita técnica. Use {data} e {hora}.',
            placeholder: DEFAULT_SETTINGS.visitScheduledMessage,
        },
        {
            key: 'callScheduledMessage' as keyof AutomationSettings,
            enabledKey: 'callScheduledMessageEnabled' as keyof AutomationSettings,
            title: 'Mensagem de Reunião Agendada',
            description: 'Preenche o chat ao agendar reunião. Use {data} e {hora}.',
            placeholder: DEFAULT_SETTINGS.callScheduledMessage,
        },
        {
            key: 'askForReferralMessage' as keyof AutomationSettings,
            enabledKey: 'askForReferralMessageEnabled' as keyof AutomationSettings,
            title: 'Mensagem para Pedir Indicação',
            description: 'Preenche o chat na etapa de "Coletar Avaliação" para pedir indicações.',
            placeholder: DEFAULT_SETTINGS.askForReferralMessage,
        },
    ];

    const activeCount = dragDropAutomations.filter(a => settings[a.key] === true).length;

    return (
        <>
            <ScrollArea className="flex-1 h-full">
                <div className="bg-muted/30 min-h-full pb-24">
                    {/* Header Premium */}
                    <div className="bg-gradient-to-r from-primary/10 via-background to-amber-500/10 border-b">
                        <div className="max-w-4xl mx-auto px-6 py-8">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                                        <Zap className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-bold text-foreground">Automações</h1>
                                        <p className="text-muted-foreground">
                                            Configure as automações do pipeline de vendas
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-foreground">{activeCount}/{dragDropAutomations.length}</div>
                                        <div className="text-sm text-muted-foreground">Automações ativas</div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReset}
                                        className="gap-2"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Restaurar Padrão
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
                        {/* Skip Backward Moves Card */}
                        <Card className="border-0 shadow-sm overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/5">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                                <ArrowLeftRight className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                                    Ignorar Retrocessos
                                                    {settings.skipBackwardMoves ? (
                                                        <Badge className="bg-blue-500/10 text-blue-600 border-0 text-xs">
                                                            Ativo
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Inativo
                                                        </Badge>
                                                    )}
                                                </h3>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Não disparar automações quando um lead volta para etapas anteriores do pipeline
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={settings.skipBackwardMoves}
                                            onCheckedChange={(checked) => updateSetting('skipBackwardMoves', checked)}
                                            className="data-[state=checked]:bg-blue-500"
                                        />
                                    </div>
                                </CardContent>
                            </div>
                        </Card>

                        {/* Drag & Drop Automations */}
                        <Card className="border-0 shadow-sm overflow-hidden">
                            <div className="bg-gradient-to-r from-primary/10 to-primary/5">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                                            <GripVertical className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl">Automações de Pipeline</CardTitle>
                                            <CardDescription className="mt-1">
                                                Ações automáticas ao arrastar leads entre etapas
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                            </div>

                            <CardContent className="p-6 space-y-3">
                                {dragDropAutomations.map((automation) => (
                                    <AutomationCard
                                        key={automation.key}
                                        title={automation.title}
                                        description={automation.description}
                                        icon={automation.icon}
                                        enabled={settings[automation.key] as boolean}
                                        onToggle={(enabled) => updateSetting(automation.key, enabled)}
                                    />
                                ))}
                            </CardContent>
                        </Card>

                        {/* Pre-configured Messages */}
                        <Card className="border-0 shadow-sm overflow-hidden">
                            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/5">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                                                <MessageSquare className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-xl">Mensagens Pré-Configuradas</CardTitle>
                                                <CardDescription className="mt-1">
                                                    Personalize as mensagens automáticas enviadas aos clientes
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setExpandedMessages(!expandedMessages)}
                                            className="gap-2"
                                        >
                                            {expandedMessages ? (
                                                <>
                                                    <ChevronUp className="w-4 h-4" />
                                                    Recolher
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronDown className="w-4 h-4" />
                                                    Expandir
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardHeader>
                            </div>

                            {expandedMessages && (
                                <CardContent className="p-6 space-y-6">
                                    {messageSettings.map((msg) => (
                                        <div key={msg.key} className="space-y-3 p-4 rounded-xl border bg-background/50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor={msg.key} className="text-sm font-medium">
                                                        {msg.title}
                                                    </Label>
                                                    {settings[msg.enabledKey] ? (
                                                        <Badge className="bg-primary/10 text-primary border-0 text-xs">
                                                            Ativa
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Inativa
                                                        </Badge>
                                                    )}
                                                </div>
                                                <Switch
                                                    checked={settings[msg.enabledKey] as boolean}
                                                    onCheckedChange={(checked) => updateSetting(msg.enabledKey, checked)}
                                                    className="data-[state=checked]:bg-primary"
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {msg.description}
                                            </p>
                                            <Textarea
                                                id={msg.key}
                                                value={settings[msg.key] as string}
                                                onChange={(e) => updateSetting(msg.key, e.target.value)}
                                                placeholder={msg.placeholder}
                                                className="min-h-[100px] resize-none"
                                                disabled={!settings[msg.enabledKey]}
                                            />
                                        </div>
                                    ))}
                                </CardContent>
                            )}
                        </Card>

                        {/* Help Card */}
                        <Card className="border-0 shadow-sm bg-gradient-to-r from-muted/50 to-muted/30">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <Zap className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground mb-1">Dica</h3>
                                        <p className="text-sm text-muted-foreground">
                                            As automações de pipeline são acionadas quando você arrasta um lead de uma etapa para outra.
                                            Com "Ignorar Retrocessos" ativo, leads que voltam para etapas anteriores não dispararão as automações novamente.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </ScrollArea>

            {/* Floating Save/Cancel Buttons */}
            {hasChanges && (
                <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center gap-3 bg-background/95 backdrop-blur-sm border rounded-xl shadow-lg p-3">
                        <div className="text-sm text-muted-foreground mr-2">
                            Alterações não salvas
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancel}
                            className="gap-2"
                        >
                            <X className="w-4 h-4" />
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            className="gap-2 bg-primary hover:bg-primary/90"
                        >
                            <Save className="w-4 h-4" />
                            Salvar
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
