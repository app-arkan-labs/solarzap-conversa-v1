import React, { useState, useCallback } from 'react';
import { Contact, ClientType } from '@/types/solarzap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2, FileText, Zap, DollarSign, Sun, Battery, Ruler, Download, User,
} from 'lucide-react';
import { generateProposalPDF } from '@/utils/generateProposalPDF';
import { useToast } from '@/hooks/use-toast';
import { useLeads } from '@/hooks/domain/useLeads';
import { supabase } from '@/lib/supabase';
import {
  buildPremiumProposalContent,
  ProposalMetrics,
  ProposalCommentContext,
  CompanyProfileContext,
  ObjectionContext,
  TestimonialContext,
} from '@/utils/proposalPersonalization';

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onGenerate: (data: ProposalData) => Promise<{ proposalVersionId: string | null; proposal?: any } | void>;
}

export interface ProposalData {
  contactId: string;
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
  tipo_cliente?: ClientType;
  taxaFinanciamento?: number;
  validadeDias?: number;
  premiumPayload?: Record<string, unknown>;
  contextEngine?: unknown;
}

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

export function ProposalModal({ isOpen, onClose, contact, onGenerate }: ProposalModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { updateLead } = useLeads();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    consumoMensal: contact?.consumption || 0,
    potenciaSistema: 0,
    quantidadePaineis: 0,
    valorTotal: contact?.projectValue || 0,
    economiaAnual: 0,
    paybackMeses: 0,
    garantiaAnos: 25,
    observacoes: '',
    tipo_cliente: (contact?.clientType || 'residencial') as ClientType,
    taxaFinanciamento: 1.49,
    validadeDias: 15,
  });

  // ── Storage Upload (best-effort) ──
  const uploadPdfToStorage = async (blob: Blob, leadId: string, fileName: string): Promise<{ bucket: string; path: string } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('proposal-storage-intent', {
        body: { leadId: Number(leadId), fileName, sizeBytes: blob.size, mimeType: 'application/pdf' },
      });
      if (error || !data?.uploadUrl) return null;
      const resp = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
      if (!resp.ok) return null;
      return { bucket: data.bucket, path: data.path };
    } catch { return null; }
  };

  // ── Share Link (best-effort) ──
  const generateShareLink = async (versionId: string): Promise<{ url: string; token: string; exp: number } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('proposal-share-link', { body: { proposalVersionId: versionId } });
      if (error || !data?.url) return null;
      return { url: data.url, token: data.token, exp: data.exp };
    } catch { return null; }
  };

  // ── Track Download (best-effort) ──
  const trackDownloadEvent = async (versionId: string, propostaId: number, leadId: number, kind: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('proposal_delivery_events').insert({
        proposal_version_id: versionId, proposta_id: propostaId, lead_id: leadId,
        user_id: user.id, channel: 'pdf_download', event_type: 'downloaded', metadata: { kind },
      });
    } catch { /* non-blocking */ }
  };

  // ── Auto-calculate system ──
  const calculateSystem = useCallback((consumo: number) => {
    const potencia = Math.ceil((consumo * 12) / (4.5 * 30 * 12));
    const paineis = Math.ceil(potencia * 1000 / 550);
    const valor = potencia * 4500;
    const economiaAnual = consumo * 0.85 * 12;
    const payback = Math.ceil((valor / economiaAnual) * 12);
    setFormData(prev => ({ ...prev, consumoMensal: consumo, potenciaSistema: potencia, quantidadePaineis: paineis, valorTotal: valor, economiaAnual, paybackMeses: payback }));
  }, []);

  const handleChange = (field: keyof typeof formData, value: number | string) => {
    if (field === 'consumoMensal') calculateSystem(value as number);
    else setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ══════════ SINGLE GENERATION FLOW ══════════
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    setIsLoading(true);

    try {
      // 1) Fetch context (best-effort)
      let contextData: Record<string, unknown> | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('proposal-context-engine', {
          body: { leadId: Number(contact.id), limitInteractions: 18, limitComments: 8, limitDocuments: 4 },
        });
        if (!error && data) contextData = data;
      } catch { /* heuristic fallback */ }

      // 2) Build premium content behind the scenes (user never sees this)
      const metrics: ProposalMetrics = {
        consumoMensal: formData.consumoMensal, potenciaSistema: formData.potenciaSistema,
        quantidadePaineis: formData.quantidadePaineis, valorTotal: formData.valorTotal,
        economiaAnual: formData.economiaAnual, paybackMeses: formData.paybackMeses, garantiaAnos: formData.garantiaAnos,
      };
      const premiumContent = buildPremiumProposalContent({
        contact, clientType: formData.tipo_cliente, observacoes: formData.observacoes, metrics,
        comments: (contextData?.comments as ProposalCommentContext[]) || [],
        companyProfile: (contextData?.companyProfile as CompanyProfileContext) || null,
        objections: (contextData?.objections as ObjectionContext[]) || [],
        testimonials: (contextData?.testimonials as TestimonialContext[]) || [],
      });

      // 3) Update lead
      await updateLead({ contactId: contact.id, data: { consumo_kwh: formData.consumoMensal, valor_estimado: formData.valorTotal, tipo_cliente: formData.tipo_cliente } })
        .catch(err => console.error('Failed to update lead:', err));

      // 4) Generate PDF blob
      const pdfBlob = generateProposalPDF({
        contact, ...formData, premiumContent,
        taxaFinanciamento: formData.taxaFinanciamento,
        validadeDias: formData.validadeDias, returnBlob: true,
      }) as Blob;

      // 5) Upload + payload
      const fileName = `Proposta_${contact.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const storageResult = await uploadPdfToStorage(pdfBlob, contact.id, fileName);
      const premiumPayload: Record<string, unknown> = {
        segment: premiumContent.segment, segmentLabel: premiumContent.segmentLabel,
        headline: premiumContent.headline, executiveSummary: premiumContent.executiveSummary,
        valuePillars: premiumContent.valuePillars, proofPoints: premiumContent.proofPoints,
        objectionHandlers: premiumContent.objectionHandlers, nextStepCta: premiumContent.nextStepCta,
        persuasionScore: premiumContent.persuasionScore, scoreBreakdown: premiumContent.scoreBreakdown,
        variantId: premiumContent.variantId, generatedBy: premiumContent.generatedBy, generatedAt: premiumContent.generatedAt,
        ...(storageResult ? { storage: storageResult } : {}),
        taxaFinanciamento: formData.taxaFinanciamento, validadeDias: formData.validadeDias,
      };

      // 6) Save to pipeline
      const saveResult = await onGenerate({ contactId: contact.id, ...formData, premiumPayload, contextEngine: contextData || undefined });

      // 7) Download to user
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 8) Share link + tracking (best-effort, background)
      const versionId = (saveResult as any)?.proposalVersionId;
      const propostaId = (saveResult as any)?.proposal?.id;
      if (versionId && storageResult) {
        const share = await generateShareLink(versionId);
        if (share) {
          try {
            const { data: ver } = await supabase.from('proposal_versions').select('premium_payload').eq('id', versionId).maybeSingle();
            await supabase.from('proposal_versions').update({ premium_payload: { ...((ver?.premium_payload as Record<string, unknown>) || {}), share } }).eq('id', versionId);
          } catch { /* non-blocking */ }
        }
      }
      if (versionId && propostaId) await trackDownloadEvent(versionId, propostaId, Number(contact.id), 'client_proposal');

      toast({ title: "Proposta gerada!", description: "PDF baixado. Baixe o Roteiro do Vendedor na próxima tela." });
      onClose();
    } catch (error) {
      console.error('Error generating proposal:', error);
      toast({ title: "Erro ao gerar proposta", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Reset on open ──
  React.useEffect(() => {
    if (contact && isOpen) {
      setIsLoading(false);
      calculateSystem(contact.consumption || 500);
      setFormData(prev => ({
        ...prev, tipo_cliente: (contact.clientType || 'residencial') as ClientType,
        observacoes: '', garantiaAnos: 25, taxaFinanciamento: 1.49, validadeDias: 15,
      }));
    }
  }, [contact, isOpen, calculateSystem]);

  if (!contact || !isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-green-500" />
            Gerar Proposta em PDF
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Preencha os dados e gere a proposta personalizada para <strong>{contact.name}</strong>.
          </p>
        </DialogHeader>

        {isLoading && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg">
            <Loader2 className="w-10 h-10 animate-spin text-green-500 mb-3" />
            <p className="font-semibold">Gerando proposta personalizada...</p>
            <p className="text-sm text-muted-foreground mt-1">Coletando contexto e criando PDF</p>
          </div>
        )}

        <form onSubmit={handleGenerate} className="space-y-5">
          {/* Client bar */}
          <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">{contact.avatar || '👤'}</div>
            <div>
              <div className="font-semibold">{contact.name}</div>
              <div className="text-sm text-muted-foreground">{[contact.company, contact.phone].filter(Boolean).join(' • ')}</div>
            </div>
          </div>

          {/* System sizing */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4" /> Dimensionamento
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><User className="w-3 h-3" /> Tipo de Cliente</Label>
                <Select value={formData.tipo_cliente} onValueChange={(v) => handleChange('tipo_cliente', v as ClientType)}>
                  <SelectTrigger data-testid="proposal-client-type-trigger"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Zap className="w-3 h-3" /> Consumo Mensal (kWh)</Label>
                <Input type="number" value={formData.consumoMensal} onChange={(e) => handleChange('consumoMensal', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Sun className="w-3 h-3" /> Potência (kWp)</Label>
                <Input type="number" step="0.1" value={formData.potenciaSistema} onChange={(e) => handleChange('potenciaSistema', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Battery className="w-3 h-3" /> Painéis</Label>
                <Input type="number" value={formData.quantidadePaineis} onChange={(e) => handleChange('quantidadePaineis', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Garantia (anos)</Label>
                <Input type="number" value={formData.garantiaAnos} onChange={(e) => handleChange('garantiaAnos', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Financial */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Valores
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Valor Total</div>
                <div className="text-base font-bold text-green-600">{formatCurrency(formData.valorTotal)}</div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Economia Anual</div>
                <div className="text-base font-bold text-blue-600">{formatCurrency(formData.economiaAnual)}</div>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Payback</div>
                <div className="text-base font-bold text-purple-600">{formData.paybackMeses} meses</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Total (R$)</Label>
                <Input type="number" value={formData.valorTotal} onChange={(e) => handleChange('valorTotal', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Taxa Financ. (% a.m.)</Label>
                <Input type="number" step="0.01" value={formData.taxaFinanciamento} onChange={(e) => handleChange('taxaFinanciamento', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Validade (dias)</Label>
                <Input type="number" value={formData.validadeDias} onChange={(e) => handleChange('validadeDias', parseInt(e.target.value) || 15)} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Observações (opcional)</Label>
            <Textarea value={formData.observacoes} onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Condições especiais, observações técnicas..." rows={2} />
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white flex-1"
              data-testid="proposal-generate-pdf"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="w-4 h-4" /> Gerar Proposta em PDF</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
