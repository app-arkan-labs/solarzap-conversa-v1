import { Search, MessageSquare, Mic, Filter, X, ArrowUpDown, FileUp, FileDown, MoreVertical, Trash2, FileText, Bot, CheckSquare, Loader2, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Conversation, CHANNEL_INFO, PIPELINE_STAGES, PipelineStage, Contact, ChannelFilter } from '@/types/solarzap';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

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
  canViewTeam?: boolean;
  showTeamLeads?: boolean;
  onToggleTeamLeads?: (show: boolean) => void;
}

const channelFilters: { id: ChannelFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'E-mail' },
];

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
  canViewTeam = false,
  showTeamLeads = false,
  onToggleTeamLeads,
}: ConversationListProps) {
  const { toast } = useToast();
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

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

  const visibleLeadIds = useMemo(() => conversations.map((conversation) => conversation.contact.id), [conversations]);

  const selectedVisibleCount = useMemo(
    () => visibleLeadIds.filter((leadId) => selectedLeadIds.has(leadId)).length,
    [visibleLeadIds, selectedLeadIds],
  );

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
        title: `${deletedCount} lead(s) excluído(s)`,
      });
      return;
    }

    toast({
      title: `${deletedCount} lead(s) excluído(s), ${failedIds.length} falharam`,
      description: 'Tente novamente para os itens que falharam.',
      variant: 'destructive',
    });
  };

  const selectedStage = stageOptions.find(s => s.id === stageFilter) || stageOptions[0];
  const activeStageCount = stageFilter !== 'todos'
    ? conversations.filter(c => c.contact.pipelineStage === stageFilter).length
    : conversations.length;

  return (
    <div className="w-full h-full flex flex-col border-r border-border bg-card">
      {/* Premium Header */}
      <div className="p-4 bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 border-b shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-foreground">SolarZap</h1>
          </div>
          <div className="flex items-center gap-1">
            {/* Selection mode toggle — shown only when delete is available */}
            {onDeleteLead && (
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
            {/* Stage Filter Button */}
            <Popover open={stageFilterOpen} onOpenChange={setStageFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "p-2 rounded-md transition-colors flex items-center gap-1",
                    stageFilter !== 'todos'
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Filter className="w-5 h-5" />
                  {stageFilter !== 'todos' && (
                    <span className="text-xs font-medium bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                      {activeStageCount}
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
                    <h3 className="font-semibold text-sm text-foreground">Filtrar por Etapa</h3>
                    {stageFilter !== 'todos' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onStageFilterChange('todos');
                          setStageFilterOpen(false);
                        }}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>
                <ScrollArea className="h-[320px]">
                  <div className="p-2 space-y-0.5">
                    {stageOptions.map((stage) => {
                      const count = stage.id === 'todos'
                        ? conversations.length
                        : conversations.filter(c => c.contact.pipelineStage === stage.id).length;
                      const isSelected = stageFilter === stage.id;

                      return (
                        <button
                          key={stage.id}
                          onClick={() => {
                            onStageFilterChange(stage.id);
                            setStageFilterOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left",
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base flex-shrink-0">{stage.icon}</span>
                            <span className={cn(
                              "text-sm truncate",
                              isSelected && "font-medium"
                            )}>
                              {stage.label}
                            </span>
                          </div>
                          <Badge
                            variant={isSelected ? "default" : "secondary"}
                            className={cn(
                              "text-xs flex-shrink-0 ml-2",
                              isSelected && "bg-primary text-primary-foreground"
                            )}
                          >
                            {count}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
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
            placeholder="Pesquisar ou começar nova conversa"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-background border-0 shadow-sm"
          />
        </div>
      </div>

      {/* Active Stage Filter Indicator */}
      {stageFilter !== 'todos' && (
        <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span>{selectedStage.icon}</span>
            <span className="font-medium text-foreground">{selectedStage.label}</span>
            <Badge variant="secondary" className="text-xs">{activeStageCount}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStageFilterChange('todos')}
            className="h-6 w-6 p-0 hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      )}

      {canViewTeam && onToggleTeamLeads && (
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <button
            onClick={() => onToggleTeamLeads(false)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              !showTeamLeads
                ? 'bg-secondary text-secondary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            data-testid="toggle-team-leads-mine"
          >
            <User className="w-3 h-3" />
            Meus leads
          </button>
          <button
            onClick={() => onToggleTeamLeads(true)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              showTeamLeads
                ? 'bg-secondary text-secondary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            data-testid="toggle-team-leads"
          >
            <Users className="w-3 h-3" />
            Toda a equipe
          </button>
        </div>
      )}

      {/* Channel Filters */}
      <div className="px-3 py-2 flex gap-2 overflow-x-auto border-b border-border">
        {channelFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onChannelFilterChange(filter.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              channelFilter === filter.id
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isSelectionMode && onDeleteLead && (
        <div className="px-3 py-2 border-b border-border bg-primary/5 flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <Checkbox checked={selectAllState} onCheckedChange={handleToggleSelectAllVisible} />
            <span>{allVisibleSelected ? 'Todos selecionados' : someVisibleSelected ? `${selectedVisibleCount} selecionado(s)` : 'Selecionar todos'}</span>
          </label>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-7 ml-auto gap-1.5 text-xs"
            disabled={selectedLeadIds.size === 0}
            onClick={() => setBulkDeleteDialogOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir ({selectedLeadIds.size})
          </Button>
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
              <button
                key={conversation.id}
                data-testid="conversation-row"
                onClick={() => {
                  if (isSelectionMode) {
                    toggleLeadSelection(conversation.contact.id);
                    return;
                  }
                  onSelect(conversation);
                }}
                className={cn(
                  'w-full p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 group',
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
                      <Bot className="w-6 h-6 text-green-600" />
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

                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {!isSelectionMode && (
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
                </div>
              </button>
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
