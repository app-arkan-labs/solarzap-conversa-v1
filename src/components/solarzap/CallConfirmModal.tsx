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
import { Phone, X, Check, Send, Loader2, ArrowRight } from 'lucide-react';

interface CallConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (completed: boolean, feedback?: string) => void;
  contactName: string;
}

type Step = 'confirm' | 'feedback';

export function CallConfirmModal({ isOpen, onClose, onConfirm, contactName }: CallConfirmModalProps) {
  const [step, setStep] = useState<Step>('confirm');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNotCompleted = () => {
    onConfirm(false);
    resetState();
  };

  const handleCompleted = () => {
    setStep('feedback');
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    await onConfirm(true, feedback);
    setIsSubmitting(false);
    resetState();
  };

  const resetState = () => {
    setStep('confirm');
    setFeedback('');
    setIsSubmitting(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      resetState();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-blue-500" />
                Confirmar Ligação
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <p className="text-foreground">
                A ligação para <span className="font-semibold">{contactName}</span> foi realizada com sucesso?
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={handleNotCompleted}
                className="flex-1 gap-2"
              >
                <X className="w-4 h-4" />
                Não Realizei
              </Button>
              <Button
                onClick={handleCompleted}
                className="flex-1 gap-2 bg-green-500 hover:bg-green-600"
              >
                <Check className="w-4 h-4" />
                Sim, Realizei
                <ArrowRight className="w-4 h-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-green-500" />
                Como foi a ligação?
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <p className="text-muted-foreground text-sm">
                Descreva como foi a ligação com <span className="font-semibold text-foreground">{contactName}</span>
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="feedback">Descrição da ligação</Label>
                <Textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Ex: Cliente demonstrou interesse no projeto de 5kWp. Solicitou proposta com financiamento..."
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setStep('confirm')} 
                disabled={isSubmitting}
              >
                Voltar
              </Button>
              <Button 
                onClick={handleSubmitFeedback} 
                disabled={!feedback.trim() || isSubmitting}
                className="gap-2 bg-green-500 hover:bg-green-600"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
