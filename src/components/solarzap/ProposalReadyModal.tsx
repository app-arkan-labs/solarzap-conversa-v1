import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, MessageSquare, Lightbulb } from 'lucide-react';
import { CalendarEvent } from '@/types/solarzap';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';

interface ProposalReadyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToConversation: (contactId: string, prefilledMessage: string) => void;
  contactId: string;
  contactName: string;
  events: CalendarEvent[];
}

export function ProposalReadyModal({
  isOpen,
  onClose,
  onGoToConversation,
  contactId,
  contactName,
  events
}: ProposalReadyModalProps) {
  const { getMessage } = useAutomationSettings();

  // Generate the prefilled message using the configured template
  const prefilledMessage = useMemo(() => {
    return getMessage('proposalReadyMessage', { nome: contactName });
  }, [contactName, getMessage]);

  const handleGoToConversation = () => {
    console.log('ProposalReadyModal: handleGoToConversation clicked');
    if (contactId) {
      onGoToConversation(contactId, prefilledMessage);
      onClose();
    } else {
      console.error('ProposalReadyModal: contactId is missing!');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-green-600">
            <CheckCircle className="w-6 h-6" />
            Proposta Pronta!
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                A proposta de {contactName} está pronta!
              </p>
              <p className="text-sm text-muted-foreground">
                Agora você precisa agendar a visita técnica 🚀
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
            <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground mb-1">Próximo passo:</p>
              <p className="text-muted-foreground">
                Agende uma visita presencial para apresentar a proposta e fazer a análise técnica do local de instalação.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Fechar
          </Button>
          <Button
            onClick={handleGoToConversation}
            className="flex-1 gap-2 bg-teal-500 hover:bg-teal-600"
          >
            <MessageSquare className="w-4 h-4" />
            Ir para Conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
