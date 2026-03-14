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
import {
  scopeProposalByIdsQuery,
  scopeProposalVersionByIdsQuery,
} from '@/lib/multiOrgLeadScoping';
import { useToast } from '@/hooks/use-toast';
import { PIPELINE_STAGES, PipelineStage, ClientType, Contact } from '@/types/solarzap';
import { Check, ChevronDown, ExternalLink, FileText, Trash2, Loader2 } from 'lucide-react';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useSellerPermissions } from '@/hooks/useSellerPermissions';
import { getThemeById, normalizeThemeHex } from '@/utils/proposalColorThemes';
import { generateProposalPDF, generateSellerScriptPDF } from '@/utils/generateProposalPDF';
import { prefetchCoverImage, prefetchCoverImages } from '@/hooks/useProposalCoverImage';
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from './PageHeader';
import { useMobileViewport } from '@/hooks/useMobileViewport';

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
  const isMobileViewport = useMobileViewport();
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { themeId, secondaryColorHex } = useProposalTheme();
  const { permissions } = useSellerPermissions();

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
  const [rowToDelete, setRowToDelete] = useState<ProposalRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const canDeleteProposals = permissions.can_delete_proposals;

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
        ? scopeProposalByIdsQuery(
          (supabase
            .from('propostas')
            .select('id, valor_projeto, consumo_kwh, potencia_kw, paineis_qtd, economia_mensal, payback_anos')) as any,
          { proposalIds: propostaIds, orgId },
        )
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
      const response = await listMembers(orgId ?? undefined);
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
          ? scopeProposalByIdsQuery(
            (supabase
              .from('propostas')
              .select('id, valor_projeto, consumo_kwh, potencia_kw, paineis_qtd, economia_mensal, payback_anos')) as any,
            { proposalIds: propostaIds, orgId },
          )
          : Promise.resolve({ data: [], error: null } as any),
        versionIds.length > 0
          ? scopeProposalVersionByIdsQuery(
            (supabase
              .from('proposal_versions')
              .select('id, premium_payload')) as any,
            { proposalVersionIds: versionIds, orgId },
          )
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

  const handleDownloadProposal = async (row: ProposalRow) => {
    if (row.pdf_url) {
      window.open(row.pdf_url, '_blank');
      return;
    }

    if (!canGenerateFromRow(row)) {
      toast({ title: 'Proposta indisponível', description: 'Não há dados suficientes para baixar a proposta.', variant: 'destructive' });
      return;
    }

    const payload = (row.premium_payload as any) || {};
    const contaLuzMensal = Number(
      payload?.technicalInputs?.contaLuzMensal
      ?? payload?.financialInputs?.contaLuzMensalReferencia
      ?? 0,
    ) || undefined;
    // Pre-fetch cover image for the segment (best-effort)
    const tipoClienteCover = row.tipo_cliente || payload?.segment || 'residencial';
    const coverImageDataUrls = await prefetchCoverImages(tipoClienteCover, 3).catch(() => [] as string[]);
    const coverImageDataUrl = coverImageDataUrls[0] || await prefetchCoverImage(tipoClienteCover).catch(() => null);
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
      contaLuzMensal,
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
      coverImageDataUrl: coverImageDataUrl || null,
      coverImageDataUrls,
    });
  };

  const handleDownloadScript = (row: ProposalRow) => {
    if (!canGenerateFromRow(row)) {
      toast({ title: 'Roteiro indisponível', description: 'Não há dados suficientes para baixar o roteiro.', variant: 'destructive' });
      return;
    }

    const payload = (row.premium_payload as any) || {};
    const contaLuzMensal = Number(
      payload?.technicalInputs?.contaLuzMensal
      ?? payload?.financialInputs?.contaLuzMensalReferencia
      ?? 0,
    ) || undefined;
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
      contaLuzMensal,
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

  const requestDelete = (row: ProposalRow) => {
    if (!canDeleteProposals) return;
    setRowToDelete(row);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!orgId || !rowToDelete || deletingVersionId) return;

    const targetVersionId = rowToDelete.proposal_version_id;
    setDeletingVersionId(targetVersionId);

    try {
      const { error } = await supabase.rpc('delete_proposal_version', {
        p_org_id: orgId,
        p_proposal_version_id: targetVersionId,
      });

      if (error) throw error;

      setDeleteDialogOpen(false);
      setRowToDelete(null);
      setSelectedRow((current) => (
        current?.proposal_version_id === targetVersionId ? null : current
      ));

      const deletingLastRowOnPage = rows.length === 1 && page > 0;
      if (deletingLastRowOnPage) {
        setPage((current) => Math.max(0, current - 1));
      } else {
        await fetchProposals();
      }

      toast({
        title: 'Proposta excluida',
        description: 'A versao selecionada foi removida com sucesso.',
      });
    } catch (error) {
      console.error('Failed to delete proposal version:', error);
      const errorMessage = (() => {
        if (error instanceof Error) return error.message;
        if (error && typeof error === 'object' && 'message' in error) {
          return String((error as { message?: unknown }).message || '');
        }
        return '';
      })();
      toast({
        title: 'Erro ao excluir proposta',
        description: errorMessage || 'Nao foi possivel excluir a proposta.',
        variant: 'destructive',
      });
    } finally {
      setDeletingVersionId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30 relative">
      <PageHeader
        title="Propostas"
        subtitle="Histórico global de versões com filtros"
        icon={FileText}
        className="z-10"
      />

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-4">
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
                  <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0" align="start">
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
                <Button onClick={fetchProposals} disabled={loading} className="w-full sm:w-auto">Aplicar filtros</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultados ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[560px] overflow-auto px-4 pb-4 sm:px-6 sm:pb-6">
              {isMobileViewport ? (
                <div className="space-y-3">
                  {rows.map((row) => {
                    const isDeletingRow = deletingVersionId === row.proposal_version_id;

                    return (
                      <button
                        key={row.proposal_version_id}
                        type="button"
                        className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
                        onClick={() => setSelectedRow(row)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{row.lead_name || `Lead ${row.lead_id}`}</p>
                            <p className="text-sm text-muted-foreground truncate">{row.lead_phone || '-'}</p>
                          </div>
                          <Badge variant="outline" className={STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-700 border-slate-200'}>
                            {STATUS_TRANSLATIONS[row.status] || row.status}
                          </Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Versão</p>
                            <p className="font-medium">V{row.version_no}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor</p>
                            <p className="font-medium">
                              {typeof row.valor_projeto === 'number'
                                ? row.valor_projeto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : '-'}
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                          Criada em {new Date(row.created_at).toLocaleString('pt-BR')}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10"
                            disabled={!row.pdf_url && !canGenerateFromRow(row)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadProposal(row);
                            }}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Proposta
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10"
                            disabled={!canGenerateFromRow(row)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadScript(row);
                            }}
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Roteiro
                          </Button>
                          {canDeleteProposals && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-10"
                              disabled={isDeletingRow}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDelete(row);
                              }}
                            >
                              {isDeletingRow ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                              Excluir
                            </Button>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
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
                  {rows.map((row) => {
                    const isDeletingRow = deletingVersionId === row.proposal_version_id;

                    return (
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
                            {canDeleteProposals && (
                              <Button
                                variant="destructive"
                                size="sm"
                                data-testid={`proposal-delete-${row.proposal_version_id}`}
                                disabled={isDeletingRow}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestDelete(row);
                                }}
                              >
                                {isDeletingRow ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 mr-1" />
                                )}
                                Excluir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Pagination */}
      {(rows.length > 0 || page > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t bg-background">
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
                {canDeleteProposals && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingVersionId === selectedRow.proposal_version_id}
                    onClick={() => requestDelete(selectedRow)}
                  >
                    {deletingVersionId === selectedRow.proposal_version_id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    Excluir
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deletingVersionId) return;
          setDeleteDialogOpen(open);
          if (!open) setRowToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir versao da proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao remove a versao selecionada. Se for a ultima versao, a proposta base tambem sera excluida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingVersionId}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              data-testid="proposal-delete-confirm"
              onClick={handleConfirmDelete}
              disabled={!rowToDelete || !!deletingVersionId}
              variant="destructive"
              size="sm"
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletingVersionId && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

