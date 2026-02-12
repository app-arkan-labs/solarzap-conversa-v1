import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Contact, PIPELINE_STAGES, PipelineStage, ClientType } from '@/types/solarzap';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, Phone, Mail, MapPin, Zap, DollarSign, Calendar, Clock, Timer, Save, Loader2, MessageSquare, Upload, Download, Trash2, Bot, UserCog } from 'lucide-react';
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
import { useAISettings } from '@/hooks/useAISettings'; // New Import

import { ImportContactsModal, ImportedContact } from './ImportContactsModal';
import { ExportContactsModal } from './ExportContactsModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ContactsViewProps {
  contacts: Contact[];
  onUpdateLead?: (contactId: string, data: UpdateLeadData) => Promise<void>;
  onImportContacts?: (contacts: ImportedContact[]) => Promise<unknown>;
  onDeleteLead?: (contactId: string) => Promise<void>;
  onToggleLeadAi?: (params: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => Promise<{ leadId: string; enabled: boolean }>;
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
];

export function ContactsView({ contacts, onUpdateLead, onImportContacts, onDeleteLead, onToggleLeadAi }: ContactsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0] || null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();
  const { settings: aiSettings } = useAISettings(); // Get Global Settings

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  // Modal states
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Form state for inline editing
  const [formData, setFormData] = useState<UpdateLeadData>({});

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

  const handleChange = (field: keyof UpdateLeadData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
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

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="flex-1 flex h-full bg-muted/30">
      {/* Left Sidebar - Contact List */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        {/* Premium Header */}
        <div className="bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 px-4 py-4 flex items-center justify-between shadow-sm border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Contatos</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1 h-8"
              onClick={() => setImportModalOpen(true)}
              title="Importar contatos"
            >
              <Upload className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1 h-8"
              onClick={() => setExportModalOpen(true)}
              title="Exportar contatos"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar contatos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-auto">
          {filteredContacts.map(contact => (
            <div
              key={contact.id}
              onClick={() => setSelectedContact(contact)}
              className={`
                flex items-center gap-3 p-3 cursor-pointer border-b border-border group
                hover:bg-muted/50 transition-colors
                ${selectedContact?.id === contact.id ? 'bg-muted' : ''}
              `}
            >
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
              </div>
              {/* Buttons on hover */}
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
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
                    className="h-7 w-7 hover:bg-destructive/10"
                    onClick={(e) => handleDeleteClick(contact, e)}
                    title="Excluir Contato"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Detail Header */}
        <div className="px-6 py-4 border-b border-border/50 bg-gradient-to-r from-background to-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Detalhes do Contato</h2>
            {selectedContact && onToggleLeadAi && (
              <div className={cn(
                "ml-4 flex items-center gap-2 px-3 py-1 bg-background/50 rounded-lg border border-border/50",
                !aiSettings?.is_active && "opacity-70"
              )}
                title={!aiSettings?.is_active ? "IA Global Desativada" : ""}
              >
                <Switch
                  checked={selectedContact.aiEnabled !== false}
                  onCheckedChange={(checked) => onToggleLeadAi({ leadId: selectedContact.id, enabled: checked })}
                  className="data-[state=checked]:bg-green-600"
                  disabled={!aiSettings?.is_active} // Disable if Global OFF
                />
                <div className="flex items-center gap-1.5">
                  {!aiSettings?.is_active ? (
                    <Bot className="w-4 h-4 text-slate-400" />
                  ) : selectedContact.aiEnabled !== false ? (
                    <Bot className="w-4 h-4 text-green-600" />
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
          <div className="flex items-center gap-2">
            {selectedContact && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/50 shadow-sm"
                onClick={() => setCommentsModalOpen(true)}
              >
                <MessageSquare className="w-4 h-4" />
                Comentários
              </Button>
            )}
            {selectedContact && hasChanges && (
              <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-2 shadow-sm">
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
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                onClick={(e) => handleDeleteClick(selectedContact, e)}
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
            )}
          </div>
        </div>

        {selectedContact ? (
          <div className="flex-1 overflow-auto p-6">
            {/* Contact Header */}
            <div className="flex items-center gap-4 mb-8">
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
                  onValueChange={(value) => handleChange('status_pipeline', value as PipelineStage)}
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
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                    <div className="flex-1 grid grid-cols-2 gap-2">
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
