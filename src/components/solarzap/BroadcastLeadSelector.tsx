import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { PIPELINE_STAGES, CHANNEL_INFO, type PipelineStage, type Channel } from '@/types/solarzap';
import { getMemberDisplayName } from '@/lib/memberDisplayName';
import type { MemberDto } from '@/lib/orgAdminClient';
import type { ImportedContactRow } from '@/utils/contactsImport';

interface CrmLead {
  id: number;
  nome: string;
  telefone: string;
  email: string | null;
  status_pipeline: string;
  canal: string | null;
  assigned_to_user_id: string | null;
}

interface BroadcastLeadSelectorProps {
  orgId: string;
  members: MemberDto[];
  fallbackUserId: string;
  onSelectionChange: (contacts: ImportedContactRow[]) => void;
}

const LEADS_QUERY_LIMIT = 500;
const ALL_FILTER = '__all__';

export function BroadcastLeadSelector({
  orgId,
  members,
  fallbackUserId,
  onSelectionChange,
}: BroadcastLeadSelectorProps) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [filterUser, setFilterUser] = useState(ALL_FILTER);
  const [filterStage, setFilterStage] = useState(ALL_FILTER);
  const [filterChannel, setFilterChannel] = useState(ALL_FILTER);

  const fetchLeads = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('id,nome,telefone,email,status_pipeline,canal,assigned_to_user_id')
        .eq('org_id', orgId)
        .not('telefone', 'is', null)
        .neq('telefone', '')
        .order('created_at', { ascending: false })
        .limit(LEADS_QUERY_LIMIT);

      if (filterUser !== ALL_FILTER) {
        query = query.eq('assigned_to_user_id', filterUser);
      }
      if (filterStage !== ALL_FILTER) {
        query = query.eq('status_pipeline', filterStage);
      }
      if (filterChannel !== ALL_FILTER) {
        query = query.eq('canal', filterChannel);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Failed to fetch leads for broadcast selector:', error);
        setLeads([]);
        return;
      }
      setLeads((data as CrmLead[]) || []);
      setSelectedIds(new Set());
    } finally {
      setIsLoading(false);
    }
  }, [orgId, filterUser, filterStage, filterChannel]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const filteredLeads = useMemo(() => {
    if (!searchText.trim()) return leads;
    const lower = searchText.toLowerCase();
    return leads.filter(
      (lead) =>
        lead.nome?.toLowerCase().includes(lower) ||
        lead.telefone?.includes(searchText),
    );
  }, [leads, searchText]);

  useEffect(() => {
    const selected = leads.filter((lead) => selectedIds.has(lead.id));
    const contacts: ImportedContactRow[] = selected.map((lead) => ({
      name: lead.nome || '',
      phone: lead.telefone || '',
      email: lead.email || undefined,
    }));
    onSelectionChange(contacts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const toggleLead = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredLeads.length && filteredLeads.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const allSelected = filteredLeads.length > 0 && selectedIds.size === filteredLeads.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredLeads.length;

  return (
    <div className="space-y-3 h-full flex flex-col min-h-0">
      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Responsável</Label>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Todos</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {getMemberDisplayName(member)}
                </SelectItem>
              ))}
              {members.length < 1 && fallbackUserId && (
                <SelectItem value={fallbackUserId}>Eu</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Etapa do funil</Label>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Todas</SelectItem>
              {(Object.entries(PIPELINE_STAGES) as [PipelineStage, { title: string; icon: string }][]).map(
                ([value, info]) => (
                  <SelectItem key={value} value={value}>
                    {info.icon} {info.title}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Origem / Canal</Label>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Todos</SelectItem>
              {(Object.entries(CHANNEL_INFO) as [Channel, { label: string; icon: string }][]).map(
                ([value, info]) => (
                  <SelectItem key={value} value={value}>
                    {info.icon} {info.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search + count */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Buscar por nome ou telefone..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <Badge variant="secondary" className="whitespace-nowrap text-xs">
          {selectedIds.size} / {filteredLeads.length} selecionado(s)
        </Badge>
      </div>

      {/* Lead list */}
      <div className="flex-1 min-h-0 border rounded-md">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando leads...</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <Users className="w-5 h-5 mr-2" />
            Nenhum lead encontrado com esses filtros.
          </div>
        ) : (
          <ScrollArea className="h-[320px] sm:h-[340px] lg:h-[380px]">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2">
              <Checkbox
                checked={someSelected ? 'indeterminate' : allSelected}
                onCheckedChange={toggleAll}
                aria-label="Selecionar todos"
              />
              <span className="text-xs font-medium text-muted-foreground">
                Selecionar todos ({filteredLeads.length})
              </span>
            </div>

            <div className="divide-y">
              {filteredLeads.map((lead) => {
                const stageInfo = PIPELINE_STAGES[lead.status_pipeline as PipelineStage];
                const channelInfo = lead.canal ? CHANNEL_INFO[lead.canal as Channel] : null;
                return (
                  <label
                    key={lead.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(lead.id)}
                      onCheckedChange={() => toggleLead(lead.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.nome}</p>
                      <p className="text-xs text-muted-foreground">{lead.telefone}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {stageInfo && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {stageInfo.icon} {stageInfo.title}
                        </Badge>
                      )}
                      {channelInfo && (
                        <span className="text-xs" title={channelInfo.label}>
                          {channelInfo.icon}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
