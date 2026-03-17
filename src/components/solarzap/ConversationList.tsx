import { Search, MessageSquare, Mic, Filter, X, ArrowUpDown, FileUp, FileDown, MoreVertical, Trash2, FileText, Bot, CheckSquare, Loader2, Users, User, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Conversation, CHANNEL_INFO, PIPELINE_STAGES, PipelineStage, Contact, ChannelFilter } from '@/types/solarzap';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LeadCommentsModal } from './LeadCommentsModal';
import { AudioDeviceModal } from './AudioDeviceModal';
import { ImportContactsModal, ImportedContact } from './ImportContactsModal';
import { ExportContactsModal } from './ExportContactsModal';
import { AssignMemberSelect } from './AssignMemberSelect';
import { FollowUpIndicator } from './FollowUpIndicator';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getMemberDisplayName } from '@/lib/memberDisplayName';
import { listMembers, type MemberDto } from '@/lib/orgAdminClient';
import type { LeadScopeValue } from './LeadScopeSelect';

interface ConversationListProps {
  conversations: Conversation[];
  contacts: Contact[];
  selectedId: string | null;
  channelFilter: ChannelFilter;
  searchQuery: string;
  stageFilter: PipelineStage | 'todos';
  onSelect: (conversation: Conversation) => void;
  onChannelFilterChange: (filter: ChannelFilter) => void;
  onSearchChange: (query: string) => void;
  onStageFilterChange: (stage: PipelineStage | 'todos') => void;
  onImportContacts?: (contacts: ImportedContact[]) => Promise<unknown>;
  onDeleteLead?: (contactId: string) => Promise<void>;
  onBulkAssignLeads?: (leadIds: string[], assignedToUserId: string | null) => Promise<{ updatedCount: number; failedIds: string[] }>;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  leadScopeLoading?: boolean;
  currentUserId?: string | null;
  isDetailsPanelOpen?: boolean;
}

// Get stage options for filter
const stageOptions: { id: PipelineStage | 'todos'; label: string; icon: string }[] = [
  { id: 'todos', label: 'Todas Etapas', icon: '📊' },
  ...Object.entries(PIPELINE_STAGES).map(([key, value]) => ({
    id: key as PipelineStage,
    label: value.title,
    icon: value.icon,
  })),
];

export function ConversationList({
  conversations,
  contacts,
  selectedId,
  channelFilter,
  searchQuery,
  stageFilter,
  onSelect,
  onChannelFilterChange,
  onSearchChange,
  onStageFilterChange,

  onImportContacts,
  onDeleteLead,
  onBulkAssignLeads,
  canViewTeam = false,
  leadScope = 'mine',
  onLeadScopeChange,
  leadScopeMembers = [],
  leadScopeLoading = false,
  currentUserId = null,
  isDetailsPanelOpen = false,
}: ConversationListProps) {
  const { toast } = useToast();
  const isMobileViewport = useMobileViewport();
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [commentsContact, setCommentsContact] = useState<{ id: string; name: string } | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<{ id: string; name: string } | null>(null);

  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [stageFilterOpen, setStageFilterOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState<string>('unassigned');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [fallbackLeadScopeMembers, setFallbackLeadScopeMembers] = useState<MemberDto[]>([]);
  const [isRefreshingLeadScopeMembers, setIsRefreshingLeadScopeMembers] = useState(false);
  const [bulkAssignMembers, setBulkAssignMembers] = useState<MemberDto[]>([]);
  const [isLoadingBulkAssignMembers, setIsLoadingBulkAssignMembers] = useState(false);

  const formatTime = (date: Date) => {
    const now = new Date();
    const messageDate = new Date(date);

    if (messageDate.toDateString() === now.toDateString()) {
      return messageDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }

    return messageDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const handleOpenComments = (e: React.MouseEvent, contact: { id: string; name: string }) => {
    e.stopPropagation();
    setCommentsContact(contact);
    setCommentsModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, contact: { id: string; name: string }) => {
    e.stopPropagation();
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!contactToDelete || !onDeleteLead) return;
    await onDeleteLead(contactToDelete.id);
    setDeleteDialogOpen(false);
    setContactToDelete(null);
  };

  const channelFilters = useMemo(() => (
    [{ id: 'todos' as ChannelFilter, label: 'Todos' }]
      .concat(
        (Object.entries(CHANNEL_INFO) as Array<[Exclude<ChannelFilter, 'todos'>, { label: string }]>)
          .map(([id, info]) => ({ id, label: info.label }))
      )
  ), []);

  const canBulkAssign = Boolean(onBulkAssignLeads);
  const canUseSelectionMode = Boolean(onDeleteLead) || canBulkAssign;
  const visibleLeadIds = useMemo(() => conversations.map((conversation) => conversation.contact.id), [conversations]);

  const selectedVisibleCount = useMemo(
    () => visibleLeadIds.filter((leadId) => selectedLeadIds.has(leadId)).length,
    [visibleLeadIds, selectedLeadIds],
  );
  const effectiveLeadScopeMembers = useMemo(() => {
    const merged = [...leadScopeMembers, ...fallbackLeadScopeMembers];
    const seen = new Set<string>();
    return merged.filter((member) => {
      if (!member.user_id) return false;
      if (seen.has(member.user_id)) return false;
      seen.add(member.user_id);
      return true;
    });
  }, [fallbackLeadScopeMembers, leadScopeMembers]);
  const availableTeamMembers = useMemo(() => {
    const seen = new Set<string>();
    return effectiveLeadScopeMembers.filter((member) => {
      if (!member.user_id || member.user_id === currentUserId) return false;
      if (seen.has(member.user_id)) return false;
      seen.add(member.user_id);
      return true;
    });
  }, [currentUserId, effectiveLeadScopeMembers]);
  const leadScopeLabel = useMemo(() => {
    if (leadScope === 'org_all') return 'Toda a equipe';
    if (leadScope === 'mine') return 'Meus leads';

    if (leadScope.startsWith('user:')) {
      const scopedUserId = leadScope.slice(5).trim();
      if (!scopedUserId) return 'Membro selecionado';
      const scopedMember = effectiveLeadScopeMembers.find((member) => member.user_id === scopedUserId);
      return scopedMember ? getMemberDisplayName(scopedMember) : 'Membro selecionado';
    }

    return 'Meus leads';
  }, [effectiveLeadScopeMembers, leadScope]);
  const isLeadScopeMembersLoading = leadScopeLoading || isRefreshingLeadScopeMembers;
  const refreshLeadScopeMembers = useCallback(async () => {
    if (!canViewTeam && !canBulkAssign) return;
    if (effectiveLeadScopeMembers.length > 0) return;
    if (isRefreshingLeadScopeMembers) return;

    setIsRefreshingLeadScopeMembers(true);
    try {
      const response = await listMembers(undefined, { forceRefresh: true });
      setFallbackLeadScopeMembers(response.members || []);
    } catch (error) {
      console.warn('Failed to refresh members for conversations lead scope:', error);
    } finally {
      setIsRefreshingLeadScopeMembers(false);
    }
  }, [canBulkAssign, canViewTeam, effectiveLeadScopeMembers.length, isRefreshingLeadScopeMembers]);

  const loadBulkAssignMembers = useCallback(async () => {
    if (!canBulkAssign) return;
    if (isLoadingBulkAssignMembers) return;
    if (bulkAssignMembers.length > 0) return;

    setIsLoadingBulkAssignMembers(true);
    try {
      const response = await listMembers(undefined, { forceRefresh: true });
      const members = response.members || [];
      setBulkAssignMembers(members);

      if (members.length > 0) {
        const preferredMember = members.find((member) => member.user_id === currentUserId);
        setBulkAssignUserId(preferredMember?.user_id || members[0].user_id || 'unassigned');
      }
    } catch (error) {
      console.warn('Failed to load members for bulk assignment:', error);
    } finally {
      setIsLoadingBulkAssignMembers(false);
    }
  }, [bulkAssignMembers.length, canBulkAssign, currentUserId, isLoadingBulkAssignMembers]);

  const bulkAssignableMembers = useMemo(() => {
    if (bulkAssignMembers.length > 0) {
      return bulkAssignMembers;
    }
    return effectiveLeadScopeMembers;
  }, [bulkAssignMembers, effectiveLeadScopeMembers]);

  const allVisibleSelected = visibleLeadIds.length > 0 && selectedVisibleCount === visibleLeadIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectAllState: boolean | 'indeterminate' = allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false;

  useEffect(() => {
    if (selectedLeadIds.size === 0) return;
    const visibleSet = new Set(visibleLeadIds);
    setSelectedLeadIds((prev) => {
      const next = new Set([...prev].filter((leadId) => visibleSet.has(leadId)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleLeadIds, selectedLeadIds.size]);

  useEffect(() => {
    if (leadScopeMembers.length > 0 && fallbackLeadScopeMembers.length > 0) {
      setFallbackLeadScopeMembers([]);
    }
  }, [fallbackLeadScopeMembers.length, leadScopeMembers.length]);

  useEffect(() => {
    if (!isSelectionMode || !canBulkAssign) return;
    void loadBulkAssignMembers();
  }, [canBulkAssign, isSelectionMode, loadBulkAssignMembers]);

  // Reset selection mode when details panel opens or conversation changes
  useEffect(() => {
    if (isDetailsPanelOpen) {
      setIsSelectionMode(false);
      setSelectedLeadIds(new Set());
    }
  }, [isDetailsPanelOpen]);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedLeadIds(new Set());
  }, [selectedId]);

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedLeadIds(new Set());
      return;
    }
    setIsSelectionMode(true);
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const handleToggleSelectAllVisible = () => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleLeadIds.forEach((leadId) => next.delete(leadId));
      } else {
        visibleLeadIds.forEach((leadId) => next.add(leadId));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!onDeleteLead || selectedLeadIds.size === 0) return;
    setIsBulkDeleting(true);

    const results = await Promise.allSettled(
      Array.from(selectedLeadIds).map(id => onDeleteLead(id))
    );

    const failedIds: string[] = [];
    let deletedCount = 0;
    const ids = Array.from(selectedLeadIds);
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') deletedCount++;
      else failedIds.push(ids[i]);
    });

    setIsBulkDeleting(false);
    setBulkDeleteDialogOpen(false);
    setSelectedLeadIds(new Set(failedIds));

    if (failedIds.length === 0) {
      toast({
        title: `${deletedCount} lead(s) excluido(s)`,
      });
      return;
    }

    toast({
      title: `${deletedCount} lead(s) excluido(s), ${failedIds.length} falharam`,
      description: 'Tente novamente para os itens que falharam.',
      variant: 'destructive',
    });
  };

  const handleBulkAssign = async () => {
    if (!onBulkAssignLeads || selectedLeadIds.size === 0) return;
    setIsBulkAssigning(true);

    const selectedIds = Array.from(selectedLeadIds);
    const targetUserId = bulkAssignUserId === 'unassigned' ? null : bulkAssignUserId;

    try {
      const result = await onBulkAssignLeads(selectedIds, targetUserId);
      const failedIds = result?.failedIds || [];
      const updatedCount = result?.updatedCount || 0;

      setSelectedLeadIds(new Set(failedIds));

      if (failedIds.length === 0) {
        toast({
          title: `${updatedCount} lead(s) atribuido(s)`,
        });
        return;
      }

      toast({
        title: `${updatedCount} lead(s) atribuido(s), ${failedIds.length} falharam`,
        description: 'Tente novamente para os itens com falha.',
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Erro ao atribuir leads',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const selectedStage = stageOptions.find(s => s.id === stageFilter) || stageOptions[0];
  const selectedChannel = channelFilters.find((filter) => filter.id === channelFilter) || channelFilters[0];
  const hasStageFilter = stageFilter !== 'todos';
  const hasChannelFilter = channelFilter !== 'todos';
  const hasActiveFilters = hasStageFilter || hasChannelFilter;
  const activeFilterCount = Number(hasStageFilter) + Number(hasChannelFilter);
  const activeStageCount = stageFilter !== 'todos'
    ? conversations.filter(c => c.contact.pipelineStage === stageFilter).length
    : conversations.length;

  return (
    <div className="w-full h-full flex flex-col border-r border-border bg-card">
      {/* Premium Header */}
      <div className="p-4 border-b border-border/70 bg-[linear-gradient(120deg,hsl(var(--primary)/0.12),transparent_30%,hsl(var(--secondary)/0.10)_100%)] shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-foreground">SolarZap</h1>
          </div>
          <div className="flex items-center gap-1">
            {/* Selection mode toggle - shown when delete or bulk assign is available */}
            {canUseSelectionMode && (
              <button
                onClick={toggleSelectionMode}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  isSelectionMode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                title={isSelectionMode ? 'Cancelar seleção' : 'Selecionar leads'}
              >
                <CheckSquare className="w-5 h-5" />
              </button>
            )}
            {/* Filter Button */}
            <Popover open={stageFilterOpen} onOpenChange={setStageFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "p-2 rounded-md transition-colors flex items-center gap-1",
                    hasActiveFilters
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Filter className="w-5 h-5" />
                  {hasActiveFilters && (
                    <span className="text-xs font-medium bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 p-0 bg-popover border border-border shadow-xl z-50"
                sideOffset={8}
              >
                <div className="p-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground">Filtros da Conversa</h3>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onStageFilterChange('todos');
                          onChannelFilterChange('todos');
                        }}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Limpar tudo
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  <div className="space-y-1.5">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Etapa do funil
                    </p>
                    <Select
                      value={stageFilter}
                      onValueChange={(value) => onStageFilterChange(value as PipelineStage | 'todos')}
                    >
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Selecione a etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {stageOptions.map((stage) => {
                          const count = stage.id === 'todos'
                            ? conversations.length
                            : conversations.filter((conversation) => conversation.contact.pipelineStage === stage.id).length;

                          return (
                            <SelectItem key={`stage-${stage.id}`} value={stage.id}>
                              {`${stage.icon} ${stage.label} (${count})`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Origem do lead
                    </p>
                    <Select
                      value={channelFilter}
                      onValueChange={(value) => onChannelFilterChange(value as ChannelFilter)}
                    >
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Selecione a origem" />
                      </SelectTrigger>
                      <SelectContent>
                        {channelFilters.map((filter) => {
                          const count = filter.id === 'todos'
                            ? conversations.length
                            : conversations.filter((conversation) => conversation.contact.channel === filter.id).length;

                          return (
                            <SelectItem key={`channel-${filter.id}`} value={filter.id}>
                              {`${filter.label} (${count})`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Audio Settings Button */}
            <button
              onClick={() => setAudioSettingsOpen(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Configurações de Áudio"
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Import/Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title="Importar / Exportar contatos"
                >
                  <ArrowUpDown className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border border-border z-50">
                <DropdownMenuItem onClick={() => setShowImportModal(true)} className="gap-2">
                  <FileUp className="w-4 h-4" />
                  Importar Contatos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowExportModal(true)} className="gap-2">
                  <FileDown className="w-4 h-4" />
                  Exportar Contatos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-background border-0 shadow-sm"
          />
        </div>
      </div>

      {/* Active Filters Indicator */}
      {hasActiveFilters && (
        <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {hasStageFilter && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <span>{selectedStage.icon}</span>
                <span>{selectedStage.label}</span>
                <span className="opacity-70">({activeStageCount})</span>
              </Badge>
            )}
            {hasChannelFilter && (
              <Badge variant="secondary" className="text-xs">
                Origem: {selectedChannel.label}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onStageFilterChange('todos');
              onChannelFilterChange('todos');
            }}
            className="h-6 w-6 p-0 hover:bg-muted"
            title="Limpar filtros"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      )}

      {canViewTeam && onLeadScopeChange ? (
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) {
                void refreshLeadScopeMembers();
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                className="w-full h-9 flex items-center justify-between gap-2 px-3 rounded-md text-sm font-medium bg-background border border-border/60 text-foreground hover:bg-muted transition-colors"
                data-testid="toggle-team-leads"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Users className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{leadScopeLabel}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-popover border border-border z-50">
              <DropdownMenuItem
                onClick={() => onLeadScopeChange('org_all')}
                data-testid="toggle-team-leads-option-org-all"
                className={cn('gap-2', leadScope === 'org_all' && 'bg-muted font-medium')}
              >
                <Users className="w-3.5 h-3.5" />
                Toda a equipe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLeadScopeChange('mine')}
                data-testid="toggle-team-leads-option-mine"
                className={cn('gap-2', leadScope === 'mine' && 'bg-muted font-medium')}
              >
                <User className="w-3.5 h-3.5" />
                Meus leads
              </DropdownMenuItem>
              {availableTeamMembers.map((member) => {
                const scopeValue = `user:${member.user_id}` as LeadScopeValue;
                return (
                  <DropdownMenuItem
                    key={member.user_id}
                    onClick={() => onLeadScopeChange(scopeValue)}
                    data-testid={`toggle-team-leads-option-user-${member.user_id}`}
                    className={cn('gap-2', leadScope === scopeValue && 'bg-muted font-medium')}
                  >
                    <User className="w-3.5 h-3.5" />
                    {getMemberDisplayName(member)}
                  </DropdownMenuItem>
                );
              })}
              {isLeadScopeMembersLoading && availableTeamMembers.length === 0 ? (
                <DropdownMenuItem
                  disabled
                  data-testid="toggle-team-leads-option-loading"
                  className="gap-2 text-muted-foreground"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Carregando membros...
                </DropdownMenuItem>
              ) : null}
              {!isLeadScopeMembersLoading && availableTeamMembers.length === 0 ? (
                <DropdownMenuItem
                  disabled
                  data-testid="toggle-team-leads-option-empty"
                  className="gap-2 text-muted-foreground"
                >
                  Nenhum outro membro encontrado
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {isSelectionMode && canUseSelectionMode && (
        <div className="px-3 py-3 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-none">Seleção em massa</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedLeadIds.size > 0
                    ? `${selectedLeadIds.size} lead(s) selecionado(s)`
                    : 'Selecione os leads para atribuir ou excluir'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={toggleSelectionMode}
            >
              <X className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline text-xs">Fechar</span>
            </Button>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <button
              type="button"
              onClick={handleToggleSelectAllVisible}
              className="h-9 w-full md:max-w-[260px] px-2 rounded-md border border-border/70 bg-background/80 flex items-center gap-2 text-xs font-medium text-foreground text-left"
            >
              <Checkbox
                checked={selectAllState}
                onCheckedChange={handleToggleSelectAllVisible}
                onClick={(event) => event.stopPropagation()}
              />
              <span className="truncate">
                {allVisibleSelected
                  ? 'Todos os visíveis selecionados'
                  : someVisibleSelected
                    ? `${selectedVisibleCount} visível(is) selecionado(s)`
                    : 'Selecionar todos os visíveis'}
              </span>
            </button>

            {canBulkAssign && (
              <div className="flex flex-col gap-2 sm:flex-row md:flex-1">
                <Select
                  value={bulkAssignUserId}
                  onValueChange={setBulkAssignUserId}
                  onOpenChange={(open) => {
                    if (open) {
                      void loadBulkAssignMembers();
                    }
                  }}
                  disabled={isBulkAssigning || isLoadingBulkAssignMembers}
                >
                  <SelectTrigger className="h-9 w-full text-sm bg-background">
                    <SelectValue placeholder={isLoadingBulkAssignMembers ? 'Carregando membros...' : 'Selecionar responsável'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Não atribuído</SelectItem>
                    {bulkAssignableMembers.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {getMemberDisplayName(member)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-9 gap-1.5 text-xs sm:px-4"
                  disabled={selectedLeadIds.size === 0 || isBulkAssigning}
                  onClick={handleBulkAssign}
                >
                  {isBulkAssigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Atribuir
                </Button>
              </div>
            )}

            {onDeleteLead && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-9 gap-1.5 text-xs sm:px-4"
                disabled={selectedLeadIds.size === 0}
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        ) : (
          conversations.map((conversation) => {
            const stage = PIPELINE_STAGES[conversation.contact.pipelineStage];
            const isSelected = selectedId === conversation.id;
            const isAiActive = conversation.contact.aiEnabled !== false;
            const isRowSelected = selectedLeadIds.has(conversation.contact.id);

            return (
              <div
                key={conversation.id}
                data-testid="conversation-row"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleLeadSelection(conversation.contact.id);
                    return;
                  }
                  onSelect(conversation);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  if (isSelectionMode) {
                    toggleLeadSelection(conversation.contact.id);
                    return;
                  }
                  onSelect(conversation);
                }}
                className={cn(
                  'w-full p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isSelectionMode ? isRowSelected && 'bg-primary/5' : isSelected && 'bg-muted'
                )}
              >
                {isSelectionMode && (
                  <Checkbox
                    checked={isRowSelected}
                    onCheckedChange={() => toggleLeadSelection(conversation.contact.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Selecionar ${conversation.contact.name}`}
                    className="mt-3"
                  />
                )}

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center" title={isAiActive ? 'IA Ativa' : undefined}>
                    {isAiActive ? (
                      <Bot className="w-6 h-6 text-primary" />
                    ) : (
                      <span className="text-2xl">{conversation.contact.avatar || '👤'}</span>
                    )}
                  </div>
                  {conversation.isUrgent && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-danger border-2 border-card" />
                  )}
                  {conversation.hasFollowupToday && !conversation.isUrgent && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning border-2 border-card" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground truncate">
                      {conversation.contact.name}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => handleOpenComments(e, { id: conversation.contact.id, name: conversation.contact.name })}>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Comentários
                          </DropdownMenuItem>
                          {onDeleteLead && (
                            <DropdownMenuItem
                              onClick={(e) => handleDeleteClick(e, { id: conversation.contact.id, name: conversation.contact.name })}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {conversation.lastMessage && formatTime(conversation.lastMessage.timestamp)}
                      </span>
                    </div>
                  </div>

                  {conversation.contact.company && (
                    <div className="text-xs text-muted-foreground truncate">
                      {conversation.contact.company}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground truncate h-5">
                      {conversation.lastMessage?.attachment_type === 'image' && conversation.lastMessage.attachment_url ? (
                        <div className="flex items-center gap-1">
                          <img
                            src={conversation.lastMessage.attachment_url}
                            alt="Preview"
                            className="w-5 h-5 rounded object-cover"
                          />
                          <span>Imagem</span>
                        </div>
                      ) : conversation.lastMessage?.attachment_type === 'video' ? (
                        <div className="flex items-center gap-1">
                          <span className="flex items-center justify-center w-5 h-5 bg-muted rounded">🎬</span>
                          <span>Vídeo</span>
                        </div>
                      ) : conversation.lastMessage?.attachment_type === 'audio' ? (
                        <div className="flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          <span>Áudio</span>
                        </div>
                      ) : conversation.lastMessage?.attachment_type === 'document' ? (
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          <span>Documento</span>
                        </div>
                      ) : (
                        <span className="truncate">
                          {conversation.lastMessage?.content}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {conversation.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {!isSelectionMode && !isMobileViewport && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <AssignMemberSelect
                            contactId={conversation.contact.id}
                            currentAssigneeId={conversation.contact.assignedToUserId}
                            triggerClassName="w-[130px]"
                          />
                        </div>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {stage.icon} {stage.title}
                      </Badge>
                    </div>
                    <div className="w-full overflow-hidden">
                      <FollowUpIndicator
                        step={conversation.contact.followUpStep ?? 0}
                        enabled={conversation.contact.followUpEnabled !== false}
                        compact
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Comments Modal */}
      <LeadCommentsModal
        isOpen={commentsModalOpen}
        onClose={() => {
          setCommentsModalOpen(false);
          setCommentsContact(null);
        }}
        leadId={commentsContact?.id || ''}
        leadName={commentsContact?.name || ''}
      />

      {/* Audio Device Settings Modal */}
      <AudioDeviceModal
        isOpen={audioSettingsOpen}
        onClose={() => setAudioSettingsOpen(false)}
        onConfirm={() => { }}
        mode="settings"
      />

      {/* Import Contacts Modal */}
      {onImportContacts && (
        <ImportContactsModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={onImportContacts}
        />
      )}

      {/* Export Contacts Modal */}
      <ExportContactsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        contacts={contacts}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conversa e Contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{contactToDelete?.name}</strong>? Isso removerá o contato e todo o histórico de conversas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir leads selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai excluir {selectedLeadIds.size} lead(s) e seus históricos de conversa. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || selectedLeadIds.size === 0}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
