import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  type ProposalThemeId,
  type ProposalColorTheme,
  getThemeById,
} from '@/utils/proposalColorThemes';

export function useProposalTheme() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [themeId, setThemeId] = useState<ProposalThemeId>('verde');
  const [loading, setLoading] = useState(false);

  // Fetch current theme from company_profile
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('company_profile')
          .select('proposal_theme')
          .eq('org_id', orgId)
          .maybeSingle();
        if (!cancelled && !error && data?.proposal_theme) {
          setThemeId(data.proposal_theme as ProposalThemeId);
        }
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const theme: ProposalColorTheme = getThemeById(themeId);

  const updateTheme = useCallback(async (newId: ProposalThemeId) => {
    if (!orgId) return;
    setThemeId(newId);
    setLoading(true);
    try {
      // Upsert — company_profile may or may not exist for this org
      const { error } = await supabase
        .from('company_profile')
        .upsert(
          { org_id: orgId, proposal_theme: newId, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' }
        );
      if (error) throw error;
      toast({ title: 'Tema salvo', description: `Tema "${getThemeById(newId).label}" aplicado às próximas propostas.` });
    } catch (err) {
      console.error('Failed to save proposal theme:', err);
      toast({ title: 'Erro ao salvar tema', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  return { themeId, theme, updateTheme, loading };
}
