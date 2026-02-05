import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Clock, Zap } from 'lucide-react';

interface GenerateProposalPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
  contactName: string;
}

export function GenerateProposalPromptModal({ 
  isOpen, 
  onClose, 
  onGenerate, 
  contactName 
}: GenerateProposalPromptModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            Gerar Proposta?
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
            <Zap className="w-8 h-8 text-orange-500" />
            <div>
              <p className="font-medium text-foreground">
                {contactName} está aguardando proposta!
              </p>
              <p className="text-sm text-muted-foreground">
                Deseja gerar a proposta agora?
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 gap-2"
          >
            <Clock className="w-4 h-4" />
            Depois
          </Button>
          <Button
            onClick={onGenerate}
            className="flex-1 gap-2 bg-primary hover:bg-primary/90"
          >
            <FileText className="w-4 h-4" />
            Gerar Proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
