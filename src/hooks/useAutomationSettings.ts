import { useContext, useCallback } from 'react';
import { PipelineStage } from '@/types/solarzap';
import { AutomationContext, AutomationSettings, DEFAULT_SETTINGS } from '@/contexts/AutomationContext';

export type { AutomationSettings };
export { DEFAULT_SETTINGS };

// Ordered list of pipeline stages for comparison
const STAGE_ORDER: PipelineStage[] = [
    'novo_lead',
    'respondeu',
    'chamada_agendada',
    'chamada_realizada',
    'nao_compareceu',
    'aguardando_proposta',
    'proposta_pronta',
    'visita_agendada',
    'visita_realizada',
    'proposta_negociacao',
    'financiamento',
    'aprovou_projeto',
    'contrato_assinado',
    'projeto_pago',
    'aguardando_instalacao',
    'projeto_instalado',
    'coletar_avaliacao',
    'contato_futuro',
    'perdido',
];

// Get stage index for comparison (to detect backward moves)
const getStageIndex = (stage: PipelineStage): number => {
    const index = STAGE_ORDER.indexOf(stage);
    return index >= 0 ? index : 999;
};

export function useAutomationSettings() {
    const context = useContext(AutomationContext);

    if (!context) {
        throw new Error('useAutomationSettings must be used within an AutomationProvider');
    }

    const {
        activeSettings, // Use "saved/active" as the source of truth for logic
        pendingSettings, // Use "pending" for UI editing
        hasChanges,
        updateSetting,
        saveChanges,
        cancelChanges,
        resetToDefaults
    } = context;

    // Helper to check if a specific drag-drop automation is enabled.
    // ALWAYS use activeSettings for this logic.
    const isDragDropEnabled = useCallback((
        targetStage: string,
        fromStage?: string
    ): boolean => {
        // If skipBackwardMoves is enabled, check if this is a backward move
        if (activeSettings.skipBackwardMoves && fromStage) {
            const fromIndex = getStageIndex(fromStage as PipelineStage);
            const toIndex = getStageIndex(targetStage as PipelineStage);
            if (toIndex < fromIndex) {
                // This is a backward move, skip automation
                return false;
            }
        }

        // Check if specific automation is enabled
        switch (targetStage) {
            case 'chamada_realizada':
                return activeSettings.dragDropChamadaRealizada;
            case 'aguardando_proposta':
                return activeSettings.dragDropAguardandoProposta;
            case 'proposta_pronta':
                return activeSettings.dragDropPropostaPronta;
            case 'chamada_agendada':
                return activeSettings.dragDropChamadaAgendada;
            case 'visita_agendada':
                return activeSettings.dragDropVisitaAgendada;
            default:
                return true;
        }
    }, [activeSettings]);

    // Helper to get a message with placeholders replaced
    // ALWAYS use activeSettings for this logic.
    const getMessage = useCallback((
        messageKey: keyof Pick<AutomationSettings, 'videoCallMessage' | 'proposalReadyMessage' | 'visitScheduledMessage' | 'callScheduledMessage' | 'askForReferralMessage'>,
        replacements: Record<string, string> = {}
    ): string => {
        let message = activeSettings[messageKey];
        // console.log('useAutomationSettings: getMessage', messageKey, 'Template:', message); 
        Object.entries(replacements).forEach(([key, value]) => {
            message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        });
        // console.log('useAutomationSettings: getMessage Result:', message);
        return message;
    }, [activeSettings]);


    return {
        // For UI (AutomationsView uses 'settings' as the editable state)
        settings: pendingSettings,

        // For logic (consumers usually want the active config)
        savedSettings: activeSettings,
        activeSettings, // Valid alias

        hasChanges,
        updateSetting,
        saveChanges,
        cancelChanges,
        resetToDefaults,
        isDragDropEnabled,
        getMessage,
        DEFAULT_SETTINGS,
    };
}
