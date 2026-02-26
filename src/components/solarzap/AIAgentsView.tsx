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
import {
    ACTIVE_PIPELINE_AGENTS,
    DEFAULT_PROMPTS_BY_STAGE,
    type PipelineAgentDef,
} from '../../constants/aiPipelineAgents';
import { AlertTriangle, RefreshCcw, Save, Bot, ChevronRight, Shield, Power, Wifi, WifiOff, Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Textarea } from '../ui/textarea';
import { PageHeader } from './PageHeader';

export function AIAgentsView() {
    const { settings, stageConfigs, updateGlobalSettings, updateStageConfig, loading, restoreDefaultPrompt } = useAISettings();
    const { instances: whatsappInstances, setInstanceAiEnabled, activateAiForAllLeads } = useUserWhatsAppInstances();
    const { role } = useAuth();
    const canEdit = role === 'owner' || role === 'admin';
    const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
    const [editingAgent, setEditingAgent] = useState<PipelineAgentDef | null>(null);

    const [isWarningOpen, setIsWarningOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
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

    const handleEditClick = (agent: PipelineAgentDef, currentPrompt: string) => {
        setEditingStage(agent.stage);
        setEditingAgent(agent);
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
            setEditingAgent(null);
        }
    };

    const handleRestoreDefault = async () => {
        if (editingStage) {
            const defaultPrompt = DEFAULT_PROMPTS_BY_STAGE[editingStage];
            if (defaultPrompt) {
                setTempPrompt(defaultPrompt);
                toast.success('Prompt padrão restaurado. Clique "Salvar" para confirmar.');
            } else {
                setIsRestoreConfirmOpen(true);
            }
        }
    };

    if (loading) return <div className="p-8 text-center">Carregando módulos de IA...</div>;

    const activeCount = ACTIVE_PIPELINE_AGENTS.filter(
        a => stageConfigs.find(c => c.status_pipeline === a.stage)?.is_active
    ).length;
    const editingConfig = editingStage ? stageConfigs.find(c => c.status_pipeline === editingStage) : null;
    const editingPromptVersion = editingConfig?.prompt_override_version ?? 0;
    const promptLength = tempPrompt.length;
    const promptWarnings = [
        promptLength > 0 && promptLength < 50 ? `Prompt curto (${promptLength} < 50 caracteres)` : null,
        promptLength > 15000 ? `Prompt longo (${promptLength} > 15000 caracteres)` : null,
        tempPrompt && !/ETAPA:/i.test(tempPrompt) ? 'Aviso: sem "ETAPA:"' : null,
        tempPrompt && !/OBJETIVO:/i.test(tempPrompt) ? 'Aviso: sem "OBJETIVO:"' : null,
    ].filter(Boolean) as string[];

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            <PageHeader
                title="Inteligência Artificial"
                subtitle="Configure os agentes autônomos do seu funil de vendas"
                icon={Bot}
                actionContent={
                    <div className="flex items-center gap-3 bg-background/50 glass px-4 py-2 rounded-xl border border-border/50">
                        <Badge variant={settings?.is_active ? "default" : "secondary"} className="h-7 px-3">
                            {settings?.is_active ? "SISTEMA ATIVO" : "SISTEMA PAUSADO"}
                        </Badge>
                        <Switch
                            data-testid="ai-master-switch"
                            checked={settings?.is_active || false}
                            onCheckedChange={(checked) => updateGlobalSettings({ is_active: checked })}
                            className="data-[state=checked]:bg-green-500"
                            disabled={!canEdit}
                        />
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto w-full px-6 py-6 pb-24">
                <div className="mx-auto w-full max-w-[900px] space-y-6">

                    {/* Settings Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Nome do Assistente */}
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

                        {/* Instâncias WhatsApp — TODAS, não só connected */}
                        <Card className="shadow-sm">
                            <CardContent className="p-4">
                                <Label className="text-xs uppercase text-slate-400 font-medium">Instâncias WhatsApp</Label>
                                <div className="flex flex-col gap-2 mt-2">
                                    {whatsappInstances.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5" /> Nenhuma instância cadastrada
                                        </p>
                                    ) : (
                                        whatsappInstances.map(inst => {
                                            const isOnline = inst.status === 'connected';
                                            const isConnecting = inst.status === 'connecting';
                                            return (
                                                <div key={inst.id} className="flex items-center justify-between text-sm py-1">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {isOnline ? (
                                                            <Wifi className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                                        ) : (
                                                            <WifiOff className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                        )}
                                                        <span className={`font-medium truncate ${!isOnline ? 'text-slate-400' : ''}`}>
                                                            {inst.display_name || inst.instance_name}
                                                        </span>
                                                        <Badge
                                                            variant={isOnline ? 'default' : 'secondary'}
                                                            className={`text-[10px] h-4 px-1.5 flex-shrink-0 ${isOnline ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                                                                isConnecting ? 'bg-yellow-100 text-yellow-700' : ''
                                                                }`}
                                                        >
                                                            {isOnline ? 'Online' : isConnecting ? 'Conectando' : 'Offline'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <Switch
                                                            checked={!!inst.ai_enabled}
                                                            onCheckedChange={(checked) => setInstanceAiEnabled(inst.instance_name, checked)}
                                                            disabled={!settings?.is_active || !isOnline}
                                                            className="scale-75 origin-right data-[state=checked]:bg-green-500"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-[11px] text-green-700 hover:text-green-800 hover:bg-green-50 border-green-200 px-2"
                                                            disabled={!isOnline}
                                                            onClick={async () => {
                                                                const count = await activateAiForAllLeads(inst.instance_name);
                                                                if (count !== null) toast.success(`IA reativada para ${count} contato(s) da instância ${inst.instance_name}`);
                                                            }}
                                                            title="Reativar IA para todos os leads desta instância"
                                                        >
                                                            <Power className="h-3 w-3 mr-1" />
                                                            Religar todos
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Agente de Apoio Global */}
                    <Card className="shadow-sm border-l-4 border-l-blue-500" data-testid="support-ai-card">
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
                                        data-testid="support-ai-toggle"
                                        checked={settings?.support_ai_enabled ?? true}
                                        onCheckedChange={(checked) => updateGlobalSettings({ support_ai_enabled: checked })}
                                        className="data-[state=checked]:bg-blue-500"
                                        disabled={!canEdit}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pipeline Agents — APENAS OS 5 ATIVOS */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-slate-800">Agentes de Pipeline</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Agentes inteligentes que guiam o lead por cada etapa do funil de vendas.
                                    As demais etapas são operadas pelo vendedor ou por lembretes automáticos.
                                </p>
                            </div>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                                {activeCount}/{ACTIVE_PIPELINE_AGENTS.length} ativos
                            </Badge>
                        </div>

                        <div className="space-y-3">
                            {ACTIVE_PIPELINE_AGENTS.map((agent) => {
                                const config = stageConfigs.find(c => c.status_pipeline === agent.stage);
                                const stageInfo = PIPELINE_STAGES[agent.stage];
                                const isEnabled = config?.is_active || false;
                                const effectivePrompt =
                                    config?.prompt_override ||
                                    config?.default_prompt ||
                                    DEFAULT_PROMPTS_BY_STAGE[agent.stage] ||
                                    agent.defaultPrompt;

                                return (
                                    <Card
                                        key={agent.stage}
                                        className={`shadow-sm transition-all ${isEnabled ? 'border-l-4 border-l-green-500' : 'opacity-70'}`}
                                        data-testid={`ai-stage-card-${agent.stage}`}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                {/* Stage icon */}
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stageInfo.color} bg-opacity-20`}>
                                                    <span className="text-lg">{stageInfo.icon}</span>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-sm text-slate-800">{agent.label}</span>
                                                        <Badge
                                                            variant={isEnabled ? "default" : "secondary"}
                                                            className={`text-[10px] h-4 px-1.5 ${isEnabled ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}
                                                        >
                                                            {isEnabled ? "Ativo" : "Desativado"}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                                            Versao {config?.prompt_override_version ?? 0}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs font-medium text-slate-600 mb-0.5">
                                                        🎯 {agent.objective}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400">
                                                        Próxima etapa → {agent.nextStages}
                                                    </p>
                                                </div>

                                                {/* Controls */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs gap-1.5"
                                                        onClick={() => handleEditClick(agent, effectivePrompt)}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                        Editar Prompt
                                                    </Button>
                                                    <Switch
                                                        checked={isEnabled}
                                                        onCheckedChange={(checked) => updateStageConfig(agent.stage, { is_active: checked })}
                                                        className="data-[state=checked]:bg-green-500"
                                                        disabled={!canEdit}
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>

                    {/* Floating Save Bar */}
                </div>
            </div>

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
                            <p className="mt-2 text-sm">Os prompts padrão foram exaustivamente testados para garantir conversão e humanização. Faça alterações apenas se souber exatamente o que está fazendo.</p>
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
                        <DialogTitle>
                            Editor de Agente: {editingAgent?.label || (editingStage ? PIPELINE_STAGES[editingStage].title : '')}
                        </DialogTitle>
                        <DialogDescription>
                            {editingAgent && (
                                <span>🎯 {editingAgent.objective} — Próxima etapa → {editingAgent.nextStages}</span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 py-4 min-h-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="h-5 px-2 text-[10px]">
                                Versao {editingPromptVersion}
                            </Badge>
                            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                {promptLength} caracteres
                            </Badge>
                            {promptWarnings.map((warning) => (
                                <Badge
                                    key={warning}
                                    variant="outline"
                                    className="h-5 border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-800"
                                >
                                    {warning}
                                </Badge>
                            ))}
                            {promptWarnings.length > 0 && (
                                <span className="text-[11px] text-slate-500">Avisos nao bloqueiam o salvamento.</span>
                            )}
                        </div>
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

            {/* Restore default confirm dialog (replaces window.confirm) */}
            <Dialog open={isRestoreConfirmOpen} onOpenChange={setIsRestoreConfirmOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Restaurar Prompt Padrão</DialogTitle>
                        <DialogDescription>
                            Isso vai restaurar o prompt desta etapa para o padrão do sistema. Continuar?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRestoreConfirmOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={async () => {
                            if (editingStage) {
                                await restoreDefaultPrompt(editingStage);
                                setIsEditorOpen(false);
                                setEditingStage(null);
                                setEditingAgent(null);
                            }
                            setIsRestoreConfirmOpen(false);
                        }}>Restaurar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
