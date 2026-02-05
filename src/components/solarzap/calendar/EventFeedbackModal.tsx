import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Appointment } from '@/types/solarzap';
import { useAppointments } from '@/hooks/useAppointments';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Archive, CalendarIcon, MapPin, Clock } from 'lucide-react';

interface EventFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    appointment?: Appointment;
}

export function EventFeedbackModal({ isOpen, onClose, appointment }: EventFeedbackModalProps) {
    const [outcome, setOutcome] = useState('');
    const { updateAppointment } = useAppointments();

    const handleSave = async () => {
        if (!appointment) return;

        try {
            await updateAppointment({
                id: appointment.id,
                data: {
                    outcome: outcome,
                    status: 'completed'
                }
            });

            // Added: Save to Lead Comments
            if (outcome.trim() && appointment.lead_id) {
                const { error: commentError } = await import('@/lib/supabase').then(m => m.supabase
                    .from('comentarios_leads')
                    .insert([{
                        lead_id: appointment.lead_id,
                        texto: `[Feedback Evento] ${appointment.title}: ${outcome}`,
                        autor: 'Vendedor'
                    }])
                );
                if (commentError) console.error("Error saving comment:", commentError);
            }

            onClose();
            setOutcome(''); // Reset
        } catch (error) {
            console.error(error);
        }
    };

    if (!appointment) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Archive className="w-5 h-5 text-muted-foreground" />
                        Arquivar Evento
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Event Summary */}
                    <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                        <h4 className="font-semibold text-sm">{appointment.title}</h4>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                {format(new Date(appointment.start_at), "dd/MM/yyyy")}
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(appointment.start_at), "HH:mm")}
                            </div>
                            {appointment.location && (
                                <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {appointment.location}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Como foi o evento? (Feedback)</Label>
                        <Textarea
                            placeholder="Descreva o resultado da reunião, pontos importantes ou próximos passos..."
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                            className="min-h-[120px]"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={!outcome.trim()}>
                        Salvar e Arquivar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
