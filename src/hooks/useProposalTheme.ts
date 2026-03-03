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
  const [hydrated, setHydrated] = useState(false);

  const getSecondaryStorageKey = useCallback(
    () => (orgId ? `proposal_secondary_color:${orgId}` : null),
    [orgId],
  );

  const getThemeStorageKey = useCallback(
    () => (orgId ? `proposal_theme:${orgId}` : null),
    [orgId],
  );

  const normalizeThemeValue = useCallback((value: string | null | undefined): ProposalThemeValue | null => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return getThemeById(raw).id;
  }, []);

  const saveThemeInLocal = useCallback((value: ProposalThemeValue | null) => {
    const key = getThemeStorageKey();
    if (!key) return;
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      // non-blocking
    }
  }, [getThemeStorageKey]);

  const getThemeFromLocal = useCallback((): ProposalThemeValue | null => {
    const key = getThemeStorageKey();
    if (!key) return null;
    try {
      return normalizeThemeValue(localStorage.getItem(key));
    } catch {
      return null;
    }
  }, [getThemeStorageKey, normalizeThemeValue]);

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
    if (!orgId) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    setHydrated(false);
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

          if (!cancelled) {
            const dbTheme = normalizeThemeValue(fallback.data?.proposal_theme);
            const localTheme = getThemeFromLocal();
            if (dbTheme) setThemeId(dbTheme);
            else if (localTheme) setThemeId(localTheme);
          }
          if (!cancelled) {
            setSecondaryColorHex(getSecondaryFromLocal());
            setHydrated(true);
          }
          return;
        }

        if (!cancelled) {
          const dbTheme = !error ? normalizeThemeValue(data?.proposal_theme) : null;
          const localTheme = getThemeFromLocal();
          const resolvedTheme = dbTheme || localTheme;
          if (resolvedTheme) setThemeId(resolvedTheme);
        }
        if (!cancelled) {
          const dbSecondary = normalizeThemeHex(data?.proposal_secondary_color || '') || null;
          const localSecondary = getSecondaryFromLocal();
          setSecondaryColorHex(dbSecondary || localSecondary);
          setHydrated(true);
        }
      } catch {
        if (!cancelled) {
          const localTheme = getThemeFromLocal();
          if (localTheme) setThemeId(localTheme);
          setSecondaryColorHex(getSecondaryFromLocal());
          setHydrated(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, getSecondaryFromLocal, getThemeFromLocal, normalizeThemeValue]);

  // Keep multiple hook instances in sync across screens (ProposalsView/ProposalModal/etc)
  useEffect(() => {
    if (!orgId) return;
    const localSecondaryKey = getSecondaryStorageKey();
    const localThemeKey = getThemeStorageKey();

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
      if (localSecondaryKey && event.key === localSecondaryKey) {
        setSecondaryColorHex(normalizeThemeHex(event.newValue || '') || null);
        return;
      }
      if (localThemeKey && event.key === localThemeKey) {
        const nextTheme = normalizeThemeValue(event.newValue || '');
        if (nextTheme) setThemeId(nextTheme);
      }
    };

    window.addEventListener(THEME_SYNC_EVENT, onThemeSync as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(THEME_SYNC_EVENT, onThemeSync as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [orgId, getSecondaryStorageKey, getThemeStorageKey, normalizeThemeValue]);

  const theme: ProposalColorTheme = getThemeById(themeId);

  const updateTheme = useCallback(async (newId: ProposalThemeValue) => {
    if (!orgId) return;
    const normalized = normalizeThemeValue(newId) || getThemeById(newId).id;
    setThemeId(normalized);
    saveThemeInLocal(normalized);
    dispatchThemeSync({ orgId, themeId: normalized });
    setLoading(true);
    try {
      const { error } = await supabase
        .from('company_profile')
        .upsert(
          { org_id: orgId, proposal_theme: normalized, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' },
        );
      if (error) throw error;
      toast({
        title: 'Tema salvo',
        description: `Cor primaria ${getThemeById(normalized).swatch.toUpperCase()} aplicada as proximas propostas.`,
      });
    } catch (err) {
      console.error('Failed to save proposal theme:', err);
      toast({
        title: 'Tema salvo',
        description: `Cor primaria ${getThemeById(normalized).swatch.toUpperCase()} aplicada as proximas propostas (modo local).`,
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast, normalizeThemeValue, saveThemeInLocal]);

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
              ? `Cor ${normalized.toUpperCase()} aplicada as proximas propostas (modo local).`
              : 'Modo automatico reativado (modo local).',
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

  return { themeId, theme, secondaryColorHex, updateTheme, updateSecondaryColor, loading, hydrated };
}
