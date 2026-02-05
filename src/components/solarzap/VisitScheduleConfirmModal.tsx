import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarCheck, X, Check } from 'lucide-react';

interface VisitScheduleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (approved: boolean) => void;
  contactName: string;
}

export function VisitScheduleConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  contactName 
}: VisitScheduleConfirmModalProps) {
  
  const handleNotApproved = () => {
    onConfirm(false);
  };

  const handleApproved = () => {
    onConfirm(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarCheck className="w-5 h-5 text-blue-500" />
            Confirmação de Visita Técnica
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-foreground">
            <span className="font-semibold">{contactName}</span> respondeu sobre a proposta. O cliente aprovou o agendamento da visita técnica?
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Se sim, você poderá agendar a data e horário da visita.
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleNotApproved}
            className="flex-1 gap-2"
          >
            <X className="w-4 h-4" />
            Não Aprovou
          </Button>
          <Button
            onClick={handleApproved}
            className="flex-1 gap-2 bg-green-500 hover:bg-green-600"
          >
            <Check className="w-4 h-4" />
            Sim, Aprovou
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}