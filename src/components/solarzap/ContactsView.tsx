import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Contact, PIPELINE_STAGES, PipelineStage, ClientType } from '@/types/solarzap';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, Phone, Mail, MapPin, Zap, DollarSign, Calendar, Clock, Timer, Save, Loader2, MessageSquare, Upload, Download, Trash2, Bot, UserCog, CheckSquare, Users, ArrowLeft } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
import { useToast } from '@/hooks/use-toast';
import { UpdateLeadData } from './EditLeadModal';
import { LeadCommentsModal } from './LeadCommentsModal';
import { AssignMemberSelect } from './AssignMemberSelect';
import { FollowUpIndicator } from './FollowUpIndicator';
import { PageHeader } from './PageHeader'; // New Import
import { useAISettings } from '@/hooks/useAISettings'; // New Import
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { scopeProposalByIdsQuery } from '@/lib/multiOrgLeadScoping';
import { resolveProposalLinks } from '@/utils/proposalLinks';
import { LeadScopeSelect, type LeadScopeValue } from './LeadScopeSelect';
import type { MemberDto } from '@/lib/orgAdminClient';

import { ImportContactsModal, ImportedContact } from './ImportContactsModal';
import { ExportContactsModal } from './ExportContactsModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useMobileViewport } from '@/hooks/useMobileViewport';

interface ContactsViewProps {
  contacts: Contact[];
  onUpdateLead?: (contactId: string, data: UpdateLeadData) => Promise<void>;
  onImportContacts?: (contacts: ImportedContact[]) => Promise<unknown>;
  onDeleteLead?: (contactId: string) => Promise<void>;
  onToggleLeadAi?: (params: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => Promise<{ leadId: string; enabled: boolean }>;
  onOpenFollowUpExhausted?: (leadId: string) => void;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  leadScopeLoading?: boolean;
  currentUserId?: string | null;
}

const STAGE_COLORS: Record<string, string> = {
  'novo_lead': 'bg-[#2196F3]',
  'respondeu': 'bg-[#FF9800]',
  'chamada_agendada': 'bg-[#9C27B0]',
  'chamada_realizada': 'bg-[#4CAF50]',
  'nao_compareceu': 'bg-[#F44336]',
  'aguardando_proposta': 'bg-[#FF5722]',
  'proposta_pronta': 'bg-[#00BCD4]',
  'visita_agendada': 'bg-[#009688]',
  'visita_realizada': 'bg-[#8BC34A]',
  'proposta_negociacao': 'bg-[#FFC107]',
  'financiamento': 'bg-[#E91E63]',
  'contrato_assinado': 'bg-[#4CAF50]',
  'projeto_pago': 'bg-[#2E7D32]',
  'aguardando_instalacao': 'bg-[#607D8B]',
  'projeto_instalado': 'bg-[#FFB300]',
  'coletar_avaliacao': 'bg-[#FF8F00]',
  'contato_futuro': 'bg-[#9E9E9E]',
  'perdido': 'bg-[#616161]',
};

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

interface ContactProposal {
  id: string;
  proposta_id: number;
  lead_id: number;
  version_no: number;
  created_at: string;
  status: string;
  premium_payload: Record<string, unknown> | null;
  org_id: string | null;
  valor_projeto: number | null;
  pdf_url: string | null;
  share_url: string | null;
}

const PROPOSAL_STATUS_TRANSLATIONS: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronta',
  sent: 'Enviada',
  accepted: 'Aceita',
  rejected: 'Recusada',
  archived: 'Arquivada',
};

const PROPOSAL_STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: 'bg-muted text-foreground/80 border-border',
  ready: 'bg-blue-100 text-blue-700 border-blue-200',
  sent: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  accepted: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  archived: 'bg-gray-100 text-gray-700 border-gray-200',
};

const formatCurrencyPtBR = (value: number | null | undefined) => {
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const getProposalStatusLabel = (status: string | null | undefined) => {
  if (!status) return 'Indefinido';
  return PROPOSAL_STATUS_TRANSLATIONS[status] || status;
};

const getProposalStatusBadgeClass = (status: string | null | undefined) => {
  if (!status) return 'bg-muted text-foreground/80 border-border';
  return PROPOSAL_STATUS_BADGE_CLASSES[status] || 'bg-muted text-foreground/80 border-border';
};

const extractProposalLinks = (payload: Record<string, unknown> | null) => {
  return resolveProposalLinks({
    premiumPayload: payload,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  });
};

export function ContactsView({
  contacts,
  onUpdateLead,
  onImportContacts,
  onDeleteLead,
  onToggleLeadAi,
  onOpenFollowUpExhausted,
  canViewTeam = false,
  leadScope = 'mine',
  onLeadScopeChange,
  leadScopeMembers = [],
  leadScopeLoading = false,
  currentUserId = null,
}: ContactsViewProps) {
  const isMobileViewport = useMobileViewport();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0] || null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { settings: aiSettings } = useAISettings(); // Get Global Settings

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Modal states
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Form state for inline editing
  const [formData, setFormData] = useState<UpdateLeadData>({});
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [contactProposals, setContactProposals] = useState<ContactProposal[]>([]);

  // Track previous ID to detect context switch vs background update
  const prevContactIdRef = React.useRef<string | null>(null);

  // Reset form when selected contact changes
  useEffect(() => {
    if (selectedContact) {
      const isSwitchingContact = prevContactIdRef.current !== selectedContact.id;

      // Update ref
      prevContactIdRef.current = selectedContact.id;

      // Logic: 
      // 1. If switching to a NEW contact -> Always load new data, clear dirty state.
      // 2. If same contact (background update) -> Only load if NOT dirty (hasChanges=false).

      if (isSwitchingContact) {
        setHasChanges(false); // Clean slate
        setFormData({
          nome: selectedContact.name,
          telefone: selectedContact.phone,
          email: selectedContact.email || '',
          empresa: selectedContact.company || '',
          tipo_cliente: selectedContact.clientType,
          endereco: selectedContact.address || '',
          cidade: selectedContact.city || '',
          consumo_kwh: selectedContact.consumption,
          valor_estimado: selectedContact.projectValue,
          observacoes: selectedContact.notes || '',
          status_pipeline: selectedContact.pipelineStage,
        });
      } else if (!hasChanges) {
        // Background update, form is clean, so we can verify if we should sync
        setFormData({
          nome: selectedContact.name,
          telefone: selectedContact.phone,
          email: selectedContact.email || '',
          empresa: selectedContact.company || '',
          tipo_cliente: selectedContact.clientType,
          endereco: selectedContact.address || '',
          cidade: selectedContact.city || '',
          consumo_kwh: selectedContact.consumption,
          valor_estimado: selectedContact.projectValue,
          observacoes: selectedContact.notes || '',
          status_pipeline: selectedContact.pipelineStage,
        });
      }
    }
  }, [selectedContact, hasChanges]);

  useEffect(() => {
    if (!selectedContact) {
      if (contacts.length > 0) {
        setSelectedContact(contacts[0]);
      }
      return;
    }

    const refreshedContact = contacts.find((contact) => contact.id === selectedContact.id) || null;
    if (!refreshedContact) {
      setSelectedContact(contacts[0] || null);
      return;
    }

    if (refreshedContact !== selectedContact) {
      setSelectedContact(refreshedContact);
    }
  }, [contacts, selectedContact]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileDetailOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    if (!selectedContact) {
      setContactProposals([]);
      setProposalsLoading(false);
      return;
    }

    if (!orgId) {
      setContactProposals([]);
      setProposalsLoading(false);
      return;
    }

    const selectedLeadId = Number(selectedContact.id);
    if (!Number.isFinite(selectedLeadId)) {
      setContactProposals([]);
      setProposalsLoading(false);
      return;
    }

    let isCancelled = false;

    const fetchContactProposals = async () => {
      setProposalsLoading(true);
      try {
        const { data: versions, error: versionsError } = await supabase
          .from('proposal_versions')
          .select('id, proposta_id, lead_id, version_no, created_at, status, premium_payload, org_id')
          .eq('org_id', orgId)
          .eq('lead_id', selectedLeadId)
          .order('created_at', { ascending: false })
          .limit(8);

        if (versionsError) throw versionsError;

        const proposalIds = Array.from(
          new Set((versions || []).map((item: any) => Number(item.proposta_id)).filter((id: number) => Number.isFinite(id)))
        );

        let valorProjetoMap = new Map<number, number | null>();
        if (proposalIds.length > 0) {
          const { data: propostas, error: propostasError } = await scopeProposalByIdsQuery(
            (supabase
              .from('propostas')
              .select('id, valor_projeto')) as any,
            { proposalIds, orgId },
          );

          if (propostasError) throw propostasError;

          valorProjetoMap = new Map<number, number | null>(
            (propostas || []).map((item: any) => [Number(item.id), typeof item.valor_projeto === 'number' ? item.valor_projeto : null])
          );
        }

        const mapped: ContactProposal[] = (versions || []).map((item: any) => {
          const payload = item.premium_payload && typeof item.premium_payload === 'object'
            ? (item.premium_payload as Record<string, unknown>)
            : null;
          const links = extractProposalLinks(payload);
          const propostaId = Number(item.proposta_id);

          return {
            id: String(item.id),
            proposta_id: propostaId,
            lead_id: Number(item.lead_id),
            version_no: Number(item.version_no || 1),
            created_at: String(item.created_at),
            status: String(item.status || ''),
            premium_payload: payload,
            org_id: item.org_id ? String(item.org_id) : null,
            valor_projeto: valorProjetoMap.get(propostaId) ?? null,
            pdf_url: links.pdfUrl,
            share_url: links.shareUrl,
          };
        });

        if (!isCancelled) {
          setContactProposals(mapped);
        }
      } catch (error) {
        console.error('Falha ao carregar propostas do contato:', error);
        if (!isCancelled) {
          setContactProposals([]);
        }
      } finally {
        if (!isCancelled) {
          setProposalsLoading(false);
        }
      }
    };

    fetchContactProposals();

    return () => {
      isCancelled = true;
    };
  }, [selectedContact, orgId]);

  const handleChange = (field: keyof UpdateLeadData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handlePipelineStageChange = (value: PipelineStage) => {
    handleChange('status_pipeline', value);
    setSelectedContact((prev) => (prev ? { ...prev, pipelineStage: value } : prev));
  };

  const handleToggleLeadAiRealtime = async (enabled: boolean) => {
    if (!selectedContact || !onToggleLeadAi) return;
    const previousValue = selectedContact.aiEnabled !== false;

    setSelectedContact((prev) => (prev ? { ...prev, aiEnabled: enabled } : prev));
    try {
      await onToggleLeadAi({ leadId: selectedContact.id, enabled });
    } catch {
      setSelectedContact((prev) => (prev ? { ...prev, aiEnabled: previousValue } : prev));
      toast({
        title: 'Erro ao atualizar IA',
        description: 'Não foi possível atualizar o status da IA deste lead.',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async () => {
    if (!selectedContact || !onUpdateLead) return;

    setIsSaving(true);
    try {
      // PREPARE DATA: Sanitize phone
      const dataToSave = { ...formData };
      if (dataToSave.telefone) {
        let cleanPhone = dataToSave.telefone.replace(/\D/g, '');
        // Auto-prepend 55 if likely BR number (10 or 11 digits) and missing it
        if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
          cleanPhone = '55' + cleanPhone;
        }
        dataToSave.telefone = cleanPhone;
      }

      await onUpdateLead(selectedContact.id, dataToSave);
      setSelectedContact((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name: dataToSave.nome ?? prev.name,
          phone: dataToSave.telefone ?? prev.phone,
          email: dataToSave.email ?? prev.email,
          company: dataToSave.empresa ?? prev.company,
          clientType: (dataToSave.tipo_cliente as ClientType | undefined) ?? prev.clientType,
          address: dataToSave.endereco ?? prev.address,
          city: dataToSave.cidade ?? prev.city,
          consumption: dataToSave.consumo_kwh ?? prev.consumption,
          projectValue: dataToSave.valor_estimado ?? prev.projectValue,
          notes: dataToSave.observacoes ?? prev.notes,
          pipelineStage: (dataToSave.status_pipeline as PipelineStage | undefined) ?? prev.pipelineStage,
        };
      });
      setHasChanges(false);
      toast({
        title: "Contato atualizado!",
        description: "Os dados foram salvos com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!contactToDelete || !onDeleteLead) return;
    try {
      await onDeleteLead(contactToDelete.id);
      // If we deleted the selected contact, clear selection or select another
      if (selectedContact?.id === contactToDelete.id) {
        const remaining = contacts.filter(c => c.id !== contactToDelete.id);
        setSelectedContact(remaining[0] || null);
      }
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    } catch (error) {
      console.error("Failed to delete contact", error);
    }
  };

  const filteredContacts = contacts.filter(c => {
    const q = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q);
  });

  const triggerFollowUpExhaustedIfNeeded = React.useCallback((contact: Contact | null) => {
    if (!contact || !onOpenFollowUpExhausted) return;
    if ((contact.followUpStep ?? 0) < 5) return;
    if (contact.followUpExhaustedSeen !== false) return;
    onOpenFollowUpExhausted(contact.id);
  }, [onOpenFollowUpExhausted]);

  useEffect(() => {
    triggerFollowUpExhaustedIfNeeded(selectedContact);
  }, [
    selectedContact?.id,
    selectedContact?.followUpStep,
    selectedContact?.followUpExhaustedSeen,
    triggerFollowUpExhaustedIfNeeded,
  ]);

  const visibleContactIds = filteredContacts.map((contact) => contact.id);
  const selectedVisibleCount = visibleContactIds.filter((contactId) => selectedContactIds.has(contactId)).length;
  const allVisibleSelected = visibleContactIds.length > 0 && selectedVisibleCount === visibleContactIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectAllState: boolean | 'indeterminate' = allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false;

  useEffect(() => {
    if (selectedContactIds.size === 0) return;
    const visibleSet = new Set(visibleContactIds);
    setSelectedContactIds((prev) => {
      const next = new Set([...prev].filter((contactId) => visibleSet.has(contactId)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectedContactIds.size, searchTerm, contacts]);

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedContactIds(new Set());
      return;
    }
    setIsSelectionMode(true);
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const handleToggleSelectAllVisible = () => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleContactIds.forEach((contactId) => next.delete(contactId));
      } else {
        visibleContactIds.forEach((contactId) => next.add(contactId));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!onDeleteLead || selectedContactIds.size === 0) return;

    setIsBulkDeleting(true);
    const ids = Array.from(selectedContactIds);

    const results = await Promise.allSettled(
      ids.map(id => onDeleteLead(id))
    );

    const failedIds: string[] = [];
    const deletedIds: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') deletedIds.push(ids[i]);
      else failedIds.push(ids[i]);
    });

    if (selectedContact && deletedIds.includes(selectedContact.id)) {
      const remaining = contacts.filter((contact) => !deletedIds.includes(contact.id));
      setSelectedContact(remaining[0] || null);
    }

    setIsBulkDeleting(false);
    setBulkDeleteDialogOpen(false);
    setSelectedContactIds(new Set(failedIds));

    if (failedIds.length === 0) {
      toast({
        title: `${deletedIds.length} contato(s) excluído(s)`,
      });
      return;
    }

    toast({
      title: `${deletedIds.length} contato(s) excluído(s), ${failedIds.length} falharam`,
      description: 'Tente novamente para os itens que falharam.',
      variant: 'destructive',
    });
  };

  const getStageColor = (stageId: string) => {
    return STAGE_COLORS[stageId] || 'bg-primary';
  };

  const getDaysInStage = (contact: Contact) => {
    const lastUpdate = new Date(contact.lastContact);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const showMobileDetail = isMobileViewport && mobileDetailOpen && Boolean(selectedContact);

  return (
    <div className="flex-1 flex h-full bg-muted/30 overflow-hidden">
      {/* Left Sidebar - Contact List */}
      <div className={`${isMobileViewport ? (showMobileDetail ? 'hidden' : 'flex flex-1 flex-col') : 'w-80 border-r border-border flex flex-col'} bg-card min-w-0`}>
        <PageHeader
          title="Contatos"
          icon={Users}
          className="px-4 py-4"
          actionContent={
            <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1 h-9 w-9 p-0"
                onClick={() => setImportModalOpen(true)}
                title="Importar contatos"
              >
                <Upload className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1 h-9 w-9 p-0"
                onClick={() => setExportModalOpen(true)}
                title="Exportar contatos"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          }
        />

        {canViewTeam && onLeadScopeChange ? (
          <div className="px-3 py-2 border-b border-border bg-card">
            <LeadScopeSelect
              value={leadScope}
              onChange={onLeadScopeChange}
              members={leadScopeMembers}
              loading={leadScopeLoading}
              currentUserId={currentUserId}
              testId="contacts-owner-scope-trigger"
              triggerClassName="w-full h-9 bg-background border-border/50 shadow-sm glass"
            />
          </div>
        ) : null}

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar contatos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background glass shadow-sm"
            />
          </div>
        </div>

        {!isMobileViewport && onDeleteLead && (
          <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
            <Button
              type="button"
              variant={isSelectionMode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={toggleSelectionMode}
            >
              <CheckSquare className="w-4 h-4" />
              {isSelectionMode ? 'Cancelar' : 'Selecionar'}
            </Button>

            {isSelectionMode && (
              <>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox checked={selectAllState} onCheckedChange={handleToggleSelectAllVisible} />
                  <span>Todos</span>
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 ml-auto"
                  disabled={selectedContactIds.size === 0}
                  onClick={() => setBulkDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Excluir ({selectedContactIds.size})
                </Button>
              </>
            )}
          </div>
        )}

        {/* Contact List */}
        <div className={`flex-1 overflow-auto ${isMobileViewport ? 'p-3 space-y-3 bg-muted/20' : ''}`}>
          {filteredContacts.map((contact) => {
            const isRowSelected = selectedContactIds.has(contact.id);
            return (
              <div
                key={contact.id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleContactSelection(contact.id);
                    return;
                  }
                  triggerFollowUpExhaustedIfNeeded(contact);
                  setSelectedContact(contact);
                  if (isMobileViewport) {
                    setMobileDetailOpen(true);
                  }
                }}
                className={`
                flex items-center gap-3 p-3 cursor-pointer group transition-colors
                ${isMobileViewport ? 'rounded-2xl border border-border/70 bg-card shadow-sm hover:bg-card/90' : 'border-b border-border hover:bg-muted/50'}
                ${isSelectionMode ? (isRowSelected ? 'bg-primary/5' : '') : (selectedContact?.id === contact.id ? 'bg-muted' : '')}
              `}
              >
                {isSelectionMode && (
                  <Checkbox
                    checked={isRowSelected}
                    onCheckedChange={() => toggleContactSelection(contact.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Selecionar ${contact.name}`}
                  />
                )}
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {contact.avatar || contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{contact.name}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStageColor(contact.pipelineStage)}`} />
                  </div>
                  <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {formatPhoneForDisplay(contact.phone)}
                  </div>
                  <div className="mt-1">
                    <FollowUpIndicator
                      step={contact.followUpStep ?? 0}
                      enabled={contact.followUpEnabled !== false}
                      compact
                    />
                  </div>
                </div>
                {/* Buttons on hover */}
                {!isSelectionMode && (
                  <div className={`flex items-center transition-opacity ${isMobileViewport ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedContact(contact);
                        setCommentsModalOpen(true);
                      }}
                      title="Comentários"
                    >
                      <MessageSquare className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </Button>
                    {onDeleteLead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 hover:bg-destructive/10"
                        onClick={(e) => handleDeleteClick(contact, e)}
                        title="Excluir Contato"
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${isMobileViewport ? (showMobileDetail ? 'flex flex-1 flex-col' : 'hidden') : 'flex-1 flex flex-col'} min-w-0 bg-background`}>
        {/* Detail Header */}
        <div className="px-4 py-4 sm:px-6 border-b border-border/50 bg-gradient-to-r from-background to-muted/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {isMobileViewport && showMobileDetail && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setMobileDetailOpen(false)}
                aria-label="Voltar para lista de contatos"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground truncate">Detalhes do Contato</h2>
            {selectedContact && onToggleLeadAi && (
              <div className={cn(
                "ml-0 sm:ml-4 flex items-center gap-2 px-3 py-1 bg-background/50 rounded-lg border border-border/50",
                !aiSettings?.is_active && "opacity-70"
              )}
                title={!aiSettings?.is_active ? "IA Global Desativada" : ""}
              >
                <Switch
                  checked={selectedContact.aiEnabled !== false}
                  onCheckedChange={handleToggleLeadAiRealtime}
                  className="data-[state=checked]:bg-primary"
                  disabled={!aiSettings?.is_active} // Disable if Global OFF
                />
                <div className="flex items-center gap-1.5">
                  {!aiSettings?.is_active ? (
                    <Bot className="w-4 h-4 text-muted-foreground" />
                  ) : selectedContact.aiEnabled !== false ? (
                    <Bot className="w-4 h-4 text-primary" />
                  ) : (
                    <UserCog className="w-4 h-4 text-orange-500" />
                  )}
                  <span className="text-xs font-medium">
                    {!aiSettings?.is_active ? 'Sistema Pausado' : selectedContact.aiEnabled !== false ? 'IA Ativa' : 'Pausada'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {selectedContact && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/50 shadow-sm h-10"
                onClick={() => setCommentsModalOpen(true)}
              >
                <MessageSquare className="w-4 h-4" />
                Comentários
              </Button>
            )}
            {selectedContact && hasChanges && (
              <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-2 shadow-sm h-10">
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar
              </Button>
            )}
            {selectedContact && onDeleteLead && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 h-10"
                onClick={(e) => handleDeleteClick(selectedContact, e)}
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
            )}
          </div>
        </div>

        {selectedContact ? (
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            {/* Contact Header */}
            <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-center">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {selectedContact.avatar || selectedContact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Input
                  value={formData.nome || ''}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  className="text-xl font-semibold h-10 max-w-sm"
                  placeholder="Nome do contato"
                />
                <Input
                  value={formData.empresa || ''}
                  onChange={(e) => handleChange('empresa', e.target.value)}
                  className="text-muted-foreground max-w-sm"
                  placeholder="Empresa"
                />
                <Select
                  value={formData.status_pipeline}
                  onValueChange={(value) => handlePipelineStageChange(value as PipelineStage)}
                >
                  <SelectTrigger className={`w-fit ${getStageColor(formData.status_pipeline || 'novo_lead')} text-white border-0`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-60">
                    {Object.entries(PIPELINE_STAGES).map(([key, stage]) => (
                      <SelectItem key={key} value={key}>
                        {stage.icon} {stage.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                  <AssignMemberSelect
                    contactId={selectedContact.id}
                    currentAssigneeId={contacts.find((contact) => contact.id === selectedContact.id)?.assignedToUserId ?? selectedContact.assignedToUserId}
                    triggerClassName={isMobileViewport ? 'w-full sm:w-[220px]' : 'w-[220px]'}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              {/* Contact Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
                  Informações de Contato
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={formatPhoneForDisplay(formData.telefone) || ''}
                      onChange={(e) => handleChange('telefone', e.target.value)}
                      placeholder="(DD) 90000-0000"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={formData.email || ''}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="E-mail"
                      type="email"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        value={formData.endereco || ''}
                        onChange={(e) => handleChange('endereco', e.target.value)}
                        placeholder="Endereço"
                      />
                      <Input
                        value={formData.cidade || ''}
                        onChange={(e) => handleChange('cidade', e.target.value)}
                        placeholder="Cidade"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Solar Project */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
                  Projeto Solar
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={formData.consumo_kwh || ''}
                      onChange={(e) => handleChange('consumo_kwh', parseFloat(e.target.value) || 0)}
                      placeholder="Consumo kWh/mês"
                      type="number"
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">kWh/mês</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={formData.valor_estimado || ''}
                      onChange={(e) => handleChange('valor_estimado', parseFloat(e.target.value) || 0)}
                      placeholder="Valor estimado"
                      type="number"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 text-muted-foreground flex-shrink-0 text-center">🏠</span>
                    <Select
                      value={formData.tipo_cliente}
                      onValueChange={(value) => handleChange('tipo_cliente', value as ClientType)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Tipo de cliente" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {CLIENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-8 space-y-4">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
                Observações
              </h4>
              <Textarea
                value={formData.observacoes || ''}
                onChange={(e) => handleChange('observacoes', e.target.value)}
                placeholder="Anotações sobre o contato..."
                rows={3}
              />
            </div>

            <div className="mt-8 space-y-4">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
                Propostas do Cliente
              </h4>

              {proposalsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-md px-3 py-2 bg-muted/30">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Carregando propostas...</span>
                </div>
              ) : contactProposals.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md px-3 py-3 bg-muted/20">
                  Nenhuma proposta encontrada para este contato.
                </div>
              ) : (
                <div className="space-y-2">
                  {contactProposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      className="rounded-md border border-border bg-card px-3 py-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm font-medium text-foreground">
                          Proposta #{proposal.proposta_id} • V{proposal.version_no}
                        </div>
                        <Badge
                          variant="outline"
                          className={getProposalStatusBadgeClass(proposal.status)}
                        >
                          {getProposalStatusLabel(proposal.status)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Criada em {new Date(proposal.created_at).toLocaleString('pt-BR')}
                        </span>
                        <span>
                          Valor: {formatCurrencyPtBR(proposal.valor_projeto)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={!proposal.pdf_url}
                          onClick={() => proposal.pdf_url && /^https?:\/\//i.test(proposal.pdf_url) && window.open(proposal.pdf_url, '_blank', 'noopener,noreferrer')}
                        >
                          PDF
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={!proposal.share_url}
                          onClick={() => proposal.share_url && /^https?:\/\//i.test(proposal.share_url) && window.open(proposal.share_url, '_blank', 'noopener,noreferrer')}
                        >
                          Compartilhar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="mt-8">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
                Timeline
              </h4>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Cadastro: {new Date(selectedContact.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    Última interação: {new Date(selectedContact.lastContact).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(selectedContact.lastContact).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="w-4 h-4" />
                  <span>{getDaysInStage(selectedContact)} dias na etapa atual</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Selecione um contato para ver os detalhes
          </div>
        )}
      </div>

      {/* Comments Modal */}
      <LeadCommentsModal
        isOpen={commentsModalOpen}
        onClose={() => setCommentsModalOpen(false)}
        leadId={selectedContact?.id || ''}
        leadName={selectedContact?.name || ''}
      />

      {/* Import Modal */}
      <ImportContactsModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={onImportContacts || (async () => { })}
      />

      {/* Export Modal */}
      <ExportContactsModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        contacts={contacts}
      />

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contatos selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai excluir {selectedContactIds.size} contato(s). Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || selectedContactIds.size === 0}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{contactToDelete?.name}</strong>? Esta ação não pode ser desfeita.
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
    </div>
  );
}
