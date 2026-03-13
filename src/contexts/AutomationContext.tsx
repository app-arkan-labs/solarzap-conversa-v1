import React, { createContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface AutomationSettings {
  dragDropChamadaRealizada: boolean;
  dragDropAguardandoProposta: boolean;
  dragDropPropostaPronta: boolean;
  dragDropChamadaAgendada: boolean;
  dragDropVisitaAgendada: boolean;
  visitOutcomeModalEnabled: boolean;
  skipBackwardMoves: boolean;
  videoCallMessageEnabled: boolean;
  proposalReadyMessageEnabled: boolean;
  visitScheduledMessageEnabled: boolean;
  callScheduledMessageEnabled: boolean;
  askForReferralMessageEnabled: boolean;
  videoCallMessage: string;
  proposalReadyMessage: string;
  visitScheduledMessage: string;
  callScheduledMessage: string;
  askForReferralMessage: string;
}

export const DEFAULT_SETTINGS: AutomationSettings = {
  dragDropChamadaRealizada: true,
  dragDropAguardandoProposta: true,
  dragDropPropostaPronta: true,
  dragDropChamadaAgendada: true,
  dragDropVisitaAgendada: true,
  visitOutcomeModalEnabled: false,
  skipBackwardMoves: true,
  videoCallMessageEnabled: true,
  proposalReadyMessageEnabled: true,
  visitScheduledMessageEnabled: true,
  callScheduledMessageEnabled: true,
  askForReferralMessageEnabled: true,
  videoCallMessage: 'Olá {nome}! Vou iniciar uma chamada de vídeo agora. Aguarde o link do Google Meet.',
  proposalReadyMessage: 'Olá {nome}! Sua proposta de energia solar está pronta. Podemos agendar a apresentação?',
  visitScheduledMessage: 'Visita técnica agendada para {data} às {hora}.',
  callScheduledMessage: 'Reunião agendada para {data} às {hora}.',
  askForReferralMessage: 'Você conhece alguém que também queira economizar com energia solar?',
};

const LEGACY_STORAGE_KEY = 'solarzap_automation_settings';

interface AutomationContextType {
  activeSettings: AutomationSettings;
  pendingSettings: AutomationSettings;
  hasChanges: boolean;
  isSaving: boolean;
  isHydrating: boolean;
  updateSetting: <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => void;
  saveChanges: () => Promise<boolean>;
  cancelChanges: () => void;
  resetToDefaults: () => void;
}

export const AutomationContext = createContext<AutomationContextType | undefined>(undefined);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeSettings = (value: unknown): AutomationSettings => {
  if (!isObjectRecord(value)) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...value,
  } as AutomationSettings;
};

const readScopedStorage = (storageKey: string, orgId: string | null): AutomationSettings | null => {
  try {
    const scopedRaw = localStorage.getItem(storageKey);
    if (scopedRaw) return normalizeSettings(JSON.parse(scopedRaw));

    if (orgId) {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) return normalizeSettings(JSON.parse(legacyRaw));
    }
  } catch (error) {
    console.warn('[AutomationContext] failed_to_read_local_storage', error);
  }
  return null;
};

const writeScopedStorage = (storageKey: string, payload: AutomationSettings) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (error) {
    console.warn('[AutomationContext] failed_to_write_local_storage', error);
  }
};

export function AutomationProvider({ children }: { children: ReactNode }) {
  const { orgId, user } = useAuth();
  const storageKey = orgId ? `solarzap_automation_settings_${orgId}` : LEGACY_STORAGE_KEY;

  const [savedSettings, setSavedSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);
  const [pendingSettings, setPendingSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);
  const [isHydrating, setIsHydrating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      if (!orgId) {
        const localFallback = readScopedStorage(storageKey, null) || DEFAULT_SETTINGS;
        if (active) {
          setSavedSettings(localFallback);
          setPendingSettings(localFallback);
          setIsHydrating(false);
        }
        return;
      }

      if (active) setIsHydrating(true);
      const localFallback = readScopedStorage(storageKey, orgId);

      try {
        const { data, error } = await supabase
          .from('automation_settings')
          .select('settings')
          .eq('org_id', orgId)
          .maybeSingle();

        if (error) throw error;

        const resolved = data?.settings
          ? normalizeSettings(data.settings)
          : (localFallback || DEFAULT_SETTINGS);

        if (active) {
          setSavedSettings(resolved);
          setPendingSettings(resolved);
        }
        writeScopedStorage(storageKey, resolved);

        if (!data?.settings) {
          const { error: upsertError } = await supabase
            .from('automation_settings')
            .upsert({
              org_id: orgId,
              settings: resolved,
              updated_by: user?.id || null,
            }, { onConflict: 'org_id' });
          if (upsertError) {
            console.warn('[AutomationContext] bootstrap_upsert_failed', upsertError.message || upsertError);
          }
        }
      } catch (error) {
        console.warn('[AutomationContext] hydrate_failed', error);
        const fallback = localFallback || DEFAULT_SETTINGS;
        if (active) {
          setSavedSettings(fallback);
          setPendingSettings(fallback);
        }
        writeScopedStorage(storageKey, fallback);
      } finally {
        if (active) setIsHydrating(false);
      }
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [orgId, storageKey, user?.id]);

  const hasChanges = useMemo(
    () => JSON.stringify(savedSettings) !== JSON.stringify(pendingSettings),
    [savedSettings, pendingSettings],
  );

  const updateSetting = useCallback(<K extends keyof AutomationSettings>(
    key: K,
    value: AutomationSettings[K],
  ) => {
    setPendingSettings((previous) => ({ ...previous, [key]: value }));
  }, []);

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (isSaving) return false;
    const resolved = normalizeSettings(pendingSettings);
    writeScopedStorage(storageKey, resolved);

    if (!orgId) {
      setSavedSettings(resolved);
      return true;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('automation_settings')
        .upsert({
          org_id: orgId,
          settings: resolved,
          updated_by: user?.id || null,
        }, { onConflict: 'org_id' });

      if (error) throw error;

      setSavedSettings(resolved);
      return true;
    } catch (error) {
      console.error('Error saving automation settings:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, orgId, pendingSettings, storageKey, user?.id]);

  const cancelChanges = useCallback(() => {
    setPendingSettings(savedSettings);
  }, [savedSettings]);

  const resetToDefaults = useCallback(() => {
    setPendingSettings(DEFAULT_SETTINGS);
  }, []);

  const value = {
    activeSettings: savedSettings,
    pendingSettings,
    hasChanges,
    isSaving,
    isHydrating,
    updateSetting,
    saveChanges,
    cancelChanges,
    resetToDefaults,
  };

  return (
    <AutomationContext.Provider value={value}>
      {children}
    </AutomationContext.Provider>
  );
}
