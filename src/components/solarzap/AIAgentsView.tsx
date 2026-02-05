import React, { useState } from 'react';
import { useAISettings } from '../../hooks/useAISettings';
import { useUserWhatsAppInstances } from '../../hooks/useUserWhatsAppInstances';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { PIPELINE_STAGES, PipelineStage } from '../../types/solarzap';
import { BrainCircuit, AlertTriangle, RefreshCcw, Save } from 'lucide-react';
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
    const { instances: whatsappInstances } = useUserWhatsAppInstances();
    const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);

    const [isWarningOpen, setIsWarningOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [tempPrompt, setTempPrompt] = useState('');

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
        <div className="flex flex-col h-full bg-slate-50 p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BrainCircuit className="h-8 w-8 text-green-600" />
                        Inteligência Artificial (Beta)
                    </h1>
                    <p className="text-slate-600">Configure os agentes autônomos para cada etapa do seu funil.</p>
                </div>
                {/* Global Restore placeholder or just indication */}
                <div className="flex items-center gap-2">
                    <Badge variant={settings?.is_active ? "default" : "secondary"}>
                        {settings?.is_active ? "SISTEMA ATIVO" : "SISTEMA PAUSADO"}
                    </Badge>
                </div>
            </div>

            {/* Global Settings */}
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
                                value={settings?.assistant_identity_name || ''}
                                onChange={(e) => updateGlobalSettings({ assistant_identity_name: e.target.value })}
                                placeholder="Ex: Consultor Solar, Ana, Carlos..."
                            />
                        </div>
                        {/* API Key hidden for security - uses Backend ENV */}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium uppercase text-slate-500">Instância do WhatsApp</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Selecione por onde a IA vai responder</Label>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={settings?.whatsapp_instance_name || ''}
                                onChange={(e) => updateGlobalSettings({ whatsapp_instance_name: e.target.value })}
                            >
                                <option value="" disabled>Selecione uma instância...</option>
                                {whatsappInstances?.map((inst: any) => (
                                    <option key={inst.id} value={inst.instance_name}>
                                        {inst.instance_name} ({inst.status === 'connected' ? '🟢 Conectado' : '🔴 Desconectado'})
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Mensagens recebidas por outras instâncias usarão esta como remetente se configurado.
                            </p>
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
