import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Contact } from '@/types/solarzap';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProposalForm, type ProposalData } from '@/hooks/useProposalForm';
import { WizardProgressBar } from './WizardProgressBar';
import { StepClientType } from './steps/StepClientType';
import { StepEquipment } from './steps/StepEquipment';
import { StepLocation } from './steps/StepLocation';
import { StepPayment } from './steps/StepPayment';
import { StepPersonalization } from './steps/StepPersonalization';
import { StepReview } from './steps/StepReview';

interface ProposalWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onGenerate: (data: ProposalData) => Promise<{ proposalVersionId: string | null; proposal?: any } | void>;
}

export function ProposalWizardModal({ isOpen, onClose, contact, onGenerate }: ProposalWizardModalProps) {
  const form = useProposalForm({ isOpen, onClose, contact, onGenerate });
  const [currentStep, setCurrentStep] = useState(1);
  const [manualConfigOpen, setManualConfigOpen] = useState(false);
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    if (!wasOpenRef.current && isOpen) {
      setCurrentStep(1);
      setManualConfigOpen(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const canProceed = useMemo(() => {
    if (currentStep === 1) return Boolean(form.formData.tipo_cliente);
    if (currentStep === 2) {
      const hasCoordinates = Number.isFinite(Number(form.formData.latitude))
        && Number.isFinite(Number(form.formData.longitude));
      const hasStrictPvgis = form.formData.irradianceSource === 'pvgis';
      const hasManualLocation = Boolean(form.formData.cidade) && Boolean(form.formData.estado);
      return (
        Boolean(form.formData.estado)
        && Number(form.formData.consumoMensal) > 0
        && (Boolean(form.formData.cidade) || hasCoordinates)
        && ((hasCoordinates && hasStrictPvgis) || hasManualLocation)
      );
    }
    if (currentStep === 3) {
      return (
        Number(form.formData.moduloPotencia) > 0
      );
    }
    if (currentStep === 4) {
      if (Number(form.formData.valorTotal) <= 0) {
        return false;
      }
      if (!Array.isArray(form.formData.paymentConditions) || form.formData.paymentConditions.length === 0) {
        return false;
      }
      if (!form.hasFinancingSelected || !form.formData.showFinancingSimulation) return true;
      return form.formData.financingConditions.some((condition) => (
        String(condition.institutionName || '').trim().length > 0
        && Number(condition.interestRateMonthly) > 0
        && Array.isArray(condition.installments)
        && condition.installments.length > 0
      ));
    }
    return true;
  }, [currentStep, form.formData, form.hasFinancingSelected]);

  const goNext = async () => {
    if (currentStep >= 6) return;
    if (!canProceed) return;
    setCurrentStep((prev) => Math.min(6, prev + 1));
  };

  const goBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  if (!isOpen || !contact) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-primary" />
            Gerador de Proposta
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Fluxo guiado para gerar proposta personalizada para <strong>{contact.name}</strong>.
          </p>
        </DialogHeader>

        {(form.isLoading || form.aiLoading) && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-semibold">{form.aiLoading ? 'Personalizando com IA...' : 'Gerando proposta...'}</p>
          </div>
        )}

        <form onSubmit={form.handleGenerate} className="space-y-5">
          <WizardProgressBar currentStep={currentStep} />

          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xl">
              {contact.avatar || 'U'}
            </div>
            <div>
              <div className="font-semibold">{contact.name}</div>
              <div className="text-sm text-muted-foreground">
                {[contact.company, contact.phone].filter(Boolean).join(' | ')}
              </div>
            </div>
          </div>

          {currentStep === 1 && (
            <StepClientType form={form} onNext={() => setCurrentStep(2)} />
          )}
          {currentStep === 2 && <StepLocation form={form} />}
          {currentStep === 3 && <StepEquipment form={form} />}
          {currentStep === 4 && <StepPayment form={form} />}
          {currentStep === 5 && <StepPersonalization form={form} />}
          {currentStep === 6 && (
            <StepReview
              form={form}
              manualConfigOpen={manualConfigOpen}
              onToggleManualConfig={() => setManualConfigOpen((prev) => !prev)}
            />
          )}

          <DialogFooter className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={form.isLoading}>
              Cancelar
            </Button>

            {currentStep > 1 && (
              <Button type="button" variant="outline" onClick={goBack} disabled={form.isLoading}>
                Voltar
              </Button>
            )}

            {currentStep < 6 && (
              <Button type="button" onClick={goNext} disabled={form.isLoading || !canProceed} className="flex-1">
                Proximo
              </Button>
            )}

            {currentStep === 6 && (
              <Button
                type="submit"
                disabled={form.isLoading}
                className="brand-gradient-button flex-1 gap-2 text-white"
                data-testid="proposal-generate-pdf"
              >
                {form.isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                ) : (
                  <><Download className="h-4 w-4" /> Gerar e baixar PDF</>
                )}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
