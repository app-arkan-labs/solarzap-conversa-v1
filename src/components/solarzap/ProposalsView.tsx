import { useCallback, useEffect, useState } from 'react';
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
import { PIPELINE_STAGES } from '@/types/solarzap';
import { Check, ChevronDown, Copy, ExternalLink, FileText } from 'lucide-react';
import { listMembers, type MemberDto } from '@/lib/orgAdminClient';
import { getMemberDisplayName } from '@/lib/memberDisplayName';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [owners, setOwners] = useState<MemberDto[]>([]);
  const [leadOptions, setLeadOptions] = useState<LeadFilterOption[]>([]);
  const [leadFilterOpen, setLeadFilterOpen] = useState(false);

  const [selectedLeadId, setSelectedLeadId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [stage, setStage] = useState<string>('all');
  const [owner, setOwner] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
          .select('id, nome, telefone, phone_e164, status_pipeline, assigned_to_user_id, user_id')
          .eq('org_id', orgId)
          .in('id', leadIds)
        : Promise.resolve({ data: [], error: null } as any),
      propostaIds.length > 0
        ? supabase
          .from('propostas')
          .select('id, valor_projeto')
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
        pdf_url:
          row.premium_payload?.public_pdf_url ||
          row.premium_payload?.client_pdf_url ||
          row.premium_payload?.pdf_url ||
          null,
        share_url: row.premium_payload?.share_url || null,
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

    return mapped.slice(0, 200);
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
        p_limit: 200,
        p_offset: 0,
      });

      if (error) {
        const fallbackRows = await fetchProposalsFallback();
        setRows(fallbackRows);
        return;
      }

      let mappedRows = (data || []) as ProposalRow[];
      if (selectedLeadId !== 'all') {
        const parsedLeadId = Number(selectedLeadId);
        mappedRows = mappedRows.filter((row) => Number(row.lead_id) === parsedLeadId);
      }
      setRows(mappedRows);
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
  }, [orgId, status, stage, owner, dateFrom, dateTo, selectedLeadId, toast, fetchProposalsFallback]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const selectedLead = selectedLeadId === 'all'
    ? null
    : leadOptions.find((lead) => String(lead.id) === selectedLeadId) || null;

  const copyLink = async (url: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copiado',
        description: 'O link da proposta foi copiado para a área de transferência.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o link.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30 relative">
      <div className="px-6 py-5 bg-gradient-to-r from-primary/10 via-background to-blue-500/10 border-b flex-shrink-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Propostas</h1>
              <p className="text-sm text-muted-foreground">Histórico global de versões com filtros</p>
            </div>
          </div>
        </div>
      </div>

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
            <CardContent className="overflow-x-auto">
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
                    <tr key={row.proposal_version_id} className="border-b">
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
                            disabled={!row.pdf_url}
                            onClick={() => row.pdf_url && window.open(row.pdf_url, '_blank')}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Ver PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!row.share_url && !row.pdf_url}
                            onClick={() => copyLink(row.share_url || row.pdf_url)}
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            Copiar link
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
    </div>
  );
}
