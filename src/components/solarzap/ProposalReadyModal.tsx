import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, MessageSquare, Lightbulb, Download, Loader2 } from 'lucide-react';
import { CalendarEvent, Contact } from '@/types/solarzap';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';
import { generateSellerScriptPDF } from '@/utils/generateProposalPDF';
import { PremiumProposalContent } from '@/utils/proposalPersonalization';
import { supabase } from '@/lib/supabase';

interface ProposalReadyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToConversation: (contactId: string, prefilledMessage: string) => void;
  contactId: string;
  contactName: string;
  events: CalendarEvent[];
  // Seller script data (optional — passed from last proposal generation)
  sellerScriptData?: {
    contact: Contact;
    consumoMensal: number;
    potenciaSistema: number;
    quantidadePaineis: number;
    valorTotal: number;
    economiaAnual: number;
    paybackMeses: number;
    garantiaAnos: number;
    tipo_cliente?: string;
    premiumContent?: PremiumProposalContent;
    taxaFinanciamento?: number;
    proposalVersionId?: string | null;
    propostaId?: number | null;
  } | null;
}

export function ProposalReadyModal({
  isOpen,
  onClose,
  onGoToConversation,
  contactId,
  contactName,
  events,
  sellerScriptData,
}: ProposalReadyModalProps) {
  const { getMessage } = useAutomationSettings();
  const [isDownloading, setIsDownloading] = useState(false);

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

  const handleDownloadSellerScript = async () => {
    if (!sellerScriptData) return;
    setIsDownloading(true);
    try {
      generateSellerScriptPDF({
        contact: sellerScriptData.contact,
        consumoMensal: sellerScriptData.consumoMensal,
        potenciaSistema: sellerScriptData.potenciaSistema,
        quantidadePaineis: sellerScriptData.quantidadePaineis,
        valorTotal: sellerScriptData.valorTotal,
        economiaAnual: sellerScriptData.economiaAnual,
        paybackMeses: sellerScriptData.paybackMeses,
        garantiaAnos: sellerScriptData.garantiaAnos,
        tipo_cliente: sellerScriptData.tipo_cliente,
        premiumContent: sellerScriptData.premiumContent,
        taxaFinanciamento: sellerScriptData.taxaFinanciamento,
      });

      // Track seller script download event (best-effort)
      if (sellerScriptData.proposalVersionId && sellerScriptData.propostaId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('proposal_delivery_events').insert({
              proposal_version_id: sellerScriptData.proposalVersionId,
              proposta_id: sellerScriptData.propostaId,
              lead_id: Number(contactId),
              user_id: user.id,
              channel: 'pdf_download',
              event_type: 'downloaded',
              metadata: { kind: 'seller_script' },
            });
          }
        } catch (err) {
          console.warn('Failed to track seller script download:', err);
        }
      }
    } catch (err) {
      console.error('Failed to generate seller script:', err);
    } finally {
      setIsDownloading(false);
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

          {sellerScriptData && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
              <Download className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Roteiro do Vendedor</p>
                <p className="text-xs text-muted-foreground">PDF interno com argumentos, objeções e dicas de fechamento</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                data-testid="download-seller-script"
                onClick={handleDownloadSellerScript}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Baixar
              </Button>
            </div>
          )}

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
