import React, { createContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface AutomationSettings {
    // Drag & Drop Automations
    dragDropChamadaRealizada: boolean;
    dragDropAguardandoProposta: boolean;
    dragDropPropostaPronta: boolean;
    dragDropChamadaAgendada: boolean;
    dragDropVisitaAgendada: boolean;
    visitOutcomeModalEnabled: boolean;

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
    visitOutcomeModalEnabled: false,

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

const LEGACY_STORAGE_KEY = 'solarzap_automation_settings';

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
    const { orgId } = useAuth();
    const storageKey = orgId ? `solarzap_automation_settings_${orgId}` : LEGACY_STORAGE_KEY;

    const [savedSettings, setSavedSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);

    // Current editable settings (before saving)
    const [pendingSettings, setPendingSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        try {
            const scopedStored = localStorage.getItem(storageKey);
            if (scopedStored) {
                const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(scopedStored) };
                setSavedSettings(parsed);
                setPendingSettings(parsed);
                return;
            }

            if (orgId) {
                const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (legacyStored) {
                    localStorage.setItem(storageKey, legacyStored);
                    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(legacyStored) };
                    setSavedSettings(parsed);
                    setPendingSettings(parsed);
                    return;
                }
            }
        } catch (e) {
            console.error('Error loading automation settings:', e);
        }

        setSavedSettings(DEFAULT_SETTINGS);
        setPendingSettings(DEFAULT_SETTINGS);
    }, [orgId, storageKey]);

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
            localStorage.setItem(storageKey, JSON.stringify(pendingSettings));
            setSavedSettings(pendingSettings);
        } catch (e) {
            console.error('Error saving automation settings:', e);
        }
    }, [pendingSettings, storageKey]);


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
