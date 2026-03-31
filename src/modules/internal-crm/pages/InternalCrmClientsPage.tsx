import { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Plus,
  Save,
  Search,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Timer,
  MessageSquare,
  Upload,
  Download,
  Trash2,
  CheckSquare,
  Users,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useInternalCrmClientsModule } from '@/modules/internal-crm/hooks/useInternalCrmClients';
import { useInternalCrmPipelineStages } from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { CrmClientCommentsModal } from '@/modules/internal-crm/components/clients/CrmClientCommentsModal';
import { CrmImportClientsModal } from '@/modules/internal-crm/components/clients/CrmImportClientsModal';
import { CrmExportClientsModal } from '@/modules/internal-crm/components/clients/CrmExportClientsModal';
import type { InternalCrmClientSummary, InternalCrmStage } from '@/modules/internal-crm/types';

/* ── helpers ────────────────────────────────────────── */

const STAGE_COLORS: Record<string, string> = {
  novo_lead: 'bg-[#2196F3]',
  respondeu: 'bg-[#FF9800]',
  reuniao_agendada: 'bg-[#9C27B0]',
  reuniao_realizada: 'bg-[#4CAF50]',
  nao_compareceu: 'bg-[#F44336]',
  proposta_enviada: 'bg-[#00BCD4]',
  negociacao: 'bg-[#FFC107]',
  contrato_fechado: 'bg-[#4CAF50]',
  em_integracao: 'bg-[#009688]',
  ativo: 'bg-[#8BC34A]',
  perdido: 'bg-[#616161]',
};

const LIFECYCLE_LABELS: Record<string, string> = {
  lead: 'Lead',
  customer_onboarding: 'Em Integração',
  active_customer: 'Cliente Ativo',
  churn_risk: 'Risco de Cancelamento',
  churned: 'Cancelado',
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  google_ads: 'Google Ads',
  indicacao: 'Indicação',
  manual: 'Manual',
  landing_page: 'Landing Page',
};

type FormData = {
  company_name: string;
  primary_contact_name: string;
  primary_phone: string;
  primary_email: string;
  source_channel: string;
  lifecycle_status: string;
  current_stage_code: string;
  notes: string;
};

const emptyDraft = (): FormData => ({
  company_name: '',
  primary_contact_name: '',
  primary_phone: '',
  primary_email: '',
  source_channel: 'whatsapp',
  lifecycle_status: 'lead',
  current_stage_code: 'novo_lead',
  notes: '',
});

function getStageColor(stageCode: string | null) {
  return STAGE_COLORS[stageCode || ''] || 'bg-primary';
}

function getInitials(name: string | null, company: string) {
  const src = name || company || '??';
  return src
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getDaysInStage(lastContactAt: string | null) {
  if (!lastContactAt) return 0;
  const ms = Date.now() - new Date(lastContactAt).getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/* ── main component ─────────────────────────────────── */

export default function InternalCrmClientsPage() {
  const { toast } = useToast();
  const isMobile = useMobileViewport();

  // Selection & search state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stageCode, setStageCode] = useState('all');
  const [lifecycle, setLifecycle] = useState('all');

  // Inline edit form state
  const [formData, setFormData] = useState<FormData>(emptyDraft());
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const prevIdRef = useRef<string | null>(null);

  // New client dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());

  // Selection mode (bulk delete)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Delete single client
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<InternalCrmClientSummary | null>(null);

  // Modals
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Data hooks
  const stagesQuery = useInternalCrmPipelineStages();
  const stages: InternalCrmStage[] = stagesQuery.data?.stages || [];

  const clients = useInternalCrmClientsModule(selectedClientId, {
    search,
    stage_code: stageCode,
    lifecycle_status: lifecycle,
  });

  const allClients: InternalCrmClientSummary[] = clients.clientsQuery.data?.clients || [];
  const selectedClient = allClients.find((c) => c.id === selectedClientId) || null;
  const notes = clients.notesQuery.data?.notes || [];

  // Filter client list
  const filteredClients = allClients.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.company_name?.toLowerCase().includes(q) ||
      c.primary_contact_name?.toLowerCase().includes(q) ||
      c.primary_phone?.toLowerCase().includes(q) ||
      c.primary_email?.toLowerCase().includes(q)
    );
  });

  // Sync form when selecting a different client
  useEffect(() => {
    if (!selectedClient) return;
    const isSwitching = prevIdRef.current !== selectedClient.id;
    prevIdRef.current = selectedClient.id;

    if (isSwitching) {
      setHasChanges(false);
      setFormData({
        company_name: selectedClient.company_name || '',
        primary_contact_name: selectedClient.primary_contact_name || '',
        primary_phone: selectedClient.primary_phone || '',
        primary_email: selectedClient.primary_email || '',
        source_channel: selectedClient.source_channel || 'manual',
        lifecycle_status: selectedClient.lifecycle_status || 'lead',
        current_stage_code: selectedClient.current_stage_code || 'novo_lead',
        notes: (selectedClient as InternalCrmClientSummary & { notes?: string | null }).notes || '',
      });
    } else if (!hasChanges) {
      setFormData({
        company_name: selectedClient.company_name || '',
        primary_contact_name: selectedClient.primary_contact_name || '',
        primary_phone: selectedClient.primary_phone || '',
        primary_email: selectedClient.primary_email || '',
        source_channel: selectedClient.source_channel || 'manual',
        lifecycle_status: selectedClient.lifecycle_status || 'lead',
        current_stage_code: selectedClient.current_stage_code || 'novo_lead',
        notes: (selectedClient as InternalCrmClientSummary & { notes?: string | null }).notes || '',
      });
    }
  }, [selectedClient, hasChanges]);

  // Close mobile detail when switching to desktop
  useEffect(() => {
    if (!isMobile) setMobileDetailOpen(false);
  }, [isMobile]);

  // Keep selected IDs in sync with visible clients
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleSet = new Set(filteredClients.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectedIds.size, search, allClients]);

  /* ── handlers ─────────────────────────────────────── */

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedClientId) return;
    setIsSaving(true);
    try {
      await clients.upsertClientMutation.mutateAsync({
        action: 'upsert_client',
        client_id: selectedClientId,
        ...formData,
      });
      setHasChanges(false);
      toast({ title: 'Cliente atualizado!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateClient = async () => {
    if (!draft.company_name.trim()) {
      toast({ title: 'Informe o nome da empresa', variant: 'destructive' });
      return;
    }
    await clients.upsertClientMutation.mutateAsync({
      action: 'upsert_client',
      ...draft,
    });
    toast({ title: 'Cliente criado!' });
    setNewDialogOpen(false);
    setDraft(emptyDraft());
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
      await clients.deleteClientMutation.mutateAsync({
        action: 'delete_client',
        client_id: clientId,
      });
      if (selectedClientId === clientId) {
        setSelectedClientId(null);
      }
      toast({ title: 'Cliente excluído.' });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Não foi possível excluir.';
      toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) =>
        clients.deleteClientMutation.mutateAsync({ action: 'delete_client', client_id: id }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const deleted = results.filter((r) => r.status === 'fulfilled').length;
    if (selectedClientId && ids.includes(selectedClientId)) setSelectedClientId(null);
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    toast({
      title: `${deleted} excluído(s)${failed > 0 ? `, ${failed} falharam` : ''}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });
  };

  const handleAddNote = async (body: string) => {
    await clients.addNoteMutation.mutateAsync({
      action: 'add_client_note',
      client_id: selectedClientId,
      body,
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    await clients.deleteNoteMutation.mutateAsync({
      action: 'delete_client_note',
      note_id: noteId,
    });
  };

  const handleImportClient = async (record: Record<string, string>) => {
    await clients.upsertClientMutation.mutateAsync({
      action: 'upsert_client',
      ...record,
    });
  };

  /* ── selection helpers ──────────────────────────────── */

  const visibleIds = filteredClients.map((c) => c.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectAllState: boolean | 'indeterminate' = allVisibleSelected ? true : someSelected ? 'indeterminate' : false;

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── render ───────────────────────────────────────── */

  const showMobileDetail = isMobile && mobileDetailOpen && !!selectedClient;

  return (
    <div className="flex-1 flex h-full bg-muted/30 overflow-hidden min-h-0">
      {/* ── Sidebar Left: Client List ────────────────── */}
      <div
        className={cn(
          'bg-card min-w-0 flex flex-col min-h-0 overflow-hidden',
          isMobile
            ? showMobileDetail
              ? 'hidden'
              : 'flex-1'
            : 'w-80 border-r border-border',
        )}
      >
        <PageHeader
          title="Clientes"
          icon={Users}
          className="px-4 py-4"
          actionContent={
            <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-9 w-9 p-0"
                onClick={() => setImportOpen(true)}
                title="Importar clientes"
              >
                <Upload className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-9 w-9 p-0"
                onClick={() => setExportOpen(true)}
                title="Exportar clientes"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={() => setNewDialogOpen(true)} title="Novo cliente">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          }
        />

        {/* Search */}
        <div className="shrink-0 p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar clientes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background glass shadow-sm"
            />
          </div>
        </div>

        {/* Selection bar */}
        {!isMobile && (
          <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
            <Button
              type="button"
              variant={isSelectionMode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                if (isSelectionMode) {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                } else {
                  setIsSelectionMode(true);
                }
              }}
            >
              <CheckSquare className="w-4 h-4" />
              {isSelectionMode ? 'Cancelar' : 'Selecionar'}
            </Button>
            {isSelectionMode && (
              <>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox checked={selectAllState} onCheckedChange={toggleSelectAll} />
                  <span>Todos</span>
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 ml-auto"
                  disabled={selectedIds.size === 0}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Excluir ({selectedIds.size})
                </Button>
              </>
            )}
          </div>
        )}

        {/* Client list */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overscroll-contain',
            isMobile && 'p-3 space-y-3 bg-muted/20',
          )}
        >
          {filteredClients.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum cliente encontrado.
            </p>
          )}
          {filteredClients.map((client) => {
            const isRowSelected = selectedIds.has(client.id);
            return (
              <div
                key={client.id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSelection(client.id);
                    return;
                  }
                  setSelectedClientId(client.id);
                  if (isMobile) setMobileDetailOpen(true);
                }}
                className={cn(
                  'flex items-center gap-3 p-3 cursor-pointer group transition-colors',
                  isMobile
                    ? 'rounded-2xl border border-border/70 bg-card shadow-sm hover:bg-card/90'
                    : 'border-b border-border hover:bg-muted/50',
                  isSelectionMode
                    ? isRowSelected
                      ? 'bg-primary/5'
                      : ''
                    : selectedClientId === client.id
                      ? 'bg-muted'
                      : '',
                )}
              >
                {isSelectionMode && (
                  <Checkbox
                    checked={isRowSelected}
                    onCheckedChange={() => toggleSelection(client.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {getInitials(client.primary_contact_name, client.company_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                      {client.company_name || client.primary_contact_name || 'Sem nome'}
                    </span>
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        getStageColor(client.current_stage_code),
                      )}
                    />
                  </div>
                  {client.primary_contact_name && client.company_name && (
                    <p className="text-xs text-muted-foreground truncate">{client.primary_contact_name}</p>
                  )}
                  <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {client.primary_phone || '-'}
                  </div>
                </div>
                {/* Hover actions */}
                {!isSelectionMode && !isMobile && (
                  <div className="flex items-center transition-opacity opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClientId(client.id);
                        setCommentsOpen(true);
                      }}
                      title="Comentários"
                    >
                      <MessageSquare className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClientToDelete(client);
                        setDeleteConfirmOpen(true);
                      }}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Panel: Client Detail ───────────────── */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-0 overflow-hidden min-w-0 bg-background',
          isMobile && (showMobileDetail ? '' : 'hidden'),
        )}
      >
        {/* Detail header */}
        <div className="shrink-0 px-4 py-4 sm:px-6 border-b border-border/50 bg-gradient-to-r from-background to-muted/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {isMobile && showMobileDetail && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setMobileDetailOpen(false)}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground truncate">Detalhes do Cliente</h2>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {selectedClient && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/50 shadow-sm h-10"
                onClick={() => setCommentsOpen(true)}
              >
                <MessageSquare className="w-4 h-4" />
                Comentários
              </Button>
            )}
            {selectedClient && hasChanges && (
              <Button onClick={() => void handleSave()} disabled={isSaving} size="sm" className="gap-2 shadow-sm h-10">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            )}
            {selectedClient && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 h-10"
                onClick={() => {
                  setClientToDelete(selectedClient);
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
            )}
          </div>
        </div>

        {selectedClient ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
            {/* Avatar + Name + Company + Stage */}
            <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-center">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {getInitials(selectedClient.primary_contact_name, selectedClient.company_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Input
                  value={formData.primary_contact_name}
                  onChange={(e) => handleFieldChange('primary_contact_name', e.target.value)}
                  className="text-xl font-semibold h-10 max-w-sm"
                  placeholder="Nome do contato"
                />
                <Input
                  value={formData.company_name}
                  onChange={(e) => handleFieldChange('company_name', e.target.value)}
                  className="text-muted-foreground max-w-sm"
                  placeholder="Empresa"
                />
                <Select
                  value={formData.current_stage_code}
                  onValueChange={(v) => handleFieldChange('current_stage_code', v)}
                >
                  <SelectTrigger
                    className={cn('w-fit text-white border-0', getStageColor(formData.current_stage_code))}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-60">
                    {stages.map((s) => (
                      <SelectItem key={s.stage_code} value={s.stage_code}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      value={formData.primary_phone}
                      onChange={(e) => handleFieldChange('primary_phone', e.target.value)}
                      placeholder="(DD) 90000-0000"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={formData.primary_email}
                      onChange={(e) => handleFieldChange('primary_email', e.target.value)}
                      placeholder="E-mail"
                      type="email"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Business data */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
                  Dados Comerciais
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Select
                      value={formData.source_channel}
                      onValueChange={(v) => handleFieldChange('source_channel', v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Origem" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Select
                      value={formData.lifecycle_status}
                      onValueChange={(v) => handleFieldChange('lifecycle_status', v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LIFECYCLE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
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
                value={formData.notes}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                placeholder="Anotações sobre o cliente..."
                rows={3}
              />
            </div>

            {/* Timeline */}
            <div className="mt-8">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
                Timeline
              </h4>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Cadastro: {selectedClient.updated_at ? new Date(selectedClient.updated_at).toLocaleDateString('pt-BR') : '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    Última interação:{' '}
                    {selectedClient.last_contact_at
                      ? `${new Date(selectedClient.last_contact_at).toLocaleDateString('pt-BR')} às ${new Date(selectedClient.last_contact_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="w-4 h-4" />
                  <span>{getDaysInStage(selectedClient.last_contact_at)} dias na etapa atual</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Selecione um cliente para ver os detalhes
          </div>
        )}
      </div>

      {/* ── Modals / Dialogs ────────────────────────── */}

      {/* New Client Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>Cadastre um novo cliente no CRM.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Input
                value={draft.company_name}
                onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Contato</Label>
              <Input
                value={draft.primary_contact_name}
                onChange={(e) => setDraft((d) => ({ ...d, primary_contact_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={draft.primary_phone}
                onChange={(e) => setDraft((d) => ({ ...d, primary_phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={draft.primary_email}
                onChange={(e) => setDraft((d) => ({ ...d, primary_email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select
                value={draft.source_channel}
                onValueChange={(v) => setDraft((d) => ({ ...d, source_channel: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={draft.lifecycle_status}
                onValueChange={(v) => setDraft((d) => ({ ...d, lifecycle_status: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LIFECYCLE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleCreateClient()} disabled={clients.upsertClientMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comments Modal */}
      <CrmClientCommentsModal
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        clientName={selectedClient?.company_name || selectedClient?.primary_contact_name || ''}
        notes={notes}
        isLoading={clients.notesQuery.isLoading}
        onAdd={handleAddNote}
        onDelete={handleDeleteNote}
        isAdding={clients.addNoteMutation.isPending}
      />

      {/* Import Modal */}
      <CrmImportClientsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImportClient}
      />

      {/* Export Modal */}
      <CrmExportClientsModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        clients={allClients}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir clientes selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai excluir {selectedIds.size} cliente(s). Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBulkDelete()}
              disabled={isBulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete single confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{clientToDelete?.company_name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (clientToDelete) void handleDeleteClient(clientToDelete.id);
                setDeleteConfirmOpen(false);
                setClientToDelete(null);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
