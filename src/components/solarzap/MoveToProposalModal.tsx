import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, ArrowRight, X } from 'lucide-react';

interface MoveToProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (moveToProposal: boolean) => void;
  contactName: string;
}

export function MoveToProposalModal({ isOpen, onClose, onConfirm, contactName }: MoveToProposalModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-orange-500" />
            Próxima Etapa
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-foreground">
            Deseja mover <span className="font-semibold">{contactName}</span> para a etapa{' '}
            <span className="text-orange-600 font-semibold">"Aguardando Proposta"</span>?
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onConfirm(false)}
            className="flex-1 gap-2"
          >
            <X className="w-4 h-4" />
            Não Agora
          </Button>
          <Button
            onClick={() => onConfirm(true)}
            className="flex-1 gap-2 bg-orange-500 hover:bg-orange-600"
          >
            <ArrowRight className="w-4 h-4" />
            Sim, Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
