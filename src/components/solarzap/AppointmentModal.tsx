import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAppointments } from '@/hooks/useAppointments';
import { useLeads } from '@/hooks/domain/useLeads';
import { Appointment, AppointmentType, Contact } from '@/types/solarzap';
import { addMinutes, format } from 'date-fns';
import { CalendarIcon, Clock, MapPin, Search, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { ptBR } from 'date-fns/locale';

interface AppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Partial<Appointment>; // If editing
    defaultDate?: Date; // If clicking on calendar
    preselectedLeadId?: string; // string because Contact.id is string
    preselectedContact?: Contact; // Full contact object to avoid lookup issues
    onSuccess?: (appointment: Appointment) => void;
}

type FormData = {
    title: string;
    lead_id: string; // Form uses string for Select value
    type: AppointmentType;
    date: Date;
    time: string; // HH:mm
    duration: string; // minutes
    location: string;
    notes: string;
};

export function AppointmentModal({
    isOpen,
    onClose,
    initialData,
    defaultDate,
    preselectedLeadId,
    preselectedContact,
    onSuccess
}: AppointmentModalProps) {
    const { createAppointment, updateAppointment, deleteAppointment } = useAppointments();
    const { contacts } = useLeads();

    const { control, register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
        defaultValues: {
            type: 'chamada',
            duration: '30',
            location: '',
            notes: ''
        }
    });

    const selectedLeadId = watch('lead_id');

    // Reset/Init form
    useEffect(() => {
        if (isOpen) {
            if (initialData?.id) {
                // Edit Mode (Existing appointment)
                const start = new Date(initialData.start_at!);
                const end = new Date(initialData.end_at!);
                const duration = Math.round((end.getTime() - start.getTime()) / 60000).toString();

                reset({
                    title: initialData.title,
                    lead_id: String(initialData.lead_id),
                    type: initialData.type as AppointmentType,
                    date: start,
                    time: format(start, 'HH:mm'),
                    duration: duration,
                    location: initialData.location || '',
                    notes: initialData.notes || ''
                });
            } else {
                // Create Mode (New appointment)
                // Initialize default values
                const currentType = (initialData?.type as AppointmentType) || 'chamada';
                let initialTitle = '';

                // Auto-set title if lead is selected
                if (preselectedLeadId) {
                    const lead = preselectedContact || contacts.find(c => c.id === preselectedLeadId);
                    if (lead) {
                        const typeLabel = currentType.charAt(0).toUpperCase() + currentType.slice(1);
                        initialTitle = `${typeLabel} - ${lead.name}`;
                    }
                }

                reset({
                    title: initialTitle,
                    lead_id: preselectedLeadId || '',
                    type: currentType,
                    date: defaultDate || new Date(),
                    time: format(new Date(), 'HH:mm'),
                    duration: '30',
                    location: '',
                    notes: ''
                });
            }
        }
    }, [isOpen]); // Only run when modal opens/closes

    // Update Title dynamically if new (not editing existing title manually) - ONLY if lead changes and TITLE IS EMPTY or DEFAULT
    useEffect(() => {
        if (isOpen && !initialData && selectedLeadId) {
            const lead = preselectedContact && preselectedContact.id === selectedLeadId
                ? preselectedContact
                : contacts.find(c => c.id === selectedLeadId);

            const currentType = watch('type');
            if (lead) {
                const currentTitle = watch('title');
                // Only auto-update if strictly necessary to avoid overwriting user input
                if (!currentTitle || currentTitle === '') {
                    const typeLabel = currentType.charAt(0).toUpperCase() + currentType.slice(1);
                    setValue('title', `${typeLabel} - ${lead.name}`);
                }
            }
        }
    }, [selectedLeadId, watch('type')]);


    const onSubmit = async (data: FormData) => {
        try {
            const [hours, minutes] = data.time.split(':').map(Number);
            const startAt = new Date(data.date);
            startAt.setHours(hours, minutes, 0, 0);

            const endAt = addMinutes(startAt, parseInt(data.duration));

            if (initialData?.id) {
                await updateAppointment({
                    id: initialData.id,
                    data: {
                        title: data.title,
                        lead_id: Number(data.lead_id),
                        type: data.type,
                        start_at: startAt,
                        end_at: endAt,
                        location: data.location,
                        notes: data.notes
                    }
                });
            } else {
                const newAppt = await createAppointment({
                    title: data.title,
                    lead_id: Number(data.lead_id),
                    type: data.type,
                    start_at: startAt,
                    end_at: endAt,
                    location: data.location,
                    notes: data.notes
                });
                if (onSuccess && newAppt) {
                    onSuccess(newAppt);
                }
            }
            onClose();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">

                    <div className="space-y-2">
                        <Label>Cliente / Lead</Label>
                        <Controller
                            control={control}
                            name="lead_id"
                            rules={{ required: "Selecione um lead" }}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value} disabled={!!initialData}>
                                    <SelectTrigger className={cn(errors.lead_id && "border-destructive")}>
                                        <SelectValue placeholder="Selecione um cliente..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                        {/* Ensure preselected contact is in the list even if not in 'contacts' yet */}
                                        {preselectedContact && !contacts.some(c => c.id === preselectedContact.id) && (
                                            <SelectItem key={preselectedContact.id} value={preselectedContact.id}>
                                                {preselectedContact.name || preselectedContact.phone}
                                            </SelectItem>
                                        )}
                                        {contacts.map(contact => (
                                            <SelectItem key={contact.id} value={contact.id}>
                                                {contact.name || contact.phone}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        {errors.lead_id && <span className="text-xs text-destructive">{errors.lead_id.message}</span>}
                    </div>

                    <div className="space-y-2">
                        <Label>Título</Label>
                        <Input {...register('title', { required: true })} placeholder="Ex: Chamada de Alinhamento" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Controller
                                control={control}
                                name="type"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="chamada">Chamada / Ligação</SelectItem>
                                            <SelectItem value="visita">Visita Técnica</SelectItem>
                                            <SelectItem value="reuniao">Reunião / Meeting</SelectItem>
                                            <SelectItem value="instalacao">Instalação</SelectItem>
                                            <SelectItem value="other">Outro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Local</Label>
                            <div className="relative">
                                <MapPin className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input {...register('location')} className="pl-8" placeholder="Ex: Zoom, Endereço..." />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2 col-span-1">
                            <Label>Data</Label>
                            <Controller
                                control={control}
                                name="date"
                                render={({ field }) => (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full justify-start text-left font-normal",
                                                    !field.value && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "dd/MM") : <span>Data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                initialFocus
                                                locale={ptBR}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Hora</Label>
                            <Input type="time" {...register('time')} />
                        </div>
                        <div className="space-y-2">
                            <Label>Duração (min)</Label>
                            <Select onValueChange={(val) => setValue('duration', val)} defaultValue={watch('duration')}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="15">15 min</SelectItem>
                                    <SelectItem value="30">30 min</SelectItem>
                                    <SelectItem value="45">45 min</SelectItem>
                                    <SelectItem value="60">1 hora</SelectItem>
                                    <SelectItem value="90">1h 30m</SelectItem>
                                    <SelectItem value="120">2 horas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Observações</Label>
                        <Textarea {...register('notes')} placeholder="Detalhes adicionais..." />
                    </div>

                    <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
                        <div className="flex gap-2">
                            {initialData?.id && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    onClick={async () => {
                                        if (confirm('Tem certeza que deseja excluir?')) {
                                            await deleteAppointment(initialData.id!);
                                            onClose();
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                            {initialData?.lead_id && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('open-chat', { detail: { contactId: String(initialData.lead_id) } }));
                                        onClose();
                                    }}
                                >
                                    Abrir Chat
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Salvando...' : (initialData ? 'Salvar Alterações' : 'Agendar')}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
