import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, LeadDB } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Contact, Channel, PipelineStage, ClientType } from '@/types/solarzap';

// Helper to map DB lead to Contact (Domain entity)
export const mapChannel = (canal: string): Channel => {
    const channelMap: Record<string, Channel> = {
        'whatsapp': 'whatsapp',
        'messenger': 'messenger',
        'instagram': 'instagram',
        'email': 'email',
    };
    return channelMap[canal?.toLowerCase()] || 'whatsapp';
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

const leadToContact = (lead: LeadDB): Contact => ({
    id: String(lead.id),
    name: lead.nome || 'Sem nome',
    company: lead.empresa || undefined,
    phone: lead.telefone || '',
    email: lead.email || undefined,
    channel: mapChannel(lead.canal),
    pipelineStage: mapPipelineStage(lead.status_pipeline),
    clientType: 'residencial',
    consumption: lead.consumo_kwh || 0,
    projectValue: lead.valor_estimado || 0,
    address: undefined,
    city: undefined,
    state: undefined,
    cpfCnpj: undefined,
    createdAt: new Date(lead.created_at),
    lastContact: new Date(lead.created_at),
    stageChangedAt: lead.stage_changed_at ? new Date(lead.stage_changed_at) : new Date(lead.created_at),
    phoneE164: lead.phone_e164 || undefined, // NEW
    instanceName: lead.instance_name || undefined, // NEW
    notes: undefined,
});

export function useLeads() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Real-time subscription for leads
    useEffect(() => {
        if (!user) return;

        const subscription = supabase
            .channel('leads-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'leads',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('Lead update received:', payload);

                    if (payload.eventType === 'INSERT') {
                        console.log('Lead INSERT received:', payload);
                        const newLead = payload.new as LeadDB;
                        const newContact = leadToContact(newLead);

                        // Visual feedback
                        toast.success(`Novo Lead recebido: ${newContact.name}`);

                        queryClient.setQueryData(['leads', user.id], (oldData: Contact[] | undefined) => {
                            if (!oldData) return [newContact];
                            // Check for duplicates
                            if (oldData.some(c => c.id === newContact.id)) return oldData;
                            return [newContact, ...oldData];
                        });
                    } else if (payload.eventType === 'DELETE') {
                        console.log('Lead DELETE received:', payload);
                        const deletedId = String(payload.old.id);

                        // Optimistically remove from cache
                        queryClient.setQueryData(['leads', user.id], (oldData: Contact[] | undefined) => {
                            if (!oldData) return [];
                            return oldData.filter(c => c.id !== deletedId);
                        });

                        toast.info('Contato excluído');
                    } else {
                        // UPDATE
                        toast.info('Leads atualizados');
                    }

                    // Always invalidate to be safe
                    queryClient.invalidateQueries({ queryKey: ['leads'] });
                }
            )
            .subscribe((status) => {
                console.log('Realtime Subscription Status:', status);
            });

        return () => {
            subscription.unsubscribe();
        };
    }, [user, queryClient]);

    const leadsQuery = useQuery({
        queryKey: ['leads', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('leads')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []).map(leadToContact);
        },
        enabled: !!user,
        refetchInterval: 2000, // Poll every 2 seconds to ensure fresh data (fallback for Realtime)
    });

    const createLeadMutation = useMutation({
        mutationFn: async (data: {
            nome: string;
            telefone: string;
            email?: string;
            empresa?: string;
            canal?: string;
            consumo_kwh?: number;
            valor_estimado?: number;
            status_pipeline?: PipelineStage;
        }) => {
            if (!user) throw new Error('User not authenticated');

            const { data: newLead, error } = await supabase
                .from('leads')
                .insert({
                    user_id: user.id,
                    nome: data.nome,
                    telefone: data.telefone,
                    email: data.email || null,
                    empresa: data.empresa || null,
                    canal: data.canal || 'whatsapp',
                    consumo_kwh: data.consumo_kwh || 0,
                    valor_estimado: data.valor_estimado || 0,
                    status_pipeline: data.status_pipeline || 'novo_lead',
                })
                .select()
                .single();

            if (error) throw error;
            return leadToContact(newLead);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
        },
    });

    const updateLeadMutation = useMutation({
        mutationFn: async ({ contactId, data }: {
            contactId: string;
            data: {
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
        }) => {
            const updatePayload: Record<string, unknown> = {};
            if (data.nome !== undefined) {
                updatePayload.nome = data.nome;
                updatePayload.name_manually_changed = true; // Legacy support
                updatePayload.name_source = 'manual'; // Definitive Source of Truth
            }
            if (data.telefone !== undefined) updatePayload.telefone = data.telefone;
            if (data.email !== undefined) updatePayload.email = data.email || null;
            if (data.empresa !== undefined) updatePayload.empresa = data.empresa || null;
            if (data.consumo_kwh !== undefined) updatePayload.consumo_kwh = data.consumo_kwh;
            if (data.valor_estimado !== undefined) updatePayload.valor_estimado = data.valor_estimado;
            if (data.status_pipeline !== undefined) updatePayload.status_pipeline = data.status_pipeline;
            if (data.canal !== undefined) updatePayload.canal = data.canal;

            const { error } = await supabase
                .from('leads')
                .update(updatePayload)
                .eq('id', Number(contactId));

            if (error) throw error;
            return { contactId, ...data };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
        },
    });

    const importContactsMutation = useMutation({
        mutationFn: async (contacts: any[]) => {
            if (!user) throw new Error('User not authenticated');

            // Chunking for better performance (e.g., 50 at a time)
            const chunkSize = 50;
            for (let i = 0; i < contacts.length; i += chunkSize) {
                const chunk = contacts.slice(i, i + chunkSize);

                const { error } = await supabase
                    .from('leads')
                    .insert(
                        chunk.map(c => ({
                            user_id: user.id,
                            nome: c.nome,
                            telefone: c.telefone,
                            email: c.email || null,
                            empresa: c.empresa || null,
                            canal: c.canal || 'whatsapp', // Should be populated by modal
                            consumo_kwh: c.consumo_kwh || 0,
                            valor_estimado: c.valor_estimado || 0,
                            status_pipeline: c.status_pipeline || 'novo_lead',
                            observacoes: c.observacoes || `Importado via CSV em ${new Date().toLocaleDateString()}`,
                            tipo_cliente: c.tipo_cliente || 'residencial',
                        }))
                    );

                if (error) throw error;
            }

            return Promise.resolve();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
        }
    });

    const deleteLeadMutation = useMutation({
        mutationFn: async (leadId: string) => {
            if (!user) throw new Error('User not authenticated');

            // First get lead details for thread key - needed for permanent deletion
            const { data: lead } = await supabase
                .from('leads')
                .select('phone_e164, instance_name')
                .eq('id', Number(leadId))
                .single();

            if (lead?.phone_e164) {
                // Use hard delete by thread key - this creates a tombstone and deletes all related data
                console.log(`🗑️ Hard deleting thread: phone=${lead.phone_e164}, instance=${lead.instance_name}`);
                const { error: rpcError } = await supabase.rpc('hard_delete_thread', {
                    p_user_id: user.id,
                    p_instance_name: lead.instance_name || '',
                    p_phone_e164: lead.phone_e164
                });

                if (rpcError) {
                    console.error('Hard delete RPC failed, falling back to simple delete:', rpcError);
                    // Fallback to simple delete
                    const { error } = await supabase
                        .from('leads')
                        .delete()
                        .eq('id', Number(leadId));
                    if (error) throw error;
                }
            } else {
                // Fallback to simple delete for leads without phone_e164
                const { error } = await supabase
                    .from('leads')
                    .delete()
                    .eq('id', Number(leadId));
                if (error) throw error;
            }
            return leadId;
        },
        onSuccess: (deletedId) => {
            toast.success('Contato excluído permanentemente');
            queryClient.setQueryData(['leads', user?.id], (old: Contact[] | undefined) =>
                old ? old.filter(c => c.id !== deletedId) : []
            );
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['interactions'] }); // Also clear interaction cache
        },
        onError: (error) => {
            console.error('Error deleting lead:', error);
            toast.error('Erro ao excluir contato');
        }
    });

    return {
        contacts: leadsQuery.data || [],
        isLoading: leadsQuery.isLoading,
        isError: leadsQuery.isError,
        createLead: createLeadMutation.mutateAsync,
        updateLead: updateLeadMutation.mutateAsync,
        deleteLead: deleteLeadMutation.mutateAsync,
        importContacts: importContactsMutation.mutateAsync,
    };
}
