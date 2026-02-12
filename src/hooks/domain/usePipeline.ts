import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, EventoDB } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarEvent, EventType, PipelineStage } from '@/types/solarzap';

const mapEventType = (tipo: string): EventType => {
    const typeMap: Record<string, EventType> = {
        'chamada': 'chamada',
        'visita': 'visita',
        'instalacao': 'instalacao',
        'followup': 'followup',
        'reuniao': 'reuniao',
    };
    return typeMap[tipo?.toLowerCase()] || 'chamada';
};

const eventoToCalendarEvent = (evento: EventoDB): CalendarEvent => ({
    id: String(evento.id),
    contactId: String(evento.lead_id || 0),
    title: evento.titulo,
    description: evento.descricao || undefined,
    type: mapEventType(evento.tipo),
    startDate: new Date(evento.data_inicio),
    endDate: new Date(evento.data_fim),
    isCompleted: evento.concluido,
});

export function usePipeline() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const eventsQuery = useQuery({
        queryKey: ['events', user?.id],
        queryFn: async () => {
            if (!user) return [];
            try {
                // Now fetching from 'appointments' instead of 'eventos'
                const { data, error } = await supabase
                    .from('appointments')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('start_at', { ascending: true });

                if (error) {
                    console.log('Appointments table fetch error:', error);
                    return [];
                }

                // Map AppointmentDB to CalendarEvent
                return (data || []).map((appt: any) => ({
                    id: String(appt.id),
                    contactId: String(appt.lead_id || 0),
                    title: appt.title,
                    description: appt.notes || undefined,
                    type: mapEventType(appt.type),
                    startDate: new Date(appt.start_at),
                    endDate: new Date(appt.end_at),
                    isCompleted: appt.status === 'done' || appt.status === 'completed',
                }));
            } catch (e) {
                console.error("Error fetching events:", e);
                return [];
            }
        },
        enabled: !!user,
    });

    const moveToPipelineMutation = useMutation({
        mutationFn: async ({ contactId, newStage }: { contactId: string; newStage: PipelineStage }) => {
            // 1. Update Lead Status AND Stage Changed Date
            const { error: leadError } = await supabase
                .from('leads')
                .update({
                    status_pipeline: newStage,
                    stage_changed_at: new Date().toISOString()
                })
                .eq('id', Number(contactId));

            if (leadError) throw leadError;

            // 2. Fetch Lead Data for Deal Logic
            const { data: lead } = await supabase
                .from('leads')
                .select('valor_estimado, user_id')
                .eq('id', Number(contactId))
                .single();

            if (lead) {
                // 3. Map Stage to Deal Status
                let dealStatus = 'open';
                const wonStages = [
                    'contrato_assinado', 'projeto_pago', 'aguardando_instalacao',
                    'projeto_instalado', 'coletar_avaliacao', 'contato_futuro'
                ];

                if (wonStages.includes(newStage)) {
                    dealStatus = 'won';
                } else if (newStage === 'perdido') {
                    dealStatus = 'lost';
                }

                // 4. Upsert Deal
                // Check if deal exists
                const { data: existingDeals } = await supabase
                    .from('deals')
                    .select('id')
                    .eq('lead_id', Number(contactId));

                const existingDealId = existingDeals && existingDeals.length > 0 ? existingDeals[0].id : null;

                const dealData = {
                    lead_id: Number(contactId),
                    user_id: lead.user_id,
                    status: dealStatus,
                    amount: lead.valor_estimado || 0,
                    // If moving to won/lost, set closed_at. If moving back to open, clear it.
                    closed_at: (dealStatus === 'won' || dealStatus === 'lost') ? new Date().toISOString() : null
                };

                if (existingDealId) {
                    await supabase.from('deals').update(dealData).eq('id', existingDealId);
                } else {
                    // Only create deal if it has value or is won (optional, but good practice)
                    // But to ensure "Forecast" works, we should create it if it's open too.
                    await supabase.from('deals').insert(dealData);
                }
            }

            return { contactId, newStage };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-report-client'] }); // Invalidate dashboard too
        },
    });

    const saveProposalMutation = useMutation({
        mutationFn: async (data: {
            leadId: string;
            valorProjeto: number;
            consumoKwh: number;
            potenciaKw: number;
            paineisQtd: number;
            economiaMensal: number;
            paybackAnos: number;
            status?: string;
        }) => {
            if (!user) throw new Error('User not authenticated');
            const { data: proposal, error } = await supabase
                .from('propostas')
                .insert({
                    lead_id: Number(data.leadId),
                    user_id: user.id,
                    valor_projeto: Math.round(data.valorProjeto),
                    consumo_kwh: Math.round(data.consumoKwh),
                    potencia_kw: data.potenciaKw,
                    paineis_qtd: data.paineisQtd,
                    economia_mensal: data.economiaMensal,
                    payback_anos: data.paybackAnos,
                    status: data.status || 'Enviada',
                })
                .select()
                .single();

            if (error) throw error;
            return proposal;
        },
    });

    const addEventMutation = useMutation({
        mutationFn: async (event: Omit<CalendarEvent, 'id'>) => {
            if (!user) throw new Error("No user");

            const { data, error } = await supabase
                .from('appointments')
                .insert({
                    lead_id: Number(event.contactId),
                    user_id: user.id,
                    title: event.title,
                    notes: event.description || null,
                    type: event.type,
                    start_at: event.startDate.toISOString(),
                    end_at: event.endDate.toISOString(),
                    status: event.isCompleted ? 'done' : 'scheduled',
                })
                .select()
                .single();

            if (error) throw error;

            // Map back to CalendarEvent for the UI update
            return {
                id: String(data.id),
                contactId: String(data.lead_id || 0),
                title: data.title,
                description: data.notes || undefined,
                type: mapEventType(data.type),
                startDate: new Date(data.start_at),
                endDate: new Date(data.end_at),
                isCompleted: data.status === 'done' || data.status === 'completed',
            };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events'] });
            queryClient.invalidateQueries({ queryKey: ['appointments'] }); // Sync Calendar too!
            queryClient.invalidateQueries({ queryKey: ['dashboard-report-client'] }); // Sync Dashboard too!
        }
    });

    return {
        events: eventsQuery.data || [],
        isLoadingEvents: eventsQuery.isLoading && !!user,
        moveToPipeline: moveToPipelineMutation.mutateAsync,
        saveProposal: saveProposalMutation.mutateAsync,
        addEvent: addEventMutation.mutateAsync,
    };
}
