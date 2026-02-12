import React, { useState } from 'react';
import { useAISettings } from '../../hooks/useAISettings';
import { useUserWhatsAppInstances } from '../../hooks/useUserWhatsAppInstances';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { PIPELINE_STAGES, PipelineStage } from '../../types/solarzap';
import { BrainCircuit, AlertTriangle, RefreshCcw, Save, Bot } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Textarea } from '../ui/textarea';

export function AIAgentsView() {
    const { settings, stageConfigs, updateGlobalSettings, updateStageConfig, loading, restoreDefaultPrompt } = useAISettings();
    const { instances: whatsappInstances, toggleAllInstances, setInstanceAiEnabled, activateAiForAllLeads } = useUserWhatsAppInstances();
    const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);

    const [isWarningOpen, setIsWarningOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [tempPrompt, setTempPrompt] = useState('');

    // Local state for Assistant Name to prevent auto-refresh/focus loss
    const [localAssistantName, setLocalAssistantName] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Sync local state when settings load
    React.useEffect(() => {
        if (settings?.assistant_identity_name) {
            setLocalAssistantName(settings.assistant_identity_name);
        }
    }, [settings?.assistant_identity_name]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalAssistantName(e.target.value);
        setHasUnsavedChanges(true); // Simplified check; strictly speaking should compare with original, but user just wants the button to appear on edit
    };

    const handleCancelNameChange = () => {
        setLocalAssistantName(settings?.assistant_identity_name || '');
        setHasUnsavedChanges(false);
    };

    const handleSaveNameChange = async () => {
        await updateGlobalSettings({ assistant_identity_name: localAssistantName });
        setHasUnsavedChanges(false);
    };

    const handleEditClick = (stage: PipelineStage, currentPrompt: string) => {
        setEditingStage(stage);
        setTempPrompt(currentPrompt);
        setIsWarningOpen(true);
    };

    const handleConfirmWarning = () => {
        setIsWarningOpen(false);
        setIsEditorOpen(true);
    };

    const handleSavePrompt = async () => {
        if (editingStage) {
            await updateStageConfig(editingStage, { prompt_override: tempPrompt });
            setIsEditorOpen(false);
            setEditingStage(null);
        }
    };

    const handleRestoreDefault = async () => {
        if (editingStage) {
            if (window.confirm("Isso vai restaurar o prompt desta etapa para o padrão do sistema. Continuar?")) {
                await restoreDefaultPrompt(editingStage);
                setIsEditorOpen(false);
                setEditingStage(null);
            }
        }
    };

    if (loading) return <div className="p-8 text-center">Carregando módulos de IA...</div>;

    const pipelineStagesInOrder: PipelineStage[] = [
        'novo_lead', 'respondeu', 'chamada_agendada', 'nao_compareceu', 'chamada_realizada',
        'aguardando_proposta', 'proposta_pronta', 'visita_agendada', 'visita_realizada',
        'proposta_negociacao', 'financiamento', 'contrato_assinado', 'projeto_pago',
        'aguardando_instalacao', 'projeto_instalado', 'coletar_avaliacao', 'contato_futuro', 'perdido'
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 p-6 space-y-6 overflow-y-auto relative">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Inteligência Artificial</h1>
                        <p className="text-slate-600">Configure os agentes autônomos para cada etapa do seu funil.</p>
                    </div>
                </div>
                {/* Global Restore placeholder or just indication */}
                <div className="flex items-center gap-2">
                    <Badge variant={settings?.is_active ? "default" : "secondary"}>
                        {settings?.is_active ? "SISTEMA ATIVO" : "SISTEMA PAUSADO"}
                    </Badge>
                </div>
            </div>

            {/* Global Settings */}
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase text-slate-500">Controle Mestre</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-semibold">Sistema AI Mestre</Label>
                                    <p className="text-sm text-muted-foreground">
                                        {settings?.is_active
                                            ? "O sistema está ATIVO e monitorando o pipeline."
                                            : "O sistema está PAUSADO. Nenhuma ação será tomada."}
                                    </p>
                                </div>
                                <Switch
                                    checked={settings?.is_active || false}
                                    onCheckedChange={(checked) => updateGlobalSettings({ is_active: checked })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase text-slate-500">Identidade do Assistente</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Nome do Assistente</Label>
                                <Input
                                    value={localAssistantName}
                                    onChange={handleNameChange}
                                    placeholder="Ex: Consultor Solar, Ana, Carlos..."
                                />
                            </div>
                            {/* API Key hidden for security - uses Backend ENV */}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium uppercase text-slate-500">Controle por Instância</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Instâncias com IA Ativa</Label>
                            <div className="text-sm text-slate-600 mb-2">
                                A instância que receber a mensagem é a mesma que responderá. Ative/desative a IA em <strong>Central de Integrações &gt; WhatsApp Business</strong>.
                            </div>

                            <div className="flex flex-col gap-2 mt-2">
                                {whatsappInstances.filter(i => i.status === 'connected').length === 0 ? (
                                    <div className="text-sm text-muted-foreground italic flex items-center gap-2 p-2 border border-dashed rounded bg-slate-50">
                                        <AlertTriangle className="h-4 w-4" />
                                        Nenhuma instância online no momento.
                                    </div>
                                ) : (
                                    whatsappInstances.filter(i => i.status === 'connected').map(inst => (
                                        <div key={inst.id} className="flex items-center justify-between p-2 border rounded bg-white hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className={`h-2 w-2 rounded-full ${inst.status === 'connected' ? 'bg-green-500' : 'bg-red-400'}`} />
                                                <span className="font-medium text-sm">{inst.instance_name}</span>
                                                {/* Instance specific AI Badge - Reflects Global State too */}
                                                <Badge
                                                    variant={inst.ai_enabled && settings?.is_active ? 'default' : 'secondary'}
                                                    className={`text-[10px] h-5 ${inst.ai_enabled && settings?.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}
                                                >
                                                    {!settings?.is_active
                                                        ? 'Sistema Pausado'
                                                        : inst.ai_enabled
                                                            ? 'IA Ativa'
                                                            : 'IA Pausada'}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* AI Toggle Switch */}
                                                <div className="flex items-center gap-2 mr-2 px-2 py-1 bg-muted/30 rounded-md border border-border/50"
                                                    title={!settings?.is_active ? "IA Global Desativada" : "Ativar/Desativar IA para esta instância"}
                                                >
                                                    <span className="text-xs font-medium text-muted-foreground">IA</span>
                                                    <Switch
                                                        checked={!!inst.ai_enabled}
                                                        onCheckedChange={(checked) => setInstanceAiEnabled(inst.instance_name, checked)}
                                                        disabled={!settings?.is_active}
                                                        className="scale-75 origin-right data-[state=checked]:bg-green-500"
                                                    />
                                                </div>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                                                    onClick={async () => {
                                                        const count = await activateAiForAllLeads(inst.instance_name);
                                                        if (count !== null) {
                                                            toast.success(`IA ativada para ${count} contato(s) da instância ${inst.instance_name}`);
                                                        }
                                                    }}
                                                >
                                                    <Bot className="w-3 h-3 mr-1.5" />
                                                    Ativar para todos os contatos
                                                </Button>

                                                <Badge variant="outline" className="text-xs bg-white text-green-700 border-green-200">
                                                    Online
                                                </Badge>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Pipeline Stages Agents */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Agentes de Pipeline</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {pipelineStagesInOrder.map((stage) => {
                        const config = stageConfigs.find(c => c.pipeline_stage === stage);
                        const stageInfo = PIPELINE_STAGES[stage];
                        const isEnabled = config?.is_active || false;
                        // Effective prompt: override > default > empty
                        const effectivePrompt = config?.prompt_override || config?.default_prompt || '';

                        return (
                            <Card key={stage} className={`border-l-4 ${isEnabled ? 'border-l-green-500' : 'border-l-slate-300'} hover:shadow-md transition-shadow`}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-full ${stageInfo.color.replace('bg-', 'bg-opacity-20 text-')}`}>
                                                {stageInfo.icon}
                                            </div>
                                            <span className="font-semibold text-sm">{stageInfo.title}</span>
                                        </div>
                                        <Badge variant={isEnabled ? "default" : "secondary"}>
                                            {isEnabled ? "Ativo" : "Inativo"}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="text-sm text-slate-600 min-h-[40px]">
                                        <span className="font-semibold text-xs uppercase text-slate-400">Objetivo:</span>
                                        <p className="line-clamp-2">{config?.agent_goal || 'Sem objetivo configurado.'}</p>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={isEnabled}
                                                onCheckedChange={(checked) => updateStageConfig(stage, { is_active: checked })}
                                            />
                                            <Label className="text-xs">Habilitar</Label>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleEditClick(stage, effectivePrompt)}
                                        >
                                            Editar Agente
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Floating Save Bar */}
            {hasUnsavedChanges && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-white rounded-lg shadow-xl border p-4 flex items-center gap-4">
                        <span className="text-sm font-medium text-slate-600">Alterações não salvas</span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancelNameChange}
                                className="h-9"
                            >
                                <span className="mr-2">✕</span> Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSaveNameChange}
                                className="bg-green-500 hover:bg-green-600 text-white h-9"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Salvar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Warning Dialog */}
            <Dialog open={isWarningOpen} onOpenChange={setIsWarningOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            Editar prompt do agente
                        </DialogTitle>
                        <DialogDescription className="pt-2 text-slate-700">
                            <p className="font-medium">Atenção: editar as instruções pode prejudicar o funcionamento do agente.</p>
                            <p className="mt-2 text-sm">Os prompts padrão foram exaustivamente testados para garantir conversão. Faça alterações apenas se souber exatamente o que está fazendo.</p>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsWarningOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmWarning}>Continuar Edição</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Editor Dialog */}
            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Editor de Agente: {editingStage ? PIPELINE_STAGES[editingStage].title : ''}</DialogTitle>
                        <DialogDescription>
                            Personalize as instruções para este estágio.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 py-4">
                        <Textarea
                            className="h-full resize-none font-mono text-sm"
                            value={tempPrompt}
                            onChange={(e) => setTempPrompt(e.target.value)}
                        />
                    </div>

                    <DialogFooter className="flex justify-between items-center sm:justify-between">
                        <Button
                            variant="ghost"
                            className="text-slate-500 hover:text-slate-800"
                            onClick={handleRestoreDefault}
                        >
                            <RefreshCcw className="w-4 h-4 mr-2" />
                            Restaurar Padrão
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSavePrompt}>
                                <Save className="w-4 h-4 mr-2" />
                                Salvar Alterações
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
