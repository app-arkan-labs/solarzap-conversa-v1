import React, { createContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { PipelineStage } from '@/types/solarzap';

export interface AutomationSettings {
    // Drag & Drop Automations
    dragDropChamadaRealizada: boolean;
    dragDropAguardandoProposta: boolean;
    dragDropPropostaPronta: boolean;
    dragDropChamadaAgendada: boolean;
    dragDropVisitaAgendada: boolean;

    // Skip automations when lead moves backward
    skipBackwardMoves: boolean;

    // Message Automations (enabled/disabled)
    videoCallMessageEnabled: boolean;
    proposalReadyMessageEnabled: boolean;
    visitScheduledMessageEnabled: boolean;
    callScheduledMessageEnabled: boolean;
    askForReferralMessageEnabled: boolean;

    // Pre-configured Messages
    videoCallMessage: string;
    proposalReadyMessage: string;
    visitScheduledMessage: string;
    callScheduledMessage: string;
    askForReferralMessage: string;
}

export const DEFAULT_SETTINGS: AutomationSettings = {
    // All automations enabled by default
    dragDropChamadaRealizada: true,
    dragDropAguardandoProposta: true,
    dragDropPropostaPronta: true,
    dragDropChamadaAgendada: true,
    dragDropVisitaAgendada: true,

    // Skip backward moves enabled by default
    skipBackwardMoves: true,

    // Message automations - all pre-fill only by default (not auto-send)
    videoCallMessageEnabled: true,
    proposalReadyMessageEnabled: true,
    visitScheduledMessageEnabled: true,
    callScheduledMessageEnabled: true,
    askForReferralMessageEnabled: true,

    // Default messages
    videoCallMessage: '🎥 Olá {nome}! Vou iniciar uma chamada de vídeo. Por favor, aguarde o link do Google Meet que enviarei em instantes.',
    proposalReadyMessage: 'Olá {nome}! 🌞\n\nSua proposta de energia solar está pronta! Gostaria de agendar uma apresentação para mostrar todos os detalhes e benefícios do seu projeto?\n\nQual o melhor horário para você?',
    visitScheduledMessage: '🏠 Visita técnica agendada para {data} às {hora}.\n\nNosso técnico irá até o local para avaliar as condições de instalação.',
    callScheduledMessage: '📅 Reunião agendada para {data} às {hora}.',
    askForReferralMessage: 'Olá! Gostaria de pedir uma indicação. Você conhece alguém que também gostaria de economizar com energia solar?',
};

const STORAGE_KEY = 'solarzap_automation_settings';

interface AutomationContextType {
    activeSettings: AutomationSettings; // The committed/saved settings used by the app logic
    pendingSettings: AutomationSettings; // The state being edited in the settings page

    hasChanges: boolean;
    updateSetting: <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => void;
    saveChanges: () => void;
    cancelChanges: () => void;
    resetToDefaults: () => void;
}

export const AutomationContext = createContext<AutomationContextType | undefined>(undefined);

export function AutomationProvider({ children }: { children: ReactNode }) {
    // Load saved settings
    const [savedSettings, setSavedSettings] = useState<AutomationSettings>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            console.log('AutomationProvider: loading from localStorage', stored);
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.error('Error loading automation settings:', e);
        }
        return DEFAULT_SETTINGS;
    });

    // Current editable settings (before saving)
    const [pendingSettings, setPendingSettings] = useState<AutomationSettings>(savedSettings);

    // Track if there are unsaved changes
    const hasChanges = useMemo(() => {
        return JSON.stringify(savedSettings) !== JSON.stringify(pendingSettings);
    }, [savedSettings, pendingSettings]);

    // Update a single setting (marks as pending)
    const updateSetting = useCallback(<K extends keyof AutomationSettings>(
        key: K,
        value: AutomationSettings[K]
    ) => {
        console.log('AutomationProvider: updateSetting', key, value);
        setPendingSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    // Save all pending changes
    const saveChanges = useCallback(() => {
        try {
            console.log('AutomationProvider: saving changes', pendingSettings);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingSettings));
            setSavedSettings(pendingSettings);
        } catch (e) {
            console.error('Error saving automation settings:', e);
        }
    }, [pendingSettings]);


    // Cancel pending changes (revert to saved)
    const cancelChanges = useCallback(() => {
        setPendingSettings(savedSettings);
    }, [savedSettings]);

    // Reset to defaults
    const resetToDefaults = useCallback(() => {
        setPendingSettings(DEFAULT_SETTINGS);
    }, []);

    const value = {
        activeSettings: savedSettings,
        pendingSettings,
        hasChanges,
        updateSetting,
        saveChanges,
        cancelChanges,
        resetToDefaults
    };

    return (
        <AutomationContext.Provider value={value}>
            {children}
        </AutomationContext.Provider>
    );
}
