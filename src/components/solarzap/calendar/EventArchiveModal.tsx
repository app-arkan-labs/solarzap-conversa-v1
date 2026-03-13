import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Appointment, Contact } from '@/types/solarzap';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { Archive, CalendarIcon } from 'lucide-react';
import { CalendarFilters, CalendarFilterState } from './CalendarFilters';
import { Badge } from '@/components/ui/badge';

interface EventArchiveModalProps {
    isOpen: boolean;
    onClose: () => void;
    appointments: Appointment[];
    contacts: Contact[];
}

export function EventArchiveModal({ isOpen, onClose, appointments, contacts }: EventArchiveModalProps) {
    const [filters, setFilters] = useState<CalendarFilterState>({});
    const contactById = new Map(contacts.map((contact) => [String(contact.id), contact]));

    // Filter appointments: Check for 'completed' status AND apply local filters
    const archivedAppointments = appointments.filter(appt => {
        // 1. Must be completed
        if (appt.status !== 'completed') return false;

        // 2. Filter by Type
        if (filters.type && appt.type !== filters.type) return false;

        // 3. Filter by Client (accessing joined lead data if available or manual filtering)
        // Note: For now assuming client filtering happens on available data.
        if (filters.clientId && String(appt.lead_id) !== filters.clientId) return false;

        // 3.1. Filter by Lead Source
        if (filters.channel) {
            const contact = contactById.get(String(appt.lead_id));
            if (!contact || contact.channel !== filters.channel) return false;
        }

        // 4. Date Range
        const apptDate = parseISO(appt.start_at);
        if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (apptDate < start) return false;
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (apptDate > end) return false;
        }

        return true;
    }).sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()); // Descending order

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[800px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Archive className="w-5 h-5" />
                        Arquivo de Eventos
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2">
                    <CalendarFilters
                        filters={filters}
                        onChange={setFilters}
                        contacts={contacts}
                    />
                </div>

                <div className="flex-1 overflow-hidden border rounded-md bg-muted/20">
                    <ScrollArea className="h-[500px]">
                        <div className="p-4 space-y-3">
                            {archivedAppointments.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    Nenhum evento arquivado encontrado com esses filtros.
                                </div>
                            ) : (
                                archivedAppointments.map(appt => (
                                    <div key={appt.id} className="bg-background border p-4 rounded-lg shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-semibold">{appt.title}</h4>
                                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className="capitalize">
                                                        {appt.type}
                                                    </Badge>
                                                    <span className="flex items-center gap-1">
                                                        <CalendarIcon className="w-3 h-3" />
                                                        {format(parseISO(appt.start_at), "dd/MM/yyyy HH:mm")}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Feedback Section */}
                                        <div className="bg-muted p-3 rounded text-sm mt-3">
                                            <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground block mb-1">
                                                Resultado / Feedback
                                            </span>
                                            <p className="whitespace-pre-wrap text-foreground/90">
                                                {appt.outcome || "Nenhum feedback registrado."}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}
