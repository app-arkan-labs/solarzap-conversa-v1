import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  type ProposalThemeValue,
  type ProposalColorTheme,
  getThemeById,
  normalizeThemeHex,
} from '@/utils/proposalColorThemes';

type DbErrorLike = {
  code?: string;
  message?: string | null;
  details?: string | null;
};

type ThemeSyncDetail = {
  orgId: string;
  themeId?: ProposalThemeValue;
  secondaryColorHex?: string | null;
};

const THEME_SYNC_EVENT = 'proposal-theme-sync';

function isMissingSecondaryColorColumnError(error: DbErrorLike | null | undefined): boolean {
  const code = String(error?.code || '');
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === 'PGRST204'
    || code === '42703'
    || (text.includes('proposal_secondary_color') && (text.includes('column') || text.includes('schema cache')));
}

function dispatchThemeSync(detail: ThemeSyncDetail) {
  try {
    window.dispatchEvent(new CustomEvent<ThemeSyncDetail>(THEME_SYNC_EVENT, { detail }));
  } catch {
    // non-blocking
  }
}

export function useProposalTheme() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [themeId, setThemeId] = useState<ProposalThemeValue>('verde');
  const [secondaryColorHex, setSecondaryColorHex] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getSecondaryStorageKey = useCallback(
    () => (orgId ? `proposal_secondary_color:${orgId}` : null),
    [orgId],
  );

  const saveSecondaryInLocal = useCallback((value: string | null) => {
    const key = getSecondaryStorageKey();
    if (!key) return;
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      // non-blocking
    }
  }, [getSecondaryStorageKey]);

  const getSecondaryFromLocal = useCallback((): string | null => {
    const key = getSecondaryStorageKey();
    if (!key) return null;
    try {
      return normalizeThemeHex(localStorage.getItem(key) || '') || null;
    } catch {
      return null;
    }
  }, [getSecondaryStorageKey]);

  // Fetch current theme from company_profile
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('company_profile')
          .select('proposal_theme, proposal_secondary_color')
          .eq('org_id', orgId)
          .maybeSingle();

        if (error && isMissingSecondaryColorColumnError(error)) {
          const fallback = await supabase
            .from('company_profile')
            .select('proposal_theme')
            .eq('org_id', orgId)
            .maybeSingle();

          if (!cancelled && !fallback.error && fallback.data?.proposal_theme) {
            setThemeId(fallback.data.proposal_theme as ProposalThemeValue);
          }
          if (!cancelled) {
            setSecondaryColorHex(getSecondaryFromLocal());
          }
          return;
        }

        if (!cancelled && !error && data?.proposal_theme) {
          setThemeId(data.proposal_theme as ProposalThemeValue);
        }
        if (!cancelled) {
          const dbSecondary = normalizeThemeHex(data?.proposal_secondary_color || '') || null;
          const localSecondary = getSecondaryFromLocal();
          setSecondaryColorHex(dbSecondary || localSecondary);
        }
      } catch {
        if (!cancelled) setSecondaryColorHex(getSecondaryFromLocal());
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, getSecondaryFromLocal]);

  // Keep multiple hook instances in sync across screens (ProposalsView/ProposalModal/etc)
  useEffect(() => {
    if (!orgId) return;
    const localSecondaryKey = getSecondaryStorageKey();

    const onThemeSync = (event: Event) => {
      const custom = event as CustomEvent<ThemeSyncDetail>;
      const detail = custom.detail;
      if (!detail || detail.orgId !== orgId) return;
      if (detail.themeId) setThemeId(detail.themeId);
      if (Object.prototype.hasOwnProperty.call(detail, 'secondaryColorHex')) {
        setSecondaryColorHex(detail.secondaryColorHex ?? null);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (!localSecondaryKey || event.key !== localSecondaryKey) return;
      setSecondaryColorHex(normalizeThemeHex(event.newValue || '') || null);
    };

    window.addEventListener(THEME_SYNC_EVENT, onThemeSync as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(THEME_SYNC_EVENT, onThemeSync as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [orgId, getSecondaryStorageKey]);

  const theme: ProposalColorTheme = getThemeById(themeId);

  const updateTheme = useCallback(async (newId: ProposalThemeValue) => {
    if (!orgId) return;
    setThemeId(newId);
    dispatchThemeSync({ orgId, themeId: newId });
    setLoading(true);
    try {
      const { error } = await supabase
        .from('company_profile')
        .upsert(
          { org_id: orgId, proposal_theme: newId, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' },
        );
      if (error) throw error;
      toast({ title: 'Tema salvo', description: `Tema "${getThemeById(newId).label}" aplicado as proximas propostas.` });
    } catch (err) {
      console.error('Failed to save proposal theme:', err);
      toast({ title: 'Erro ao salvar tema', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  const updateSecondaryColor = useCallback(async (hexOrNull: string | null) => {
    if (!orgId) return;
    const normalized = hexOrNull ? normalizeThemeHex(hexOrNull) : null;
    if (hexOrNull && !normalized) {
      toast({ title: 'Cor secundaria invalida', variant: 'destructive' });
      return;
    }

    setSecondaryColorHex(normalized);
    saveSecondaryInLocal(normalized);
    dispatchThemeSync({ orgId, secondaryColorHex: normalized });
    setLoading(true);
    try {
      const { error } = await supabase
        .from('company_profile')
        .upsert(
          { org_id: orgId, proposal_secondary_color: normalized, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' },
        );

      if (error) {
        if (isMissingSecondaryColorColumnError(error)) {
          toast({
            title: 'Cor secundaria salva',
            description: normalized
              ? `Cor ${normalized.toUpperCase()} aplicada (modo local).`
              : 'Modo automatico reativado.',
          });
          return;
        }
        throw error;
      }

      toast({
        title: 'Cor secundaria salva',
        description: normalized ? `Cor ${normalized.toUpperCase()} aplicada as proximas propostas.` : 'Modo automatico reativado.',
      });
    } catch (err) {
      console.error('Failed to save proposal secondary color:', err);
      toast({ title: 'Erro ao salvar cor secundaria', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast, saveSecondaryInLocal]);

  return { themeId, theme, secondaryColorHex, updateTheme, updateSecondaryColor, loading };
}
