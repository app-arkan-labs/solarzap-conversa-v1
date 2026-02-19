import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

type Step = 'method' | 'qr' | 'confirm';
type CallMethod = 'tel' | 'whatsapp';

function normalizeBrazilPhoneDigits(raw: string | undefined | null) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function CallConfirmModal({ isOpen, onClose, onConfirm, contactName, contactPhone }: CallConfirmModalProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<CallMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const phoneDigits = useMemo(() => normalizeBrazilPhoneDigits(contactPhone), [contactPhone]);
  const phoneDisplay = useMemo(() => formatPhoneForDisplay(phoneDigits), [phoneDigits]);

  const telUrl = useMemo(() => (phoneDigits ? `tel:+${phoneDigits}` : ''), [phoneDigits]);
  const whatsappUrl = useMemo(() => (phoneDigits ? `https://wa.me/${phoneDigits}` : ''), [phoneDigits]);

  const directUrl = method === 'tel' ? telUrl : method === 'whatsapp' ? whatsappUrl : '';
  const methodLabel = method === 'tel' ? 'Telefone' : method === 'whatsapp' ? 'WhatsApp' : '';

  const resetState = () => {
    setStep('method');
    setMethod(null);
    setIsSubmitting(false);
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
      toast({ title: 'Copiado!', description: 'Copiado para a area de transferencia.' });
    } catch {
      toast({
        title: 'Nao foi possivel copiar',
        description: 'Seu navegador bloqueou o acesso a area de transferencia.',
        variant: 'destructive',
      });
    }
  };

  const handleChooseMethod = (nextMethod: CallMethod) => {
    if (!phoneDigits) {
      toast({
        title: 'Telefone indisponivel',
        description: 'Este lead nao possui um numero de telefone valido para ligacao.',
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
    setIsSubmitting(true);
    Promise.resolve(onConfirm(true)).finally(() => {
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
              <p className="text-sm text-muted-foreground">Escolha como voce quer iniciar a ligacao no celular.</p>

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
                    Numero: <span className="text-foreground font-medium">{phoneDisplay || '-'}</span>
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
                  Aponte a camera do celular para o QR Code.
                  {method === 'whatsapp'
                    ? ' O WhatsApp abrira na conversa do cliente.'
                    : ' O discador abrira com o numero preenchido.'}
                </p>
              </div>

              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl border shadow-sm">
                  <QRCode value={directUrl || ''} size={212} />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Numero</div>
                    <div className="text-sm font-medium truncate">{phoneDisplay || '-'}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => copyToClipboard(phoneDigits ? `+${phoneDigits}` : '')}
                    disabled={!phoneDigits}
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
                Ja abri no celular
                <ArrowRight className="w-4 h-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-primary" />
                Confirmar Ligacao
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <p className="text-foreground">
                A ligacao para <span className="font-semibold">{contactName}</span> foi realizada com sucesso?
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={handleNotCompleted} className="flex-1 gap-2">
                <X className="w-4 h-4" />
                Nao Realizei
              </Button>
              <Button onClick={handleCompleted} disabled={isSubmitting} className="flex-1 gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Sim, Realizei
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
