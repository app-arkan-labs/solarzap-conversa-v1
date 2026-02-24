import React, { useState, useCallback, useMemo } from 'react';
import { Contact, ClientType } from '@/types/solarzap';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, FileText, Zap, DollarSign, Sun, Battery, Shield, Download, User,
  Sparkles, Calendar, CreditCard,
} from 'lucide-react';
import { generateProposalPDF } from '@/utils/generateProposalPDF';
import { useToast } from '@/hooks/use-toast';
import { useLeads } from '@/hooks/domain/useLeads';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useProposalLogo } from '@/hooks/useProposalLogo';
import { supabase } from '@/lib/supabase';
import {
  buildPremiumProposalContent,
  PremiumProposalContent,
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
  // Sprint 3: Pass theme/logo for seller script
  colorTheme?: import('@/utils/proposalColorThemes').ProposalColorTheme;
  logoDataUrl?: string | null;
}

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

// ── PMT calc (mirrored from PDF) ──
function calcPMT(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper;
  const r = rate / 100;
  return (pv * r * Math.pow(1 + r, nper)) / (Math.pow(1 + r, nper) - 1);
}

const RATE_SHORTCUTS = [
  { label: 'Otimista 1,30%', rate: 1.3 },
  { label: 'Padrão 1,50%', rate: 1.5 },
  { label: 'Conservador 1,90%', rate: 1.9 },
];

export function ProposalModal({ isOpen, onClose, contact, onGenerate }: ProposalModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContent, setAiContent] = useState<PremiumProposalContent | null>(null);
  const [aiHeadline, setAiHeadline] = useState('');
  const { updateLead } = useLeads();
  const { toast } = useToast();
  const { theme } = useProposalTheme();
  const { logoDataUrl } = useProposalLogo();

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
    taxaFinanciamento: 1.5,
    parcela36x: 0,
    parcela60x: 0,
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

  // ── Auto-calculate parcels when rate changes ──
  const handleRateChange = (rate: number) => {
    setFormData(prev => {
      const pmt36 = rate > 0 && prev.valorTotal > 0 ? calcPMT(rate, 36, prev.valorTotal) : 0;
      const pmt60 = rate > 0 && prev.valorTotal > 0 ? calcPMT(rate, 60, prev.valorTotal) : 0;
      return { ...prev, taxaFinanciamento: rate, parcela36x: Math.round(pmt36 * 100) / 100, parcela60x: Math.round(pmt60 * 100) / 100 };
    });
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ── Fetch context (shared between AI and generation) ──
  const fetchContext = async (): Promise<Record<string, unknown> | null> => {
    if (!contact) return null;
    try {
      const { data, error } = await supabase.functions.invoke('proposal-context-engine', {
        body: { leadId: Number(contact.id), limitInteractions: 18, limitComments: 8, limitDocuments: 4 },
      });
      if (!error && data) return data;
    } catch { /* fallback */ }
    return null;
  };

  // ── Build heuristic content ──
  const buildHeuristic = (contextData: Record<string, unknown> | null): PremiumProposalContent => {
    const metrics: ProposalMetrics = {
      consumoMensal: formData.consumoMensal, potenciaSistema: formData.potenciaSistema,
      quantidadePaineis: formData.quantidadePaineis, valorTotal: formData.valorTotal,
      economiaAnual: formData.economiaAnual, paybackMeses: formData.paybackMeses, garantiaAnos: formData.garantiaAnos,
    };
    return buildPremiumProposalContent({
      contact: contact!, clientType: formData.tipo_cliente, observacoes: formData.observacoes, metrics,
      comments: (contextData?.comments as ProposalCommentContext[]) || [],
      companyProfile: (contextData?.companyProfile as CompanyProfileContext) || null,
      objections: (contextData?.objections as ObjectionContext[]) || [],
      testimonials: (contextData?.testimonials as TestimonialContext[]) || [],
    });
  };

  // ══════════ AI PERSONALIZATION ══════════
  const handleAiPersonalize = async () => {
    if (!contact) return;
    setAiLoading(true);
    try {
      // 1) Fetch context
      const contextData = await fetchContext();

      // 2) Call proposal-composer edge function
      const { data, error } = await supabase.functions.invoke('proposal-composer', {
        body: {
          leadId: Number(contact.id),
          contactName: contact.name,
          clientType: formData.tipo_cliente,
          city: contact.city || undefined,
          observacoes: formData.observacoes || undefined,
          metrics: {
            consumoMensal: formData.consumoMensal, potenciaSistema: formData.potenciaSistema,
            quantidadePaineis: formData.quantidadePaineis, valorTotal: formData.valorTotal,
            economiaAnual: formData.economiaAnual, paybackMeses: formData.paybackMeses,
            garantiaAnos: formData.garantiaAnos,
          },
          context: contextData ? {
            comments: contextData.comments || [],
            interactions: contextData.interactions || [],
            companyProfile: contextData.companyProfile || null,
            objections: contextData.objections || [],
            testimonials: contextData.testimonials || [],
            documents: [...(contextData.documents as any[] || []), ...(contextData.documentsRelevant as any[] || [])],
          } : undefined,
        },
      });

      if (error) throw error;
      if (!data?.variants?.length) throw new Error('No variants returned');

      // Use recommended variant
      const rec = data.recommendedVariant === 'b' ? 1 : 0;
      const variant = data.variants[rec] || data.variants[0];

      const content: PremiumProposalContent = {
        segment: variant.persona_focus || formData.tipo_cliente,
        segmentLabel: variant.label || formData.tipo_cliente,
        headline: variant.headline || '',
        executiveSummary: variant.executive_summary || '',
        personaFocus: variant.persona_focus || formData.tipo_cliente,
        valuePillars: variant.value_pillars || [],
        proofPoints: variant.proof_points || [],
        objectionHandlers: variant.objection_handlers || [],
        nextStepCta: variant.next_step_cta || '',
        assumptions: variant.assumptions || [],
        visitSteps: variant.visit_steps || [],
        bantQualification: variant.bant_qualification || [],
        termsConditions: variant.terms_conditions || [],
        nextStepsDetailed: variant.next_steps_detailed || [],
        persuasionScore: variant.persuasion_score || 0,
        scoreBreakdown: variant.score_breakdown || {},
        variantId: variant.id || 'ai-a',
        generatedBy: 'ai' as const,
        generatedAt: new Date().toISOString(),
      };

      setAiContent(content);
      setAiHeadline(content.headline);
      toast({ title: '✨ IA aplicada', description: 'Proposta personalizada com base no contexto do cliente.' });
    } catch (err) {
      console.error('AI personalização falhou, usando heurística:', err);
      // Fallback to heuristic
      const contextData = await fetchContext();
      const heuristic = buildHeuristic(contextData);
      setAiContent(heuristic);
      setAiHeadline(heuristic.headline);
      toast({ title: 'Personalização aplicada', description: 'Heurística local utilizada (IA indisponível).' });
    } finally {
      setAiLoading(false);
    }
  };

  // ══════════ SINGLE GENERATION FLOW ══════════
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    setIsLoading(true);

    try {
      // 1) Determine content: AI result or heuristic
      let contextData: Record<string, unknown> | null = null;
      let premiumContent: PremiumProposalContent;

      if (aiContent) {
        // Use AI content (user may have edited the headline)
        premiumContent = { ...aiContent, headline: aiHeadline || aiContent.headline };
        contextData = await fetchContext();
      } else {
        // Heuristic fallback
        contextData = await fetchContext();
        premiumContent = buildHeuristic(contextData);
      }

      // 2) Update lead
      await updateLead({ contactId: contact.id, data: { consumo_kwh: formData.consumoMensal, valor_estimado: formData.valorTotal, tipo_cliente: formData.tipo_cliente } })
        .catch(err => console.error('Failed to update lead:', err));

      // 3) Generate PDF blob with theme
      const propNum = `PROP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const pdfBlob = generateProposalPDF({
        contact, ...formData, premiumContent, colorTheme: theme,
        taxaFinanciamento: formData.taxaFinanciamento,
        parcela36x: formData.parcela36x,
        parcela60x: formData.parcela60x,
        validadeDias: formData.validadeDias, returnBlob: true,
        propNum,
        logoDataUrl,
      }) as Blob;

      // 4) Upload + payload
      const fileName = `Proposta_Energia_Solar_${contact.name.replace(/\s+/g, '_')}_${propNum}.pdf`;
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
        parcela36x: formData.parcela36x, parcela60x: formData.parcela60x,
        propNum,
      };

      // 5) Save to pipeline (Sprint 3: pass theme/logo for seller script)
      const saveResult = await onGenerate({ contactId: contact.id, ...formData, premiumPayload, contextEngine: contextData || undefined, colorTheme: theme, logoDataUrl });

      // 6) Download to user
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 7) Share link + tracking (best-effort, background)
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

  // ── Computed financing preview ──
  const financingPreview = useMemo(() => {
    const { parcela36x, parcela60x, taxaFinanciamento, valorTotal } = formData;
    if (parcela36x > 0 || parcela60x > 0) return { pmt36: parcela36x, pmt60: parcela60x };
    if (taxaFinanciamento > 0 && valorTotal > 0) {
      return { pmt36: calcPMT(taxaFinanciamento, 36, valorTotal), pmt60: calcPMT(taxaFinanciamento, 60, valorTotal) };
    }
    return { pmt36: 0, pmt60: 0 };
  }, [formData]);

  // ── Reset on open ──
  React.useEffect(() => {
    if (contact && isOpen) {
      setIsLoading(false);
      setAiLoading(false);
      setAiContent(null);
      setAiHeadline('');
      calculateSystem(contact.consumption || 500);
      setFormData(prev => ({
        ...prev, tipo_cliente: (contact.clientType || 'residencial') as ClientType,
        observacoes: '', garantiaAnos: 25, taxaFinanciamento: 1.5, parcela36x: 0, parcela60x: 0, validadeDias: 15,
      }));
      // Auto-calculate initial parcels
      setTimeout(() => {
        setFormData(prev => {
          if (prev.valorTotal > 0 && prev.taxaFinanciamento > 0) {
            return {
              ...prev,
              parcela36x: Math.round(calcPMT(prev.taxaFinanciamento, 36, prev.valorTotal) * 100) / 100,
              parcela60x: Math.round(calcPMT(prev.taxaFinanciamento, 60, prev.valorTotal) * 100) / 100,
            };
          }
          return prev;
        });
      }, 100);
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

        {(isLoading || aiLoading) && (
          <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-green-500 mb-4" />
            <p className="font-semibold text-lg">{aiLoading ? 'Personalizando com IA...' : 'Gerando proposta...'}</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs text-center">
              {aiLoading
                ? 'Analisando conversas, comentários e contexto do lead para personalizar a proposta'
                : 'Coletando contexto e gerando o PDF profissional'}
            </p>
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

          {/* ── DIMENSIONAMENTO ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4" /> Dimensionamento do Sistema
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
                <Label className="text-xs flex items-center gap-1"><Shield className="w-3 h-3" /> Garantia (anos)</Label>
                <Input type="number" value={formData.garantiaAnos} onChange={(e) => handleChange('garantiaAnos', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> Validade (dias)</Label>
                <Input type="number" value={formData.validadeDias} onChange={(e) => handleChange('validadeDias', parseInt(e.target.value) || 15)} />
              </div>
            </div>
          </div>

          {/* ── VALORES ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Valores
            </h3>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Valor Total</div>
                <div className="text-sm font-bold text-green-600 truncate">{formatCurrency(formData.valorTotal)}</div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-center min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Economia Anual</div>
                <div className="text-sm font-bold text-blue-600 truncate">{formatCurrency(formData.economiaAnual)}</div>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg text-center min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Payback</div>
                <div className="text-sm font-bold text-purple-600 truncate">{formData.paybackMeses} meses</div>
              </div>
            </div>
            {/* Editable value */}
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Total (R$)</Label>
              <Input type="number" value={formData.valorTotal} onChange={(e) => handleChange('valorTotal', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* ── FINANCIAMENTO ── */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30 overflow-hidden">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Financiamento
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Taxa de juros (% ao mês)</Label>
              <Input type="number" step="0.01" value={formData.taxaFinanciamento}
                onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {RATE_SHORTCUTS.map((s) => (
                <Button key={s.rate} type="button" variant="outline" size="sm"
                  className={`text-xs truncate ${formData.taxaFinanciamento === s.rate ? 'border-primary bg-primary/10' : ''}`}
                  onClick={() => handleRateChange(s.rate)}>
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Financiamento 36x (R$/mês)</Label>
                <Input type="number" step="0.01" value={formData.parcela36x}
                  onChange={(e) => handleChange('parcela36x', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Financiamento 60x (R$/mês)</Label>
                <Input type="number" step="0.01" value={formData.parcela60x}
                  onChange={(e) => handleChange('parcela60x', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            {/* Preview cards */}
            {(financingPreview.pmt36 > 0 || financingPreview.pmt60 > 0) && (
              <div className="grid grid-cols-2 gap-2">
                {financingPreview.pmt36 > 0 && (
                  <div className="p-2.5 border rounded-lg text-center bg-background min-w-0">
                    <div className="text-xs text-muted-foreground">36x (estimativa)</div>
                    <div className="text-base font-bold truncate">{formatCurrency(financingPreview.pmt36)}</div>
                    <div className="text-xs text-muted-foreground">/mes</div>
                  </div>
                )}
                {financingPreview.pmt60 > 0 && (
                  <div className="p-2.5 border rounded-lg text-center bg-background min-w-0">
                    <div className="text-xs text-muted-foreground">60x (estimativa)</div>
                    <div className="text-base font-bold truncate">{formatCurrency(financingPreview.pmt60)}</div>
                    <div className="text-xs text-muted-foreground">/mes</div>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Parcelas dependem da análise de crédito e taxas do banco. Se você não informar, o PDF mostra "financiamento sob consulta".
            </p>
          </div>

          {/* ── OBSERVAÇÕES ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Observações da Proposta (opcional)</Label>
            <Textarea value={formData.observacoes} onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Condições especiais, observações técnicas..." rows={2} />
          </div>

          {/* ── AI PERSONALIZATION ── */}
          <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Personalização com IA
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={handleAiPersonalize}
                disabled={aiLoading || isLoading} className="gap-1.5">
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiContent ? 'Atualizar' : 'Personalizar com IA'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A IA analisa as <strong>conversas</strong> e <strong>comentários internos</strong> do lead para criar texto personalizado. Números vêm do formulário acima. Opcional — sem IA, uma personalização básica é aplicada.
            </p>
            {aiContent && (
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Mensagem principal (editável)</Label>
                  <Input value={aiHeadline} onChange={(e) => setAiHeadline(e.target.value)}
                    className="text-sm" placeholder="Headline personalizada..." />
                </div>
                {aiContent.executiveSummary && (
                  <div className="p-2.5 bg-background border rounded text-xs text-muted-foreground leading-relaxed">
                    {aiContent.executiveSummary.slice(0, 200)}{aiContent.executiveSummary.length > 200 ? '...' : ''}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${aiContent.generatedBy === 'ai' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {aiContent.generatedBy === 'ai' ? '✨ IA' : '📐 Heurística'}
                  </span>
                  {aiContent.persuasionScore > 0 && (
                    <span>Score: {aiContent.persuasionScore}/100</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── FOOTER ── */}
          <DialogFooter className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white flex-1"
              data-testid="proposal-generate-pdf"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="w-4 h-4" /> Gerar e Baixar PDF</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
