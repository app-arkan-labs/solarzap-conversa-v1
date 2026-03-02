import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { PIPELINE_STAGES, PipelineStage, ClientType, Contact } from '@/types/solarzap';
import { Check, ChevronDown, ExternalLink, FileText, Palette, ImagePlus, X } from 'lucide-react';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useProposalLogo } from '@/hooks/useProposalLogo';
import { PROPOSAL_THEMES, THEME_IDS, getThemeById, isValidThemeHex, normalizeThemeHex, toCustomThemeValue } from '@/utils/proposalColorThemes';
import { generateProposalPDF, generateSellerScriptPDF } from '@/utils/generateProposalPDF';
import { resolveProposalLinks } from '@/utils/proposalLinks';
import { listMembers, type MemberDto } from '@/lib/orgAdminClient';
import { getMemberDisplayName } from '@/lib/memberDisplayName';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from './PageHeader';

interface ProposalRow {
  proposal_version_id: string;
  proposta_id: number;
  lead_id: number;
  lead_name: string;
  lead_phone: string;
  lead_stage: string;
  owner_user_id: string | null;
  version_no: number;
  created_at: string;
  status: string;
  segment: string;
  source: string;
  valor_projeto: number | null;
  consumo_kwh?: number | null;
  potencia_kw?: number | null;
  paineis_qtd?: number | null;
  economia_mensal?: number | null;
  payback_anos?: number | null;
  tipo_cliente?: string | null;
  premium_payload?: Record<string, unknown> | null;
  pdf_url: string | null;
  share_url: string | null;
}

interface LeadFilterOption {
  id: number;
  name: string;
  phone: string;
}

const STATUS_OPTIONS = ['draft', 'ready', 'sent', 'accepted', 'rejected', 'archived'];

const STATUS_TRANSLATIONS: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronta',
  sent: 'Enviada',
  accepted: 'Aceita',
  rejected: 'Recusada',
  archived: 'Arquivada'
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  ready: 'bg-blue-100 text-blue-700 border-blue-200',
  sent: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  accepted: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  archived: 'bg-gray-100 text-gray-700 border-gray-200'
};

export function ProposalsView() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { themeId, secondaryColorHex, updateTheme, updateSecondaryColor } = useProposalTheme();
  const { logoUrl, uploadLogo, removeLogo, loading: logoLoading } = useProposalLogo();
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [owners, setOwners] = useState<MemberDto[]>([]);
  const [leadOptions, setLeadOptions] = useState<LeadFilterOption[]>([]);
  const [leadFilterOpen, setLeadFilterOpen] = useState(false);

  const [selectedLeadId, setSelectedLeadId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [stage, setStage] = useState<string>('all');
  const [owner, setOwner] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRow, setSelectedRow] = useState<ProposalRow | null>(null);
  const [customThemeHex, setCustomThemeHex] = useState('');
  const [customSecondaryHex, setCustomSecondaryHex] = useState('');

  const secondaryPalette = [
    '#1D4ED8',
    '#EA580C',
    '#DC2626',
    '#0D9488',
    '#7C3AED',
    '#CA8A04',
    '#334155',
    '#16A34A',
  ];

  const fetchProposalsFallback = useCallback(async () => {
    if (!orgId) return [] as ProposalRow[];

    let query = supabase
      .from('proposal_versions')
      .select('id, proposta_id, lead_id, version_no, created_at, status, segment, source, premium_payload')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (status !== 'all') query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

    const { data: versions, error } = await query;
    if (error) throw error;

    const leadIds = Array.from(new Set((versions || []).map((row: any) => Number(row.lead_id)).filter((id: number) => Number.isFinite(id))));
    const propostaIds = Array.from(new Set((versions || []).map((row: any) => Number(row.proposta_id)).filter((id: number) => Number.isFinite(id))));

    const [leadsResult, propostasResult] = await Promise.all([
      leadIds.length > 0
        ? supabase
          .from('leads')
          .select('id, nome, telefone, phone_e164, status_pipeline, assigned_to_user_id, user_id, tipo_cliente')
          .eq('org_id', orgId)
          .in('id', leadIds)
        : Promise.resolve({ data: [], error: null } as any),
      propostaIds.length > 0
        ? supabase
          .from('propostas')
          .select('id, valor_projeto, consumo_kwh, potencia_kw, paineis_qtd, economia_mensal, payback_anos')
          .in('id', propostaIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (leadsResult.error) throw leadsResult.error;
    if (propostasResult.error) throw propostasResult.error;

    const leadMap = new Map<number, any>((leadsResult.data || []).map((lead: any) => [Number(lead.id), lead]));
    const propostaMap = new Map<number, any>((propostasResult.data || []).map((item: any) => [Number(item.id), item]));

    let mapped: ProposalRow[] = (versions || []).map((row: any) => {
      const lead = leadMap.get(Number(row.lead_id));
      const proposta = propostaMap.get(Number(row.proposta_id));
      return {
        proposal_version_id: String(row.id),
        proposta_id: Number(row.proposta_id || 0),
        lead_id: Number(row.lead_id || 0),
        lead_name: String(lead?.nome || `Lead ${row.lead_id || ''}`),
        lead_phone: String(lead?.telefone || lead?.phone_e164 || ''),
        lead_stage: String(lead?.status_pipeline || ''),
        owner_user_id: String(lead?.assigned_to_user_id || lead?.user_id || '') || null,
        version_no: Number(row.version_no || 1),
        created_at: String(row.created_at),
        status: String(row.status || ''),
        segment: String(row.segment || ''),
        source: String(row.source || ''),
        valor_projeto: proposta?.valor_projeto ?? null,
        consumo_kwh: proposta?.consumo_kwh ?? null,
        potencia_kw: proposta?.potencia_kw ?? null,
        paineis_qtd: proposta?.paineis_qtd ?? null,
        economia_mensal: proposta?.economia_mensal ?? null,
        payback_anos: proposta?.payback_anos ?? null,
        tipo_cliente: lead?.tipo_cliente ?? null,
        premium_payload: row.premium_payload || null,
        ...(() => {
          const links = resolveProposalLinks({
            premiumPayload: row.premium_payload || null,
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          });
          return {
            pdf_url: links.pdfUrl,
            share_url: links.shareUrl,
          };
        })(),
      };
    });

    if (stage !== 'all') {
      mapped = mapped.filter((row) => row.lead_stage === stage);
    }
    if (owner !== 'all') {
      mapped = mapped.filter((row) => row.owner_user_id === owner);
    }
    if (selectedLeadId !== 'all') {
      const parsedLeadId = Number(selectedLeadId);
      mapped = mapped.filter((row) => Number(row.lead_id) === parsedLeadId);
    }

    return mapped.slice(0, PAGE_SIZE);
  }, [orgId, status, dateFrom, dateTo, stage, owner, selectedLeadId]);

  const fetchOwners = useCallback(async () => {
    if (!orgId) return;

    try {
      const response = await listMembers();
      setOwners(response.members || []);
    } catch (error) {
      console.error('Failed to fetch owners:', error);
    }
  }, [orgId]);

  const fetchLeads = useCallback(async () => {
    if (!orgId) return;

    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, telefone, phone_e164')
        .eq('org_id', orgId)
        .order('nome', { ascending: true })
        .limit(1000);

      if (error) throw error;

      setLeadOptions(
        (data || []).map((lead: any) => ({
          id: Number(lead.id),
          name: String(lead.nome || `Lead ${lead.id}`),
          phone: String(lead.telefone || lead.phone_e164 || ''),
        }))
      );
    } catch (error) {
      console.error('Failed to fetch leads for proposals filter:', error);
    }
  }, [orgId]);

  const fetchProposals = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_proposals', {
        p_org_id: orgId,
        p_search: null,
        p_status: status === 'all' ? null : status,
        p_stage: stage === 'all' ? null : stage,
        p_owner: owner === 'all' ? null : owner,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_limit: PAGE_SIZE + 1,
        p_offset: page * PAGE_SIZE,
      });

      if (error) {
        const fallbackRows = await fetchProposalsFallback();
        setRows(fallbackRows.slice(0, PAGE_SIZE));
        setTotalRows(fallbackRows.length);
        return;
      }

      let mappedRows = (data || []) as ProposalRow[];

      const leadIds = Array.from(new Set(mappedRows.map((row) => Number(row.lead_id)).filter((id) => Number.isFinite(id))));
      const propostaIds = Array.from(new Set(mappedRows.map((row) => Number(row.proposta_id)).filter((id) => Number.isFinite(id))));
      const versionIds = Array.from(new Set(mappedRows.map((row) => String(row.proposal_version_id)).filter(Boolean)));

      const [leadsResult, propostasResult, versionsResult] = await Promise.all([
        leadIds.length > 0
          ? supabase
            .from('leads')
            .select('id, tipo_cliente')
            .eq('org_id', orgId)
            .in('id', leadIds)
          : Promise.resolve({ data: [], error: null } as any),
        propostaIds.length > 0
          ? supabase
            .from('propostas')
            .select('id, valor_projeto, consumo_kwh, potencia_kw, paineis_qtd, economia_mensal, payback_anos')
            .in('id', propostaIds)
          : Promise.resolve({ data: [], error: null } as any),
        versionIds.length > 0
          ? supabase
            .from('proposal_versions')
            .select('id, premium_payload')
            .in('id', versionIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const leadMap = new Map<number, any>((leadsResult.data || []).map((lead: any) => [Number(lead.id), lead]));
      const propostaMap = new Map<number, any>((propostasResult.data || []).map((item: any) => [Number(item.id), item]));
      const versionMap = new Map<string, any>((versionsResult.data || []).map((item: any) => [String(item.id), item]));

      mappedRows = mappedRows.map((row) => {
        const lead = leadMap.get(Number(row.lead_id));
        const proposta = propostaMap.get(Number(row.proposta_id));
        const version = versionMap.get(String(row.proposal_version_id));
        const payload = (version?.premium_payload || null) as Record<string, unknown> | null;

        return {
          ...row,
          valor_projeto: proposta?.valor_projeto ?? row.valor_projeto ?? null,
          consumo_kwh: proposta?.consumo_kwh ?? null,
          potencia_kw: proposta?.potencia_kw ?? null,
          paineis_qtd: proposta?.paineis_qtd ?? null,
          economia_mensal: proposta?.economia_mensal ?? null,
          payback_anos: proposta?.payback_anos ?? null,
          tipo_cliente: lead?.tipo_cliente ?? null,
          premium_payload: payload,
          ...(() => {
            const links = resolveProposalLinks({
              premiumPayload: payload,
              pdfUrl: row.pdf_url,
              shareUrl: row.share_url,
              supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            });
            return {
              pdf_url: links.pdfUrl,
              share_url: links.shareUrl,
            };
          })(),
        };
      });

      if (selectedLeadId !== 'all') {
        const parsedLeadId = Number(selectedLeadId);
        mappedRows = mappedRows.filter((row) => Number(row.lead_id) === parsedLeadId);
      }
      // Use PAGE_SIZE+1 to detect next page availability
      const hasMore = mappedRows.length > PAGE_SIZE;
      setTotalRows(hasMore ? (page + 2) * PAGE_SIZE : page * PAGE_SIZE + mappedRows.length);
      setRows(mappedRows.slice(0, PAGE_SIZE));
    } catch (error) {
      console.error('Failed to list proposals:', error);
      toast({
        title: 'Erro ao carregar propostas',
        description: 'Não foi possível listar as propostas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, status, stage, owner, dateFrom, dateTo, selectedLeadId, page, toast, fetchProposalsFallback]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [status, stage, owner, dateFrom, dateTo, selectedLeadId]);

  useEffect(() => {
    const persistedLeadId = localStorage.getItem('solarzap_proposals_filter_lead_id');
    if (!persistedLeadId) return;
    setSelectedLeadId(String(persistedLeadId));
    localStorage.removeItem('solarzap_proposals_filter_lead_id');
  }, []);

  const selectedLead = selectedLeadId === 'all'
    ? null
    : leadOptions.find((lead) => String(lead.id) === selectedLeadId) || null;

  const asPipelineStage = (value: string | null | undefined): PipelineStage => {
    const fallback: PipelineStage = 'aguardando_proposta';
    if (!value) return fallback;
    return (Object.prototype.hasOwnProperty.call(PIPELINE_STAGES, value) ? value : fallback) as PipelineStage;
  };

  const asClientType = (value: string | null | undefined): ClientType => {
    const allowed: ClientType[] = ['residencial', 'comercial', 'industrial', 'rural', 'usina'];
    return allowed.includes(value as ClientType) ? (value as ClientType) : 'residencial';
  };

  const buildContactFromRow = (row: ProposalRow): Contact => {
    const now = new Date();
    return {
      id: String(row.lead_id || ''),
      name: row.lead_name || `Lead ${row.lead_id}`,
      phone: row.lead_phone || '',
      channel: 'whatsapp',
      pipelineStage: asPipelineStage(row.lead_stage),
      clientType: asClientType(row.tipo_cliente),
      consumption: Number(row.consumo_kwh || 0),
      projectValue: Number(row.valor_projeto || 0),
      createdAt: now,
      lastContact: now,
    };
  };

  const canGenerateFromRow = (row: ProposalRow) => Number(row.valor_projeto || 0) > 0;

  const resolveBrandingForRow = (payload: Record<string, unknown>) => {
    const branding = (payload.branding && typeof payload.branding === 'object')
      ? (payload.branding as Record<string, unknown>)
      : null;
    const rowThemeId = typeof branding?.proposalThemeId === 'string'
      ? branding.proposalThemeId
      : (typeof payload.proposalThemeId === 'string' ? payload.proposalThemeId : themeId);
    const rowSecondary = normalizeThemeHex(
      (typeof branding?.secondaryColorHex === 'string'
        ? branding.secondaryColorHex
        : (typeof payload.secondaryColorHex === 'string' ? payload.secondaryColorHex : secondaryColorHex || '')) || '',
    );

    return {
      colorTheme: getThemeById(rowThemeId),
      secondaryColorHex: rowSecondary || undefined,
    };
  };

  const handleDownloadProposal = (row: ProposalRow) => {
    if (row.pdf_url) {
      window.open(row.pdf_url, '_blank');
      return;
    }

    if (!canGenerateFromRow(row)) {
      toast({ title: 'Proposta indisponível', description: 'Não há dados suficientes para baixar a proposta.', variant: 'destructive' });
      return;
    }

    const payload = (row.premium_payload as any) || {};
    const payloadRentabilityRate = Number(
      payload?.financialInputs?.rentabilityRatePerKwh
      ?? payload?.rentabilityRatePerKwh
      ?? payload?.technicalInputs?.rentabilityRatePerKwh
      ?? payload?.financialInputs?.tarifaKwh
      ?? payload?.technicalInputs?.tarifaKwh
      ?? payload?.tarifaKwh
      ?? 0,
    ) || undefined;
    const signature = (payload.signature || {}) as {
      companyName?: string;
      companyCnpj?: string;
      contractorName?: string;
      contractorCnpj?: string;
    };

    const branding = resolveBrandingForRow(payload);

    generateProposalPDF({
      contact: buildContactFromRow(row),
      consumoMensal: Number(row.consumo_kwh || 0),
      potenciaSistema: Number(row.potencia_kw || 0),
      quantidadePaineis: Number(row.paineis_qtd || 0),
      valorTotal: Number(row.valor_projeto || 0),
      economiaAnual: Number(row.economia_mensal || 0) * 12,
      paybackMeses: Number(row.payback_anos || 0) * 12,
      garantiaAnos: 25,
      tipo_cliente: row.tipo_cliente || 'residencial',
      tipoLigacao: payload?.technicalInputs?.tipoLigacao || undefined,
      rentabilityRatePerKwh: payloadRentabilityRate,
      tarifaKwh: payloadRentabilityRate,
      custoDisponibilidadeKwh: Number(
        payload?.technicalInputs?.custoDisponibilidadeKwh
        ?? payload?.financialInputs?.custoDisponibilidadeKwh
        ?? 0,
      ) || undefined,
      premiumContent: payload || undefined,
      taxaFinanciamento: Number(payload.taxaFinanciamento) || undefined,
      parcela36x: Number(payload.parcela36x) || undefined,
      parcela60x: Number(payload.parcela60x) || undefined,
      paymentConditions: Array.isArray(payload.paymentConditions) ? payload.paymentConditions : undefined,
      financingConditions: Array.isArray(payload.financingConditions) ? payload.financingConditions : undefined,
      financingPrimaryInstitutionId: payload.financingPrimaryInstitutionId || undefined,
      showFinancingSimulation: Boolean(payload.showFinancingSimulation),
      annualEnergyIncreasePct: Number(payload.annualEnergyIncreasePct) || undefined,
      moduleDegradationPct: Number(payload.moduleDegradationPct) || undefined,
      financialInputs: payload.financialInputs || undefined,
      financialOutputs: payload.financialOutputs || undefined,
      financialModelVersion: payload.financialModelVersion || undefined,
      propNum: `V${row.version_no || 1}`,
      colorTheme: branding.colorTheme,
      secondaryColorHex: branding.secondaryColorHex,
      signatureCompanyName: signature.companyName,
      signatureCompanyCnpj: signature.companyCnpj,
      signatureContractorName: signature.contractorName,
      signatureContractorCnpj: signature.contractorCnpj,
    });
  };

  const handleDownloadScript = (row: ProposalRow) => {
    if (!canGenerateFromRow(row)) {
      toast({ title: 'Roteiro indisponível', description: 'Não há dados suficientes para baixar o roteiro.', variant: 'destructive' });
      return;
    }

    const payload = (row.premium_payload as any) || {};
    const payloadRentabilityRate = Number(
      payload?.financialInputs?.rentabilityRatePerKwh
      ?? payload?.rentabilityRatePerKwh
      ?? payload?.technicalInputs?.rentabilityRatePerKwh
      ?? payload?.financialInputs?.tarifaKwh
      ?? payload?.technicalInputs?.tarifaKwh
      ?? payload?.tarifaKwh
      ?? 0,
    ) || undefined;
    const branding = resolveBrandingForRow(payload);

    generateSellerScriptPDF({
      contact: buildContactFromRow(row),
      consumoMensal: Number(row.consumo_kwh || 0),
      potenciaSistema: Number(row.potencia_kw || 0),
      quantidadePaineis: Number(row.paineis_qtd || 0),
      valorTotal: Number(row.valor_projeto || 0),
      economiaAnual: Number(row.economia_mensal || 0) * 12,
      paybackMeses: Number(row.payback_anos || 0) * 12,
      garantiaAnos: 25,
      tipo_cliente: row.tipo_cliente || 'residencial',
      tipoLigacao: payload?.technicalInputs?.tipoLigacao || undefined,
      rentabilityRatePerKwh: payloadRentabilityRate,
      tarifaKwh: payloadRentabilityRate,
      custoDisponibilidadeKwh: Number(
        payload?.technicalInputs?.custoDisponibilidadeKwh
        ?? payload?.financialInputs?.custoDisponibilidadeKwh
        ?? 0,
      ) || undefined,
      premiumContent: payload || undefined,
      taxaFinanciamento: Number(payload.taxaFinanciamento) || undefined,
      parcela36x: Number(payload.parcela36x) || undefined,
      parcela60x: Number(payload.parcela60x) || undefined,
      paymentConditions: Array.isArray(payload.paymentConditions) ? payload.paymentConditions : undefined,
      financingConditions: Array.isArray(payload.financingConditions) ? payload.financingConditions : undefined,
      financingPrimaryInstitutionId: payload.financingPrimaryInstitutionId || undefined,
      showFinancingSimulation: Boolean(payload.showFinancingSimulation),
      annualEnergyIncreasePct: Number(payload.annualEnergyIncreasePct) || undefined,
      moduleDegradationPct: Number(payload.moduleDegradationPct) || undefined,
      financialInputs: payload.financialInputs || undefined,
      financialOutputs: payload.financialOutputs || undefined,
      financialModelVersion: payload.financialModelVersion || undefined,
      propNum: `V${row.version_no || 1}`,
      colorTheme: branding.colorTheme,
      secondaryColorHex: branding.secondaryColorHex,
    });
  };

  const handleApplyCustomTheme = () => {
    if (!customThemeHex.trim()) return;
    if (!isValidThemeHex(customThemeHex)) {
      toast({ title: 'Cor inválida', description: 'Use um código HEX válido, ex: #1D4ED8', variant: 'destructive' });
      return;
    }
    const customValue = toCustomThemeValue(customThemeHex);
    if (!customValue) return;
    updateTheme(customValue);
    setCustomThemeHex(customValue.replace('custom:', '').toUpperCase());
  };

  const handleApplySecondaryColor = () => {
    const normalized = normalizeThemeHex(customSecondaryHex || '');
    if (!normalized) {
      toast({ title: 'Cor secundária inválida', description: 'Use um código HEX válido, ex: #1D4ED8', variant: 'destructive' });
      return;
    }
    updateSecondaryColor(normalized);
    setCustomSecondaryHex(normalized.toUpperCase());
  };

  const handleResetSecondaryColor = () => {
    updateSecondaryColor(null);
    setCustomSecondaryHex('');
  };

  useEffect(() => {
    if (themeId.startsWith('custom:')) {
      setCustomThemeHex(themeId.replace('custom:', '').toUpperCase());
    }
  }, [themeId]);

  useEffect(() => {
    setCustomSecondaryHex(secondaryColorHex ? secondaryColorHex.toUpperCase() : '');
  }, [secondaryColorHex]);

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30 relative">
      <PageHeader
        title="Propostas"
        subtitle="Histórico global de versões com filtros"
        icon={FileText}
        className="z-10"
        actionContent={
          <div className="flex items-center gap-4 flex-wrap mt-2 sm:mt-0">
            {/* Logo upload */}
            <div className="flex items-center gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(file);
                  e.target.value = '';
                }}
              />
              {logoUrl ? (
                <div className="flex items-center gap-1.5 group">
                  <button
                    type="button"
                    title="Alterar logo"
                    onClick={() => logoInputRef.current?.click()}
                    className="relative w-9 h-9 rounded-lg border border-border overflow-hidden bg-white hover:ring-2 hover:ring-primary/40 transition-all"
                  >
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
                  </button>
                  <button
                    type="button"
                    title="Remover logo"
                    onClick={removeLogo}
                    disabled={logoLoading}
                    className="w-5 h-5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1 -right-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  title="Enviar logo da empresa para as propostas"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoLoading}
                  className="w-9 h-9 rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 hover:bg-white/50 transition-all glass"
                >
                  {logoLoading ? (
                    <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              )}
              <span className="text-xs text-muted-foreground hidden sm:inline">Logo</span>
            </div>

            <div className="hidden sm:block w-px h-6 bg-border" />

            {/* Theme colors */}
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mr-1">Tema:</span>
              <div className="flex gap-1.5 glass px-2 py-1 rounded-full border border-border/50">
                {THEME_IDS.map((id) => {
                  const t = PROPOSAL_THEMES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      title={t.label}
                      onClick={() => updateTheme(id)}
                      className={cn(
                        'w-6 h-6 rounded-full border border-black/10 transition-all hover:scale-110 shadow-sm',
                        themeId === id ? 'ring-2 ring-primary ring-offset-1 scale-110' : ''
                      )}
                      style={{ backgroundColor: t.swatch }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={customThemeHex}
                  onChange={(e) => setCustomThemeHex(e.target.value)}
                  placeholder="#1D4ED8"
                  className="h-8 w-28 text-xs uppercase"
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleApplyCustomTheme}>
                  Aplicar
                </Button>
              </div>
            </div>

            {/* Secondary color */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Secundária:</span>
              <div className="flex gap-1.5 glass px-2 py-1 rounded-full border border-border/50">
                {secondaryPalette.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={`Secundária ${hex}`}
                    onClick={() => {
                      setCustomSecondaryHex(hex);
                      updateSecondaryColor(hex);
                    }}
                    className={cn(
                      'w-5 h-5 rounded-full border border-black/10 transition-all hover:scale-110 shadow-sm',
                      (secondaryColorHex || '').toUpperCase() === hex ? 'ring-2 ring-primary ring-offset-1 scale-110' : ''
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={customSecondaryHex}
                  onChange={(e) => setCustomSecondaryHex(e.target.value)}
                  placeholder="#1D4ED8"
                  className="h-8 w-28 text-xs uppercase"
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleApplySecondaryColor}>
                  Aplicar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={handleResetSecondaryColor}>
                  Auto
                </Button>
              </div>
            </div>
          </div>
        }
      />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Lead, período, vendedor, etapa e status</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Lead</Label>
                <Popover open={leadFilterOpen} onOpenChange={setLeadFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'w-full justify-between font-normal',
                        !selectedLead && 'text-muted-foreground'
                      )}
                    >
                      {selectedLead
                        ? `${selectedLead.name}${selectedLead.phone ? ` (${selectedLead.phone})` : ''}`
                        : 'Todos os leads'}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[360px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Selecionar lead..." />
                      <CommandList>
                        <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setSelectedLeadId('all');
                              setLeadFilterOpen(false);
                            }}
                          >
                            Todos os leads
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                selectedLeadId === 'all' ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          </CommandItem>
                          {leadOptions.map((lead) => (
                            <CommandItem
                              key={lead.id}
                              value={`${lead.name} ${lead.phone}`}
                              onSelect={() => {
                                setSelectedLeadId(String(lead.id));
                                setLeadFilterOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{lead.name}</span>
                                {lead.phone && <span className="text-xs text-muted-foreground">{lead.phone}</span>}
                              </div>
                              <Check
                                className={cn(
                                  'ml-auto h-4 w-4',
                                  selectedLeadId === String(lead.id) ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {STATUS_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>{STATUS_TRANSLATIONS[value] || value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Etapa do lead</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {Object.entries(PIPELINE_STAGES).map(([key, stageValue]) => (
                      <SelectItem key={key} value={key}>{stageValue.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Vendedor</Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {owners.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>{getMemberDisplayName(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Data inicial</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()} />
              </div>

              <div className="space-y-1">
                <Label>Data final</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()} />
              </div>

              <div className="md:col-span-3 flex justify-end">
                <Button onClick={fetchProposals} disabled={loading}>Aplicar filtros</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultados ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Lead</th>
                    <th className="py-2 pr-3">Versão</th>
                    <th className="py-2 pr-3">Criada em</th>
                    <th className="py-2 pr-3">Valor</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.proposal_version_id}
                      className="border-b cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedRow(row)}
                    >
                      <td className="py-2 pr-3">
                        <p className="font-medium">{row.lead_name || `Lead ${row.lead_id}`}</p>
                        <p className="text-xs text-muted-foreground">{row.lead_phone || '-'}</p>
                      </td>
                      <td className="py-2 pr-3">V{row.version_no}</td>
                      <td className="py-2 pr-3">{new Date(row.created_at).toLocaleString('pt-BR')}</td>
                      <td className="py-2 pr-3">
                        {typeof row.valor_projeto === 'number'
                          ? row.valor_projeto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '-'}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className={STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-700 border-slate-200'}>
                          {STATUS_TRANSLATIONS[row.status] || row.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!row.pdf_url && !canGenerateFromRow(row)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadProposal(row);
                            }}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Baixar Proposta
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canGenerateFromRow(row)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadScript(row);
                            }}
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Baixar Roteiro
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Pagination */}
      {(rows.length > 0 || page > 0) && (
        <div className="flex items-center justify-between px-4 py-2 border-t bg-background">
          <span className="text-sm text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              ← Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={totalRows <= (page + 1) * PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              Próxima →
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da Proposta</DialogTitle>
          </DialogHeader>

          {selectedRow && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Lead</p>
                <p className="font-medium">{selectedRow.lead_name || `Lead ${selectedRow.lead_id}`}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Versão</p>
                  <p className="font-medium">V{selectedRow.version_no}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={STATUS_COLORS[selectedRow.status] || 'bg-slate-100 text-slate-700 border-slate-200'}>
                    {STATUS_TRANSLATIONS[selectedRow.status] || selectedRow.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Criada em</p>
                  <p>{new Date(selectedRow.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valor</p>
                  <p>
                    {typeof selectedRow.valor_projeto === 'number'
                      ? selectedRow.valor_projeto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedRow.pdf_url && !canGenerateFromRow(selectedRow)}
                  onClick={() => handleDownloadProposal(selectedRow)}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Baixar Proposta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canGenerateFromRow(selectedRow)}
                  onClick={() => handleDownloadScript(selectedRow)}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Baixar Roteiro
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
