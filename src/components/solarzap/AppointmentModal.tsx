import React, { useEffect, useMemo } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Appointment, AppointmentType, Contact } from '@/types/solarzap';
import { addMinutes, format, isValid } from 'date-fns';
import { CalendarIcon, Clock, MapPin, Search, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { ptBR } from 'date-fns/locale';

interface AppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Partial<Appointment>; // If editing
    initialType?: AppointmentType; // Default type for new appointments
    defaultDate?: Date | string; // If clicking on calendar
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

const TYPE_FALLBACK: AppointmentType = 'chamada';
const TYPE_OPTIONS = new Set<AppointmentType>(['chamada', 'visita', 'reuniao', 'instalacao', 'other']);

const toSafeLeadId = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const id = String(value).trim();
    if (!id || id === 'undefined' || id === 'null') return '';
    return id;
};

const normalizeAppointmentType = (value: unknown, fallback: AppointmentType = TYPE_FALLBACK): AppointmentType => {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'call') return 'chamada';
    if (raw === 'visit') return 'visita';
    if (raw === 'meeting') return 'reuniao';
    if (raw === 'installation') return 'instalacao';
    if (TYPE_OPTIONS.has(raw as AppointmentType)) return raw as AppointmentType;
    return fallback;
};

export function AppointmentModal({
    isOpen,
    onClose,
    initialData,
    initialType,
    defaultDate,
    preselectedLeadId,
    preselectedContact,
    onSuccess
}: AppointmentModalProps) {
    const { createAppointment, updateAppointment, deleteAppointment } = useAppointments();
    const { contacts } = useLeads();
    const { toast } = useToast();
    const contactsSignature = useMemo(
        () => contacts.map(contact => toSafeLeadId(contact.id)).join('|'),
        [contacts]
    );
    const leadOptions = useMemo(() => {
        const options = new Map<string, { id: string; label: string }>();

        if (preselectedContact) {
            const id = toSafeLeadId(preselectedContact.id);
            if (id) {
                options.set(id, {
                    id,
                    label: preselectedContact.name || preselectedContact.phone || id
                });
            }
        }

        for (const contact of contacts) {
            const id = toSafeLeadId(contact.id);
            if (!id || options.has(id)) continue;
            options.set(id, {
                id,
                label: contact.name || contact.phone || id
            });
        }

        return Array.from(options.values());
    }, [contacts, preselectedContact]);
    const leadOptionSignature = useMemo(
        () => leadOptions.map(option => option.id).join('|'),
        [leadOptions]
    );
    const leadOptionIds = useMemo(() => new Set(leadOptions.map(option => option.id)), [leadOptionSignature]);

    const { control, register, handleSubmit, reset, setValue, watch, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
        defaultValues: {
            type: initialType || 'chamada',
            duration: '30',
            location: '',
            notes: ''
        }
    });

    const selectedLeadId = watch('lead_id');

    // Reset/Init form
    useEffect(() => {
        if (!isOpen) return;

        try {
            const hasEditId = initialData?.id !== undefined && initialData?.id !== null;
            const hasEditLeadId = toSafeLeadId(initialData?.lead_id) !== '';
            const isEditMode = hasEditId && hasEditLeadId;

            if (isEditMode) {
                // Edit Mode (Existing appointment)
                const fallbackStart = new Date();
                const parsedStart = initialData.start_at ? new Date(initialData.start_at) : fallbackStart;
                const start = isValid(parsedStart) ? parsedStart : fallbackStart;
                const parsedEnd = initialData.end_at ? new Date(initialData.end_at) : addMinutes(start, 30);
                const end = isValid(parsedEnd) ? parsedEnd : addMinutes(start, 30);
                const durationDiff = Math.round((end.getTime() - start.getTime()) / 60000);
                const duration = Number.isFinite(durationDiff) && durationDiff > 0 ? String(durationDiff) : '30';

                // Check if lead exists in contacts (or is preselected) to avoid Select crash
                const requestedLeadId = toSafeLeadId(initialData.lead_id);
                const leadExists = leadOptionIds.has(requestedLeadId);
                const safeLeadId = leadExists ? requestedLeadId : '';
                const safeType = normalizeAppointmentType(initialData.type, normalizeAppointmentType(initialType));

                reset({
                    title: initialData.title || '',
                    lead_id: safeLeadId,
                    type: safeType,
                    date: start,
                    time: format(start, 'HH:mm'),
                    duration: duration,
                    location: initialData.location || '',
                    notes: initialData.notes || ''
                });

                if (!leadExists && initialData.lead_id) {
                    console.warn(`Lead ${initialData.lead_id} not found in contacts list for editing.`);
                }
            } else {
                // Create Mode (New appointment)
                const currentType = normalizeAppointmentType(initialData?.type, normalizeAppointmentType(initialType));
                let initialTitle = '';
                let safeLeadId = '';

                if (preselectedLeadId) {
                    const requestedLeadId = toSafeLeadId(preselectedLeadId);
                    const lead = preselectedContact || contacts.find(c => toSafeLeadId(c.id) === requestedLeadId);
                    if (lead) {
                        const typeLabel = currentType.charAt(0).toUpperCase() + currentType.slice(1);
                        initialTitle = `${typeLabel} - ${lead.name}`;
                        safeLeadId = toSafeLeadId(lead.id);
                        if (!leadOptionIds.has(safeLeadId)) {
                            safeLeadId = '';
                        }
                    }
                }

                const parsedDefaultDate = defaultDate
                    ? (defaultDate instanceof Date ? defaultDate : new Date(defaultDate))
                    : null;
                const safeDefaultDate = parsedDefaultDate && isValid(parsedDefaultDate) ? parsedDefaultDate : new Date();

                reset({
                    title: initialTitle,
                    lead_id: safeLeadId,
                    type: currentType,
                    date: safeDefaultDate,
                    time: format(new Date(), 'HH:mm'),
                    duration: '30',
                    location: '',
                    notes: ''
                });
            }
        } catch (error) {
            console.error('[appointment-modal][init-error]', error);
            toast({
                title: 'Erro ao abrir agendamento',
                description: 'Falha ao inicializar o formulario.',
                variant: 'destructive',
            });
            onClose();
        }
    }, [
        isOpen,
        initialData?.id,
        initialData?.lead_id,
        initialData?.start_at,
        initialData?.end_at,
        initialData?.title,
        initialData?.location,
        initialData?.notes,
        initialData?.type,
        initialType,
        preselectedLeadId,
        preselectedContact?.id,
        defaultDate,
        leadOptionSignature
    ]);

    // Update Title dynamically if new (not editing existing title manually) - ONLY if lead changes and TITLE IS EMPTY or DEFAULT
    useEffect(() => {
        if (isOpen && !initialData && selectedLeadId) {
            const lead = preselectedContact && String(preselectedContact.id) === String(selectedLeadId)
                ? preselectedContact
                : contacts.find(c => String(c.id) === String(selectedLeadId));

            if (lead) {
                const currentTitle = (getValues('title') || '').trim();
                if (!currentTitle) {
                    const currentType = normalizeAppointmentType(getValues('type'));
                    const typeLabel = currentType.charAt(0).toUpperCase() + currentType.slice(1);
                    setValue('title', `${typeLabel} - ${lead.name}`);
                }
            }
        }
    }, [
        isOpen,
        initialData?.id,
        selectedLeadId,
        preselectedContact?.id,
        contactsSignature,
        getValues,
        setValue
    ]);


    const onSubmit = async (data: FormData) => {
        try {
            const [hours, minutes] = data.time.split(':').map(Number);
            const leadId = Number(data.lead_id);
            if (
                !Number.isFinite(leadId) ||
                leadId <= 0 ||
                !isValid(data.date) ||
                !Number.isFinite(hours) ||
                !Number.isFinite(minutes) ||
                hours < 0 ||
                hours > 23 ||
                minutes < 0 ||
                minutes > 59
            ) {
                console.error('Invalid appointment date/time payload:', {
                    lead_id: data.lead_id,
                    date: data.date,
                    time: data.time
                });
                toast({
                    title: 'Data ou hora invalida',
                    description: 'Revise lead, data e hora do agendamento.',
                    variant: 'destructive',
                });
                return;
            }

            const startAt = new Date(data.date);
            startAt.setHours(hours, minutes, 0, 0);
            if (!isValid(startAt)) {
                console.error('Invalid appointment startAt:', {
                    date: data.date,
                    time: data.time
                });
                toast({
                    title: 'Data ou hora invalida',
                    description: 'Nao foi possivel montar a data/hora do agendamento.',
                    variant: 'destructive',
                });
                return;
            }

            const durationMinutes = parseInt(data.duration, 10);
            const endAt = addMinutes(startAt, Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30);

            if (initialData?.id) {
                await updateAppointment({
                    id: initialData.id,
                    data: {
                        title: data.title,
                        lead_id: leadId,
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
                    lead_id: leadId,
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
                                <Select
                                    onValueChange={field.onChange}
                                    value={(() => {
                                        const currentLeadValue = toSafeLeadId(field.value);
                                        return leadOptionIds.has(currentLeadValue) ? currentLeadValue : '';
                                    })()}
                                    disabled={!!initialData}
                                >
                                    <SelectTrigger className={cn(errors.lead_id && "border-destructive")}>
                                        <SelectValue placeholder="Selecione um cliente..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                        {leadOptions.map(option => (
                                            <SelectItem key={option.id} value={option.id}>
                                                {option.label}
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
                                    <Select
                                        onValueChange={(value) => field.onChange(normalizeAppointmentType(value))}
                                        value={normalizeAppointmentType(field.value)}
                                    >
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
                                                {field.value && isValid(field.value) ? format(field.value, "dd/MM") : <span>Data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={field.value && isValid(field.value) ? field.value : undefined}
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
