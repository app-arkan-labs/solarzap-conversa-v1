import React, { useState } from 'react';
import { useAISettings } from '../../hooks/useAISettings';
import { useUserWhatsAppInstances } from '../../hooks/useUserWhatsAppInstances';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { PIPELINE_STAGES, PipelineStage } from '../../types/solarzap';
import { AI_SUPPORT_ELIGIBLE_STAGES } from '../../constants/aiSupportStages';
import { AlertTriangle, RefreshCcw, Save, Bot, ChevronRight, Shield } from 'lucide-react';
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
    const { instances: whatsappInstances, setInstanceAiEnabled, activateAiForAllLeads } = useUserWhatsAppInstances();
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
        setHasUnsavedChanges(true);
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
        'proposta_negociacao', 'financiamento', 'aprovou_projeto', 'contrato_assinado', 'projeto_pago',
        'aguardando_instalacao', 'projeto_instalado', 'coletar_avaliacao', 'contato_futuro', 'perdido'
    ];

    const getFallbackGoal = (stage: PipelineStage) => {
        const title = PIPELINE_STAGES[stage]?.title || stage;
        return `Conduzir o lead com clareza na etapa ${title}.`;
    };

    const getFallbackPrompt = (stage: PipelineStage, fallbackGoal: string) => {
        const title = PIPELINE_STAGES[stage]?.title || stage;
        return `Objetivo: ${fallbackGoal}\n\nAtue como consultor solar na etapa ${title}. Responda com objetividade, prossiga para o proximo passo e mantenha contexto comercial.`;
    };

    const activeCount = pipelineStagesInOrder.filter(s => stageConfigs.find(c => c.status_pipeline === s)?.is_active).length;

    return (
        <div className="h-full w-full min-h-0 overflow-x-hidden overflow-y-auto bg-slate-50">
            <div className="mx-auto w-full max-w-[900px] space-y-6 p-4 md:p-6 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Inteligência Artificial</h1>
                        <p className="text-slate-500 text-sm">Configure os agentes autônomos do seu funil</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant={settings?.is_active ? "default" : "secondary"} className="h-7 px-3">
                        {settings?.is_active ? "SISTEMA ATIVO" : "SISTEMA PAUSADO"}
                    </Badge>
                    <Switch
                        checked={settings?.is_active || false}
                        onCheckedChange={(checked) => updateGlobalSettings({ is_active: checked })}
                        className="data-[state=checked]:bg-green-500"
                    />
                </div>
            </div>

            {/* Compact Settings Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <Label className="text-xs uppercase text-slate-400 font-medium">Nome do Assistente</Label>
                        <Input
                            className="mt-2"
                            value={localAssistantName}
                            onChange={handleNameChange}
                            placeholder="Ex: Consultor Solar, Ana, Carlos..."
                        />
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <Label className="text-xs uppercase text-slate-400 font-medium">Instâncias Conectadas</Label>
                        <div className="flex flex-col gap-1.5 mt-2">
                            {whatsappInstances.filter(i => i.status === 'connected').length === 0 ? (
                                <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Nenhuma instância online
                                </p>
                            ) : (
                                whatsappInstances.filter(i => i.status === 'connected').map(inst => (
                                    <div key={inst.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-green-500" />
                                            <span className="font-medium">{inst.instance_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={!!inst.ai_enabled}
                                                onCheckedChange={(checked) => setInstanceAiEnabled(inst.instance_name, checked)}
                                                disabled={!settings?.is_active}
                                                className="scale-75 origin-right data-[state=checked]:bg-green-500"
                                            />
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 text-[11px] text-green-700 hover:text-green-800 hover:bg-green-50 px-2"
                                                onClick={async () => {
                                                    const count = await activateAiForAllLeads(inst.instance_name);
                                                    if (count !== null) toast.success(`IA ativada para ${count} contato(s)`);
                                                }}
                                            >
                                                Ativar todos
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Agente de Apoio Global */}
            <Card className="shadow-sm border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm">Agente de Apoio Global</h3>
                                <p className="text-xs text-slate-500">Responde mensagens fora do horário e em etapas sem agente dedicado. Mantém o lead engajado.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs">
                                {AI_SUPPORT_ELIGIBLE_STAGES.length} etapas elegíveis
                            </Badge>
                            <Switch
                                checked={settings?.support_agent_enabled ?? true}
                                onCheckedChange={(checked) => updateGlobalSettings({ support_agent_enabled: checked })}
                                className="data-[state=checked]:bg-blue-500"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Pipeline Agents - Compact List */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-800">Agentes de Pipeline</h2>
                    <span className="text-xs text-slate-500">{activeCount}/{pipelineStagesInOrder.length} ativos</span>
                </div>

                <Card className="shadow-sm overflow-hidden">
                    <div className="divide-y">
                        {pipelineStagesInOrder.map((stage) => {
                            const config = stageConfigs.find(c => c.status_pipeline === stage);
                            const stageInfo = PIPELINE_STAGES[stage];
                            const isEnabled = config?.is_active || false;
                            const fallbackGoal = config?.agent_goal || getFallbackGoal(stage);
                            const effectivePrompt =
                                config?.prompt_override ||
                                config?.default_prompt ||
                                getFallbackPrompt(stage, fallbackGoal);

                            return (
                                <div
                                    key={stage}
                                    className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group ${!isEnabled ? 'opacity-60' : ''}`}
                                    data-testid={`ai-stage-row-${stage}`}
                                >
                                    {/* Stage icon + color */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${stageInfo.color} bg-opacity-20`}>
                                        <span className="text-sm">{stageInfo.icon}</span>
                                    </div>

                                    {/* Name + goal */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-slate-800">{stageInfo.title}</span>
                                            <Badge
                                                variant={isEnabled ? "default" : "secondary"}
                                                className={`text-[10px] h-4 px-1.5 ${isEnabled ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}
                                            >
                                                {isEnabled ? "Ativo" : "Off"}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 truncate">{fallbackGoal}</p>
                                    </div>

                                    {/* Toggle + Edit */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Switch
                                            checked={isEnabled}
                                            onCheckedChange={(checked) => updateStageConfig(stage, { is_active: checked })}
                                            className="scale-90 data-[state=checked]:bg-green-500"
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleEditClick(stage, effectivePrompt)}
                                        >
                                            Editar <ChevronRight className="w-3 h-3 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            {/* Floating Save Bar */}
            {hasUnsavedChanges && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-white rounded-lg shadow-xl border p-4 flex items-center gap-4">
                        <span className="text-sm font-medium text-slate-600">Alterações não salvas</span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={handleCancelNameChange} className="h-9">
                                ✕ Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSaveNameChange} className="bg-green-500 hover:bg-green-600 text-white h-9">
                                <Save className="w-4 h-4 mr-2" /> Salvar
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
                        <Button variant="ghost" className="text-slate-500 hover:text-slate-800" onClick={handleRestoreDefault}>
                            <RefreshCcw className="w-4 h-4 mr-2" /> Restaurar Padrão
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSavePrompt}>
                                <Save className="w-4 h-4 mr-2" /> Salvar Alterações
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            </div>
        </div>
    );
}
