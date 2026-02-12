import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AISettings, AIStageConfig, DEFAULT_AI_SETTINGS } from '@/types/ai';
import { useToast } from '@/hooks/use-toast';

export function useAISettings() {
    const [settings, setSettings] = useState<AISettings | null>(null);
    const [stageConfigs, setStageConfigs] = useState<AIStageConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const didInitCompanyId = useRef(false);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch Global Settings
            const { data: settingsData, error: settingsError } = await supabase
                .from('ai_settings')
                .select('*')
                .single();

            if (settingsError) {
                if (settingsError.code === 'PGRST116') {
                    // Not found, assume default (will be created by migration or manually)
                    // For UI purposes we can show defaults
                    console.log('AI Settings not found, showing defaults');
                } else {
                    console.error('Error fetching AI settings:', settingsError);
                }
            } else {
                setSettings(settingsData);

                // Auto-fix company_id if missing (Hardening RAG)
                if (!settingsData.company_id && !didInitCompanyId.current) {
                    didInitCompanyId.current = true;
                    const { data: { user } } = await supabase.auth.getUser();
                    const orgId = user?.user_metadata?.org_id || user?.id;

                    if (orgId) {
                        console.log('🔧 Auto-fixing missing company_id in settings to:', orgId);
                        const { error: updateErr } = await supabase
                            .from('ai_settings')
                            .update({ company_id: orgId })
                            .eq('id', settingsData.id);

                        if (!updateErr) {
                            // Optimistic update locally to avoid reload loop
                            setSettings({ ...settingsData, company_id: orgId });
                        }
                    }
                }
            }

            // Fetch Stage Configs
            const { data: stagesData, error: stagesError } = await supabase
                .from('ai_stage_config')
                .select('*')
                .order('id');

            if (stagesError) {
                console.error('Error fetching AI stages:', stagesError);
            } else {
                setStageConfigs(stagesData || []);
            }

        } catch (error) {
            console.error('Unexpected error in useAISettings:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();

        // Subscription for real-time updates
        const settingsSub = supabase
            .channel('ai_settings_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_settings' }, () => {
                fetchSettings();
            })
            .subscribe();

        const stageSub = supabase
            .channel('ai_stage_config_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_stage_config' }, () => {
                fetchSettings();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(settingsSub);
            supabase.removeChannel(stageSub);
        };
    }, [fetchSettings]);

    const updateGlobalSettings = async (updates: Partial<AISettings>) => {
        try {
            if (!settings?.id) {
                // Create if doesn't exist (edge case)
                const { error } = await supabase
                    .from('ai_settings')
                    .insert([{ ...DEFAULT_AI_SETTINGS, ...updates }])
                    .select()
                    .single();

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('ai_settings')
                    .update(updates)
                    .eq('id', settings.id);

                if (error) throw error;
            }

            toast({ title: "Configurações atualizadas!" });
            fetchSettings(); // Refresh
        } catch (error) {
            console.error('Error updating settings:', error);
            toast({ title: "Erro ao atualizar", variant: "destructive" });
        }
    };

    const updateStageConfig = async (stage: string | number, updates: Partial<AIStageConfig>) => {
        try {
            let query = supabase.from('ai_stage_config').update(updates);

            if (typeof stage === 'number') {
                query = query.eq('id', stage);
            } else {
                query = query.eq('pipeline_stage', stage);
            }

            const { error } = await query;

            if (error) throw error;

            toast({ title: "Agente atualizado!" });
            // Optimistic update
            setStageConfigs(prev => prev.map(s => {
                if (typeof stage === 'number' && s.id === stage) return { ...s, ...updates };
                if (typeof stage === 'string' && s.pipeline_stage === stage) return { ...s, ...updates };
                return s;
            }));
        } catch (error) {
            console.error('Error updating stage config:', error);
            toast({ title: "Erro ao atualizar agente", variant: "destructive" });
        }
    };

    const restoreDefaultPrompt = async (stage: string) => {
        try {
            const { error } = await supabase
                .from('ai_stage_config')
                .update({ prompt_override: null }) // Setting to null restores usage of default_prompt in View logic
                .eq('pipeline_stage', stage);

            if (error) throw error;

            toast({ title: "Prompt restaurado para o padrão!" });
            fetchSettings();
        } catch (error) {
            console.error('Error restoring default prompt:', error);
            toast({ title: "Erro ao restaurar", variant: "destructive" });
        }
    };

    return {
        settings: settings || (DEFAULT_AI_SETTINGS as AISettings), // Fallback
        stageConfigs,
        loading: isLoading, // Renamed to loading to match View usage
        updateGlobalSettings,
        updateStageConfig,
        restoreDefaultPrompt,
        refresh: fetchSettings
    };
}
