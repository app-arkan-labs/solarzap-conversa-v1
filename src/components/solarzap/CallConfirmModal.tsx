import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Check, Copy, MessageCircle, Phone, QrCode, X, Loader2, Smartphone } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useToast } from '@/hooks/use-toast';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';

interface CallConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (completed: boolean, feedback?: string) => void;
  contactName: string;
  contactPhone?: string;
}

type Step = 'method' | 'qr' | 'confirm' | 'feedback';
type CallMethod = 'tel' | 'whatsapp';

function normalizeBrazilPhoneDigits(raw: string | undefined | null) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function stripBrazilCountryCode(digits: string) {
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
  return digits;
}

export function CallConfirmModal({ isOpen, onClose, onConfirm, contactName, contactPhone }: CallConfirmModalProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<CallMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const phoneDigits = useMemo(() => normalizeBrazilPhoneDigits(contactPhone), [contactPhone]);
  const dialPhoneDigits = useMemo(() => stripBrazilCountryCode(phoneDigits), [phoneDigits]);
  const phoneDisplay = useMemo(() => formatPhoneForDisplay(phoneDigits), [phoneDigits]);

  const telUrl = useMemo(() => (dialPhoneDigits ? `tel:${dialPhoneDigits}` : ''), [dialPhoneDigits]);
  const whatsappUrl = useMemo(() => (phoneDigits ? `https://wa.me/${phoneDigits}` : ''), [phoneDigits]);

  const directUrl = method === 'tel' ? telUrl : method === 'whatsapp' ? whatsappUrl : '';
  const numberToCopy = method === 'tel' ? dialPhoneDigits : phoneDigits ? `+${phoneDigits}` : '';
  const methodLabel = method === 'tel' ? 'Telefone' : method === 'whatsapp' ? 'WhatsApp' : '';

  const resetState = () => {
    setStep('method');
    setMethod(null);
    setIsSubmitting(false);
    setFeedback('');
  };

  useEffect(() => {
    if (!isOpen) resetState();
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      resetState();
    }
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copiado!', description: 'Copiado para a área de transferência.' });
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Seu navegador bloqueou o acesso à área de transferência.',
        variant: 'destructive',
      });
    }
  };

  const handleChooseMethod = (nextMethod: CallMethod) => {
    if (!phoneDigits) {
      toast({
        title: 'Telefone indisponível',
        description: 'Este lead não possui um número de telefone válido para ligação.',
        variant: 'destructive',
      });
      return;
    }

    setMethod(nextMethod);
    setStep('qr');
  };

  const handleProceedToConfirm = () => {
    setStep('confirm');
  };

  const handleNotCompleted = () => {
    onConfirm(false);
    resetState();
  };

  const handleCompleted = () => {
    setStep('feedback');
  };

  const handleSubmitCompleted = () => {
    const normalizedFeedback = feedback.trim();
    if (!normalizedFeedback || isSubmitting) return;

    setIsSubmitting(true);
    Promise.resolve(onConfirm(true, normalizedFeedback)).finally(() => {
      setIsSubmitting(false);
      resetState();
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === 'method' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-primary" />
                Ligar para {contactName}
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">Escolha como você quer iniciar a ligação no celular.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleChooseMethod('whatsapp')}
                  className="h-14 justify-start gap-3 bg-accent/60 text-accent-foreground hover:bg-accent/80 border-border"
                >
                  <MessageCircle className="w-5 h-5" />
                  <div className="text-left leading-tight">
                    <div className="text-sm font-semibold">WhatsApp</div>
                    <div className="text-xs text-muted-foreground">Abrir conversa</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => handleChooseMethod('tel')}
                  className="h-14 justify-start gap-3 bg-accent/60 text-accent-foreground hover:bg-accent/80 border-border"
                >
                  <Phone className="w-5 h-5" />
                  <div className="text-left leading-tight">
                    <div className="text-sm font-semibold">Telefone</div>
                    <div className="text-xs text-muted-foreground">Abrir discador</div>
                  </div>
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Smartphone className="w-4 h-4" />
                  <span>
                    Número: <span className="text-foreground font-medium">{phoneDisplay || '-'}</span>
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : step === 'qr' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <QrCode className="w-5 h-5 text-primary" />
                Escaneie para abrir no celular
              </DialogTitle>
            </DialogHeader>

            <div className="py-2 space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-foreground">
                  {methodLabel} para <span className="font-semibold">{contactName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Aponte a câmera do celular para o QR Code.
                  {method === 'whatsapp'
                    ? ' O WhatsApp abrirá na conversa do cliente.'
                    : ' O discador abrirá com o número preenchido.'}
                </p>
              </div>

              <div className="flex justify-center">
                <div className="rounded-xl border border-border bg-card/95 p-3 shadow-sm">
                  <QRCode value={directUrl || ''} size={212} />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Número</div>
                    <div className="text-sm font-medium truncate">{phoneDisplay || '-'}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => copyToClipboard(numberToCopy)}
                    disabled={!numberToCopy}
                  >
                    <Copy className="w-4 h-4" />
                    Copiar
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Link</div>
                    <div className="text-xs font-mono truncate">{directUrl || '-'}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => copyToClipboard(directUrl)}
                    disabled={!directUrl}
                  >
                    <Copy className="w-4 h-4" />
                    Copiar
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setStep('method')} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleProceedToConfirm} className="flex-1 gap-2">
                Já abri no celular
                <ArrowRight className="w-4 h-4" />
              </Button>
            </DialogFooter>
          </>
        ) : step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-primary" />
                Confirmar Ligação
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <p className="text-foreground">
                A ligação para <span className="font-semibold">{contactName}</span> foi realizada com sucesso?
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={handleNotCompleted} className="flex-1 gap-2">
                <X className="w-4 h-4" />
                Não Realizei
              </Button>
              <Button onClick={handleCompleted} disabled={isSubmitting} className="flex-1 gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Sim, Realizei
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-primary" />
                Como foi a ligação?
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Descreva rapidamente o resultado da ligação para registrar no histórico do lead.
              </p>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex: Cliente confirmou interesse, pediu proposta para esta semana."
                rows={4}
                className="resize-none"
              />
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setStep('confirm')} className="flex-1" disabled={isSubmitting}>
                Voltar
              </Button>
              <Button
                onClick={handleSubmitCompleted}
                disabled={isSubmitting || feedback.trim().length === 0}
                className="flex-1 gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar e continuar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
