import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Contact, Channel, PipelineStage, ClientType } from '@/types/solarzap';

// Module-level cache for DB schema capabilities (to avoid repeated failed requests)
let dbSupportsExtendedColumns: boolean | null = null;
const META_TAG = '[[LEAD_META_JSON]]';

// Fields that might not exist in older DB versions
interface ExtendedLeadFields {
    endereco?: string;
    cidade?: string;
    cep?: string;
    tipo_cliente?: ClientType;
    uf?: string;
}

// Helper: Extract valid JSON from observations if present
const parseLeadMeta = (obs: string | null | undefined): ExtendedLeadFields => {
    if (!obs || !obs.includes(META_TAG)) return {};
    try {
        const parts = obs.split(META_TAG);
        if (parts.length < 2) return {};
        // The JSON is strictly after the tag
        let jsonStr = parts[1].trim();
        // Backwards compatibility: some payloads include a leading ':' (e.g. '[[LEAD_META_JSON]]:{...}').
        if (jsonStr.startsWith(':')) jsonStr = jsonStr.slice(1).trim();
        return JSON.parse(jsonStr) || {};
    } catch (e) {
        // console.warn('Failed to parse LEAD_META_JSON', e);
        return {};
    }
};

// Helper: Clean observations (remove old meta)
const cleanObservations = (obs: string | null | undefined): string => {
    if (!obs) return '';
    if (!obs.includes(META_TAG)) return obs;
    return obs.split(META_TAG)[0].trim();
};

// Helper: Update observations with new meta
const packLeadMeta = (currentObs: string | null | undefined, data: ExtendedLeadFields): string => {
    const baseObs = cleanObservations(currentObs);
    // Only pack if there is actual data to save
    const hasData = Object.values(data).some(v => v !== undefined && v !== null && v !== '');
    if (!hasData) return baseObs;
    return `${baseObs}\n\n${META_TAG}:${JSON.stringify(data)}`;
};

// Helper to map DB lead to Contact (Domain entity)
export const mapChannel = (canal: string): Channel => {
    const channelMap: Record<string, Channel> = {
        'whatsapp': 'whatsapp',
        'messenger': 'messenger',
        'instagram': 'instagram',
        'email': 'email',
        'google_ads': 'google_ads',
        'facebook_ads': 'facebook_ads',
        'tiktok_ads': 'tiktok_ads',
        'indication': 'indication',
        'event': 'event',
        'cold_list': 'cold_list',
        'other': 'other'
    };
    // Normalize logic
    const normalized = canal?.toLowerCase().replace(/\s+/g, '_') || 'whatsapp';
    return channelMap[normalized] || 'whatsapp';
};

export const mapPipelineStage = (status: string): PipelineStage => {
    if (!status) return 'novo_lead';

    const normalized = status
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .trim();

    const stageMap: Record<string, PipelineStage> = {
        'novo_lead': 'novo_lead',
        'respondeu': 'respondeu',
        'chamada_agendada': 'chamada_agendada',
        'chamada_realizada': 'chamada_realizada',
        'nao_compareceu': 'nao_compareceu',
        'aguardando_proposta': 'aguardando_proposta',
        'proposta_pronta': 'proposta_pronta',
        'visita_agendada': 'visita_agendada',
        'visita_realizada': 'visita_realizada',
        'proposta_negociacao': 'proposta_negociacao',
        'financiamento': 'financiamento',
        'aprovou_projeto': 'aprovou_projeto',
        'contrato_assinado': 'contrato_assinado',
        'projeto_pago': 'projeto_pago',
        'aguardando_instalacao': 'aguardando_instalacao',
        'projeto_instalado': 'projeto_instalado',
        'coletar_avaliacao': 'coletar_avaliacao',
        'contato_futuro': 'contato_futuro',
        'perdido': 'perdido',
        'novo': 'novo_lead',
        'lead': 'novo_lead',
    };

    return stageMap[normalized] || 'novo_lead';
};

export const leadToContact = (lead: any): Contact => {
    // 1. Try real columns first (if type definition allowed them, assuming lead: any to bypass strict check for now)
    // 2. Fallback to meta
    const meta = parseLeadMeta(lead.observacoes || lead.notes); // DB might use either alias depending on legacy

    // Notes: clean the meta tag out for display
    const visibleNotes = cleanObservations(lead.observacoes || lead.notes);

    return {
        id: String(lead.id),
        name: lead.nome || 'Sem nome',
        company: lead.empresa || undefined,
        phone: lead.telefone || '',
        email: lead.email || undefined,
        channel: mapChannel(lead.canal),
        pipelineStage: mapPipelineStage(lead.status_pipeline),

        // Extended Fields (Column ?? Meta ?? Default)
        clientType: (lead.tipo_cliente || meta.tipo_cliente || 'residencial') as ClientType,
        address: lead.endereco || meta.endereco,
        city: lead.cidade || meta.cidade,
        state: lead.uf || meta.uf,
        // Zip isn't in standard LeadDB usually, but we check:
        // @ts-ignore
        zip: lead.cep || meta.cep, // Maps to 'cep' in UI usually

        consumption: lead.consumo_kwh || 0,
        projectValue: lead.valor_estimado || 0,

        cpfCnpj: undefined,
        createdAt: new Date(lead.created_at),
        lastContact: new Date(lead.created_at),
        stageChangedAt: lead.stage_changed_at ? new Date(lead.stage_changed_at) : new Date(lead.created_at),
        phoneE164: lead.phone_e164 || undefined,
        instanceName: lead.instance_name || undefined,
        assignedToUserId: lead.assigned_to_user_id || null,

        notes: visibleNotes,

        // AI Control
        aiEnabled: lead.ai_enabled ?? true,
        aiPausedReason: lead.ai_paused_reason,
        aiPausedAt: lead.ai_paused_at ? new Date(lead.ai_paused_at) : null,
    };
};

export interface LeadPatch {
    nome?: string;
    telefone?: string;
    email?: string;
    empresa?: string;
    tipo_cliente?: ClientType;
    endereco?: string;
    cidade?: string;
    cep?: string;
    consumo_kwh?: number;
    valor_estimado?: number;
    observacoes?: string;
    status_pipeline?: PipelineStage;
    canal?: Channel;
}

export function useLeads() {
    const { user, orgId, canViewTeamLeads } = useAuth();
    const queryClient = useQueryClient();
    const [showTeamLeads, setShowTeamLeads] = useState(false);
    const canViewTeam = canViewTeamLeads;
    const leadsQueryKey = useMemo(
        () => ['leads', orgId, user?.id, showTeamLeads, canViewTeam] as const,
        [orgId, user?.id, showTeamLeads, canViewTeam]
    );

    useEffect(() => {
        if (!canViewTeam) {
            setShowTeamLeads(false);
        }
    }, [canViewTeam]);

    // Real-time subscription for leads
    useEffect(() => {
        if (!user || !orgId) return;

        const subscription = supabase
            .channel(`leads-realtime-${orgId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'leads',
                    filter: `org_id=eq.${orgId}`,
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newLead = payload.new;
                        const newContact = leadToContact(newLead);
                        toast.success(`Novo Lead recebido: ${newContact.name}`);
                        queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                            if (!oldData) return [newContact];
                            if (oldData.some(c => c.id === newContact.id)) return oldData;
                            return [newContact, ...oldData];
                        });
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = String(payload.old.id);
                        queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                            if (!oldData) return [];
                            return oldData.filter(c => c.id !== deletedId);
                        });
                        toast.info('Contato excluído');
                    } else {
                        // UPDATE
                        // We could optimistically update here, but for now we just invalidate
                        // toast.info('Leads atualizados');
                    }
                    queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user, orgId, queryClient, leadsQueryKey]);

    const leadsQuery = useQuery({
        queryKey: leadsQueryKey,
        queryFn: async () => {
            if (!user || !orgId) return [];
            const query = supabase
                .from('leads')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });

            let { data, error } = await query;
            if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                // Defensive fallback in case schema cache lags behind migration.
                const fallback = await supabase
                    .from('leads')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });
                data = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;
            const contacts = (data || []).map(leadToContact);
            if (showTeamLeads && canViewTeam) {
                return contacts;
            }
            return contacts.filter((c) => (c.assignedToUserId || '') === user.id);
        },
        enabled: !!user && !!orgId,
        refetchInterval: 5000,
    });

    // GENERIC HELPER: Try insert/update with Safe Fallback
    const safeSupabaseWrite = async (
        operation: 'INSERT' | 'UPDATE',
        table: string,
        basePayload: any,
        extendedPayload: ExtendedLeadFields,
        matchId?: number
    ) => {
        // Prepare FULL payload attempt
        const fullPayload = { ...basePayload, ...extendedPayload };

        // Prepare FALLBACK payload (extended packed into observacoes)
        // We need 'observacoes' from basePayload to append to it
        const fallbackObs = packLeadMeta(basePayload.observacoes, extendedPayload);
        const fallbackPayload = { ...basePayload, observacoes: fallbackObs };

        // Optimization: If we already know DB fails on extended cols, go straight to fallback
        if (dbSupportsExtendedColumns === false) {
            // console.log('Using Cached Fallback (Meta JSON)');
            if (operation === 'INSERT') return supabase.from(table).insert(fallbackPayload).select().single();
            else return supabase.from(table).update(fallbackPayload).eq('id', matchId).select().single();
        }

        // Try FULL Attempt
        let query;
        if (operation === 'INSERT') query = supabase.from(table).insert(fullPayload).select().single();
        else query = supabase.from(table).update(fullPayload).eq('id', matchId).select().single();

        const { data, error } = await query;

        const isMissingColumn =
            // Postgres: undefined_column
            error && (error.code === '42703' ||
                // PostgREST: schema cache mismatch ("Could not find the 'xyz' column...")
                error.code === 'PGRST204' ||
                /schema cache/i.test(error.message || ''));

        if (isMissingColumn) {
            console.warn('DB Column missing. Switching to Meta JSON storage. Error:', error.message);
            dbSupportsExtendedColumns = false; // Cache failure for session

            // Retry with FALLBACK
            if (operation === 'INSERT') return supabase.from(table).insert(fallbackPayload).select().single();
            else return supabase.from(table).update(fallbackPayload).eq('id', matchId).select().single();
        } else if (!error) {
            // Success! We know columns exist (or we didn't send any extended fields that mattered)
            // Only set to true if we actually sent extended fields and it worked
            if (Object.keys(extendedPayload).length > 0) {
                dbSupportsExtendedColumns = true;
            }
        }

        return { data, error };
    };

    const createLeadMutation = useMutation({
        mutationFn: async (data: LeadPatch) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            const basePayload = {
                org_id: orgId,
                user_id: user.id,
                assigned_to_user_id: user.id,
                nome: data.nome,
                telefone: data.telefone,
                email: data.email || null,
                empresa: data.empresa || null,
                canal: data.canal || 'whatsapp',
                consumo_kwh: data.consumo_kwh || 0,
                valor_estimado: data.valor_estimado || 0,
                status_pipeline: data.status_pipeline || 'novo_lead',
                observacoes: data.observacoes || '',
            };

            const extendedPayload: ExtendedLeadFields = {
                tipo_cliente: data.tipo_cliente,
                endereco: data.endereco,
                cidade: data.cidade,
                cep: data.cep,
            };

            const { data: newLead, error } = await safeSupabaseWrite('INSERT', 'leads', basePayload, extendedPayload);

            if (error) throw error;
            return leadToContact(newLead);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
    });

    const updateLeadMutation = useMutation({
        mutationFn: async ({ contactId, data }: { contactId: string; data: LeadPatch }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            const basePayload: any = {};
            if (data.nome !== undefined) {
                basePayload.nome = data.nome;
                basePayload.name_manually_changed = true;
                basePayload.name_source = 'manual';
            }
            if (data.telefone !== undefined) basePayload.telefone = data.telefone;
            if (data.email !== undefined) basePayload.email = data.email || null;
            if (data.empresa !== undefined) basePayload.empresa = data.empresa || null;
            if (data.consumo_kwh !== undefined) basePayload.consumo_kwh = data.consumo_kwh;
            if (data.valor_estimado !== undefined) basePayload.valor_estimado = data.valor_estimado;
            if (data.status_pipeline !== undefined) basePayload.status_pipeline = data.status_pipeline;
            if (data.canal !== undefined) basePayload.canal = data.canal;
            if (data.observacoes !== undefined) basePayload.observacoes = data.observacoes;

            const extendedPayload: ExtendedLeadFields = {};
            if (data.tipo_cliente !== undefined) extendedPayload.tipo_cliente = data.tipo_cliente;
            if (data.endereco !== undefined) extendedPayload.endereco = data.endereco;
            if (data.cidade !== undefined) extendedPayload.cidade = data.cidade;
            if (data.cep !== undefined) extendedPayload.cep = data.cep;

            const { error } = await safeSupabaseWrite('UPDATE', 'leads', basePayload, extendedPayload, Number(contactId));

            if (error) throw error;
            return { contactId, ...data };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
    });

    const importContactsMutation = useMutation({
        mutationFn: async (contacts: any[]) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');
            // Simplified import handling (batch imports handled individually for safety or via simple batch if columns trusted)
            // For now, retaining existing batch logic but adding type_cliente if it exists in DB

            // NOTE: Importing huge lists with the "try/catch" logic row-by-row is slow.
            // As a compromise for this increment, we will perform ONE check for columns using a dummy or first row,
            // then process the rest. OR just fall back to simple logic for import.
            // Given the requirement "No migration", we'll just try to insert extended fields and if it fails, the user will see error.
            // But to be consistent, let's keep the existing logic but pass 'tipo_cliente' which we know is crucial.

            const chunkSize = 50;
            for (let i = 0; i < contacts.length; i += chunkSize) {
                const chunk = contacts.slice(i, i + chunkSize);
                // We try to include tipo_cliente
                const { error } = await supabase.from('leads').insert(
                    chunk.map(c => ({
                        org_id: orgId,
                        user_id: user.id,
                        assigned_to_user_id: user.id,
                        nome: c.nome,
                        telefone: c.telefone,
                        email: c.email || null,
                        empresa: c.empresa || null,
                        canal: c.canal || 'whatsapp',
                        consumo_kwh: c.consumo_kwh || 0,
                        valor_estimado: c.valor_estimado || 0,
                        status_pipeline: c.status_pipeline || 'novo_lead',
                        observacoes: c.observacoes || '',
                        // Try sending type. If it fails, batch import fails.
                        // Ideally we'd use the safeSupabaseWrite logic but it doesn't support batch nicely yet.
                        // Assuming types match existing DB for batch import usage (legacy).
                        tipo_cliente: c.tipo_cliente || 'residencial',
                    }))
                );
                if (error) {
                    // Fallback: Try without tipo_cliente if that was the issue?
                    // For now, throw to alert user.
                    throw error;
                }
            }
            return Promise.resolve();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        }
    });

    const deleteLeadMutation = useMutation({
        mutationFn: async (leadId: string) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');
            const { data: lead } = await supabase.from('leads').select('phone_e164, instance_name').eq('id', Number(leadId)).single();

            if (lead?.phone_e164) {
                const { error: rpcError } = await supabase.rpc('hard_delete_thread', {
                    p_user_id: user.id,
                    p_instance_name: lead.instance_name || '',
                    p_phone_e164: lead.phone_e164
                });
                if (rpcError) {
                    const { error } = await supabase.from('leads').delete().eq('id', Number(leadId));
                    if (error) throw error;
                }
            } else {
                const { error } = await supabase.from('leads').delete().eq('id', Number(leadId));
                if (error) throw error;
            }
            return leadId;
        },
        onSuccess: (deletedId) => {
            toast.success('Contato excluído permanentemente');
            queryClient.setQueriesData({ queryKey: ['leads', orgId] }, (old: Contact[] | undefined) =>
                Array.isArray(old) ? old.filter(c => c.id !== deletedId) : old
            );
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
        onError: (error) => {
            console.error('Error deleting lead:', error);
            toast.error('Erro ao excluir contato');
        }
    });

    const toggleLeadAiMutation = useMutation({
        mutationFn: async ({ leadId, enabled, reason }: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');
            const updatePayload: any = {
                ai_enabled: enabled,
                ai_paused_reason: enabled ? null : (reason || 'manual'),
                ai_paused_at: enabled ? null : new Date().toISOString()
            };
            const { error } = await supabase.from('leads').update(updatePayload).eq('id', Number(leadId));
            if (error) throw error;
            return { leadId, enabled };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        }
    });

    return {
        contacts: leadsQuery.data || [],
        isLoading: leadsQuery.isLoading && !!user,
        isError: leadsQuery.isError,
        showTeamLeads,
        setShowTeamLeads,
        canViewTeam,
        createLead: createLeadMutation.mutateAsync,
        updateLead: updateLeadMutation.mutateAsync,
        deleteLead: deleteLeadMutation.mutateAsync,
        importContacts: importContactsMutation.mutateAsync,
        toggleLeadAi: toggleLeadAiMutation.mutateAsync,
    };
}


