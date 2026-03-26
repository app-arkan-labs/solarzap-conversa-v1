import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Appointment, Contact, LeadTask } from '@/types/solarzap';
import { useAppointments } from '@/hooks/useAppointments';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Archive, CalendarIcon, Clock, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EventFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    appointment?: Appointment;
    contact?: Contact | null;
    linkedNextAction?: LeadTask | null;
    onCompleteLinkedNextAction?: (task: LeadTask, resultSummary: string) => Promise<void>;
    onCreateNextAction?: (input: {
        leadId: number;
        title: string;
        notes?: string | null;
        dueAt?: Date | null;
        priority?: LeadTask['priority'];
        channel?: LeadTask['channel'];
        userId?: string | null;
    }) => Promise<void>;
}

const toDateTimeLocalValue = (value: string | null | undefined) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export function EventFeedbackModal({
    isOpen,
    onClose,
    appointment,
    contact = null,
    linkedNextAction = null,
    onCompleteLinkedNextAction,
    onCreateNextAction,
}: EventFeedbackModalProps) {
    const [outcome, setOutcome] = useState(appointment?.outcome || '');
    const [completeLinkedAction, setCompleteLinkedAction] = useState(true);
    const [nextActionTitle, setNextActionTitle] = useState('');
    const [nextActionDueAt, setNextActionDueAt] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { updateAppointment } = useAppointments();
    const { orgId } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (!isOpen) return;
        setOutcome(appointment?.outcome || '');
        setCompleteLinkedAction(true);
        setNextActionTitle('');
        setNextActionDueAt(toDateTimeLocalValue(appointment?.start_at));
    }, [appointment?.outcome, appointment?.start_at, isOpen]);

    const handleSave = async () => {
        if (!appointment || !orgId) return;

        const trimmedOutcome = outcome.trim();
        if (!trimmedOutcome) return;

        try {
            setIsSaving(true);

            await updateAppointment({
                id: appointment.id,
                data: {
                    outcome: trimmedOutcome,
                    status: 'completed',
                },
            });

            if (appointment.lead_id) {
                const { error: commentError } = await import('@/lib/supabase').then((module) =>
                    module.supabase.from('comentarios_leads').insert([
                        {
                            org_id: orgId,
                            lead_id: appointment.lead_id,
                            texto: `[Feedback Evento] ${appointment.title}: ${trimmedOutcome}`,
                            autor: 'Vendedor',
                        },
                    ]),
                );

                if (commentError) {
                    console.error('Error saving comment:', commentError);
                }
            }

            if (linkedNextAction && completeLinkedAction && onCompleteLinkedNextAction) {
                await onCompleteLinkedNextAction(linkedNextAction, trimmedOutcome);
            }

            if (appointment.lead_id && onCreateNextAction && nextActionTitle.trim()) {
                if (linkedNextAction && !completeLinkedAction) {
                    throw new Error('Conclua a proxima acao vinculada antes de criar outra.');
                }

                await onCreateNextAction({
                    leadId: appointment.lead_id,
                    title: nextActionTitle.trim(),
                    notes: `Gerada apos feedback do evento "${appointment.title}".`,
                    dueAt: nextActionDueAt ? new Date(nextActionDueAt) : null,
                    priority: 'medium',
                    channel: linkedNextAction?.channel || null,
                    userId: contact?.assignedToUserId || null,
                });
            }

            onClose();
            setOutcome('');
            setNextActionTitle('');
            setNextActionDueAt('');
        } catch (error) {
            console.error(error);
            toast({
                title: 'Erro ao arquivar evento',
                description: error instanceof Error ? error.message : 'Tente novamente.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (!appointment) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Archive className="h-5 w-5 text-muted-foreground" />
                        Arquivar Evento
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                        <h4 className="text-sm font-semibold">{appointment.title}</h4>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {format(new Date(appointment.start_at), 'dd/MM/yyyy')}
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(appointment.start_at), 'HH:mm')}
                            </div>
                            {appointment.location ? (
                                <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {appointment.location}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="event-feedback-outcome">Como foi o evento?</Label>
                        <Textarea
                            id="event-feedback-outcome"
                            placeholder="Descreva o resultado da reuniao, pontos importantes ou proximos passos..."
                            value={outcome}
                            onChange={(event) => setOutcome(event.target.value)}
                            className="min-h-[120px]"
                        />
                    </div>

                    {linkedNextAction && onCompleteLinkedNextAction ? (
                        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    id="complete-linked-next-action"
                                    checked={completeLinkedAction}
                                    onCheckedChange={(checked) => setCompleteLinkedAction(checked === true)}
                                />
                                <div className="space-y-1">
                                    <Label htmlFor="complete-linked-next-action" className="text-sm font-medium">
                                        Concluir proxima acao vinculada
                                    </Label>
                                    <p className="text-xs text-muted-foreground">{linkedNextAction.title}</p>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {onCreateNextAction ? (
                        <div className="space-y-3 rounded-lg border border-border bg-background/70 p-4">
                            <div>
                                <p className="text-sm font-medium text-foreground">Definir proxima acao seguinte</p>
                                <p className="text-xs text-muted-foreground">
                                    Opcional. Se preencher, a nova acao ja sai criada ao salvar o feedback.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="event-feedback-next-action-title">Proxima acao</Label>
                                <Input
                                    id="event-feedback-next-action-title"
                                    value={nextActionTitle}
                                    onChange={(event) => setNextActionTitle(event.target.value)}
                                    placeholder="Ex.: Retornar com proposta revisada"
                                    disabled={Boolean(linkedNextAction && !completeLinkedAction)}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="event-feedback-next-action-due">Prazo</Label>
                                <Input
                                    id="event-feedback-next-action-due"
                                    type="datetime-local"
                                    value={nextActionDueAt}
                                    onChange={(event) => setNextActionDueAt(event.target.value)}
                                    disabled={Boolean(linkedNextAction && !completeLinkedAction)}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={!outcome.trim() || isSaving}>
                        Salvar e Arquivar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
