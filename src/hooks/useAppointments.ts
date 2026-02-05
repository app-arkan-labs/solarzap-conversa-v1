import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Appointment, AppointmentStatus, AppointmentType } from '@/types/solarzap';
import { toast } from 'sonner';

export type CreateAppointmentData = {
    lead_id: number;
    title: string;
    type: AppointmentType;
    start_at: Date;
    end_at: Date;
    location?: string;
    notes?: string;
    outcome?: string;
    status?: AppointmentStatus;
};

export type UpdateAppointmentData = Partial<CreateAppointmentData>;

export function useAppointments() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Real-time subscription
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('appointments-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'appointments',
                    filter: `user_id=eq.${user.id}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['appointments'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, queryClient]);

    const appointmentsQuery = useQuery({
        queryKey: ['appointments', user?.id],
        queryFn: async () => {
            if (!user) return [];

            const { data, error } = await supabase
                .from('appointments')
                .select('*')
                .eq('user_id', user.id)
                .order('start_at', { ascending: true });

            if (error) {
                console.error('Error fetching appointments:', error);
                toast.error('Erro ao buscar agendamentos: ' + error.message);
                return [];
            }

            return data as Appointment[];
        },
        enabled: !!user,
    });

    const createAppointment = useMutation({
        mutationFn: async (data: CreateAppointmentData) => {
            if (!user) throw new Error('User not authenticated');

            const { data: newEvent, error } = await supabase
                .from('appointments')
                .insert({
                    user_id: user.id,
                    lead_id: data.lead_id,
                    title: data.title,
                    type: data.type, // Ensure type matches DB check
                    status: data.status || 'scheduled',
                    start_at: data.start_at.toISOString(),
                    end_at: data.end_at.toISOString(),
                    location: data.location,
                    notes: data.notes,
                    outcome: data.outcome
                })
                .select()
                .single();

            if (error) throw error;
            return newEvent;
        },
        onSuccess: () => {
            toast.success('Agendamento criado com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
        },
        onError: (err: any) => {
            console.error('Error creating appointment:', err);
            toast.error('Erro ao criar agendamento: ' + err.message);
        }
    });

    const updateAppointment = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateAppointmentData }) => {
            const payload: any = {};
            if (data.title) payload.title = data.title;
            if (data.type) payload.type = data.type;
            if (data.status) payload.status = data.status;
            if (data.start_at) payload.start_at = data.start_at.toISOString();
            if (data.end_at) payload.end_at = data.end_at.toISOString();
            if (data.location !== undefined) payload.location = data.location;
            if (data.notes !== undefined) payload.notes = data.notes;
            if (data.lead_id) payload.lead_id = data.lead_id;
            if (data.outcome !== undefined) payload.outcome = data.outcome;

            const { error } = await supabase
                .from('appointments')
                .update(payload)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Agendamento atualizado!');
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
        },
        onError: (err: any) => {
            toast.error('Erro ao atualizar: ' + err.message);
        }
    });

    const deleteAppointment = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('appointments')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Agendamento excluído.');
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
        }
    });

    return {
        appointments: appointmentsQuery.data || [],
        isLoading: appointmentsQuery.isLoading,
        createAppointment: createAppointment.mutateAsync,
        updateAppointment: updateAppointment.mutateAsync,
        deleteAppointment: deleteAppointment.mutateAsync
    };
}
