import React, { useState, useEffect, useMemo } from 'react';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { Phone, Video, Calendar, FileText, Home, Kanban, User, Zap, MapPin, Mail, X, Save, Loader2, MessageSquare } from 'lucide-react';
import { Conversation, PIPELINE_STAGES, PipelineStage, CHANNEL_INFO, Channel, ClientType, LeadTask } from '@/types/solarzap';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UpdateLeadData } from './EditLeadModal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { scopeProposalVersionByIdsQuery } from '@/lib/multiOrgLeadScoping';
import { resolveProposalLinks } from '@/utils/proposalLinks';

type LeadProposalItem = {
  proposal_version_id: string;
  status: string | null;
  created_at: string;
  version_no: number | null;
  pdf_url: string | null;
  share_url: string | null;
};

interface ActionsPanelProps {
  conversation: Conversation | null;
  showLeadNextAction?: boolean;
  nextAction?: LeadTask | null;
  lastAction?: LeadTask | null;
  actionHistory?: LeadTask[];
  leadNextActionLoading?: boolean;
  onCreateLeadNextAction?: (input: {
    leadId: number;
    title: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onUpdateLeadNextAction?: (input: {
    taskId: string;
    title?: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onCompleteLeadNextAction?: (task: LeadTask, resultSummary: string) => Promise<void>;
  onCancelLeadNextAction?: (taskId: string) => Promise<void>;
  onScheduleLeadNextAction?: (task: LeadTask) => void;
  onMoveToPipeline: (contactId: string, stage: PipelineStage) => Promise<void>;
  onAction: (action: string, contact?: Conversation['contact']) => void;
  onClose: () => void;
  onUpdateLead?: (contactId: string, data: UpdateLeadData) => Promise<void>;
  onToggleLeadFollowUp?: (params: { leadId: string; enabled: boolean }) => Promise<{ leadId: string; enabled: boolean }>;
}

const baseQuickActions = [
  { id: 'call', label: 'Ligar Agora', icon: Phone, color: 'bg-blue-500 hover:bg-blue-600' },
  { id: 'video_call', label: 'Vídeo Chamada', icon: Video, color: 'bg-cyan-500 hover:bg-cyan-600' },
  { id: 'schedule', label: 'Agendar Reunião', icon: Calendar, color: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'proposal', label: 'Gerar Proposta', icon: FileText, color: 'bg-primary hover:bg-primary/90' },
  { id: 'visit', label: 'Agendar Visita', icon: Home, color: 'bg-orange-500 hover:bg-orange-600' },
  { id: 'comments', label: 'Comentários', icon: MessageSquare, color: 'bg-secondary hover:bg-secondary/90' },
  { id: 'pipeline', label: 'Ver Pipeline', icon: Kanban, color: 'bg-indigo-500 hover:bg-indigo-600' },
];

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
];

export function ActionsPanel({
  conversation,
  showLeadNextAction = false,
  nextAction = null,
  lastAction = null,
  actionHistory = [],
  leadNextActionLoading = false,
  onCreateLeadNextAction,
  onUpdateLeadNextAction,
  onCompleteLeadNextAction,
  onCancelLeadNextAction,
  onScheduleLeadNextAction,
  onMoveToPipeline,
  onAction,
  onClose,
  onUpdateLead,
  onToggleLeadFollowUp,
}: ActionsPanelProps) {
  const { orgId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingFollowUp, setIsTogglingFollowUp] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState<UpdateLeadData & { canal?: Channel }>({});
  const { toast } = useToast();
  const quickActions = useMemo(() => baseQuickActions, []);

  const prevContactIdRef = React.useRef<string | null>(null);
  const [leadProposals, setLeadProposals] = useState<LeadProposalItem[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);

  // Reset form when conversation changes
  useEffect(() => {
    if (conversation?.contact) {
      const { contact } = conversation;
      const isSwitchingContact = prevContactIdRef.current !== contact.id;
      prevContactIdRef.current = contact.id;

      if (isSwitchingContact) {
        setHasChanges(false);
        setFormData({
          nome: contact.name,
          telefone: contact.phone,
          email: contact.email || '',
          empresa: contact.company || '',
          tipo_cliente: contact.clientType,
          consumo_kwh: contact.consumption,
          valor_estimado: contact.projectValue,
          status_pipeline: contact.pipelineStage,
          canal: contact.channel,
          endereco: contact.address || '',
          cidade: contact.city || '',
          cep: contact.zip || '',
          observacoes: contact.notes || '',
        });
      } else if (!hasChanges) {
        // Background update
        setFormData({
          nome: contact.name,
          telefone: contact.phone,
          email: contact.email || '',
          empresa: contact.company || '',
          tipo_cliente: contact.clientType,
          consumo_kwh: contact.consumption,
          valor_estimado: contact.projectValue,
          status_pipeline: contact.pipelineStage,
          canal: contact.channel,
          endereco: contact.address || '',
          cidade: contact.city || '',
          cep: contact.zip || '',
          observacoes: contact.notes || '',
        });
      }
    }
  }, [conversation, hasChanges]);

  useEffect(() => {
    const fetchLeadProposals = async () => {
      if (!conversation?.contact?.id) {
        setLeadProposals([]);
        return;
      }

      const leadIdNum = Number(conversation.contact.id);
      if (!Number.isFinite(leadIdNum)) {
        setLeadProposals([]);
        return;
      }

      if (!orgId) {
        setLeadProposals([]);
        return;
      }

      setIsLoadingProposals(true);
      try {
        // Use the dedicated get_lead_proposals RPC for efficiency
        const { data, error } = await supabase.rpc('get_lead_proposals', {
          p_org_id: orgId,
          p_lead_id: leadIdNum,
        });

        if (error) {
          // Fallback: direct query on proposal_versions
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('proposal_versions')
            .select('id, lead_id, version_no, created_at, status, premium_payload')
            .eq('org_id', orgId)
            .eq('lead_id', leadIdNum)
            .order('created_at', { ascending: false })
            .limit(5);

          if (fallbackError) throw fallbackError;

          const fallbackRows = (fallbackData || []).map((row: any) => {
            const links = resolveProposalLinks({
              premiumPayload: row.premium_payload || null,
              supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            });

            return {
              proposal_version_id: String(row.id || ''),
              status: row.status ? String(row.status) : null,
              created_at: String(row.created_at || ''),
              version_no: row.version_no ? Number(row.version_no) : null,
              pdf_url: links.pdfUrl,
              share_url: links.shareUrl,
            };
          });

          setLeadProposals(fallbackRows);
          return;
        }

        const rawRows = ((data || []) as any[]).slice(0, 5);
        const versionIds = rawRows
          .map((row) => String(row.proposal_version_id || row.id || ''))
          .filter(Boolean);

        const versionPayloadMap = new Map<string, Record<string, unknown> | null>();
        if (versionIds.length > 0) {
          const { data: versionRows } = await scopeProposalVersionByIdsQuery(
            (supabase
              .from('proposal_versions')
              .select('id, premium_payload')) as any,
            { proposalVersionIds: versionIds, orgId },
          );

          (versionRows || []).forEach((row: any) => {
            versionPayloadMap.set(String(row.id), (row.premium_payload as Record<string, unknown>) || null);
          });
        }

        const rows = rawRows.map((row) => {
            const versionId = String(row.proposal_version_id || row.id || '');
            const payloadFromVersion = versionPayloadMap.get(versionId) || null;
            const links = resolveProposalLinks({
              premiumPayload: payloadFromVersion || row.premium_payload || null,
              pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
              shareUrl: row.share_url ? String(row.share_url) : null,
              supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            });

            return {
              proposal_version_id: versionId,
              status: row.status ? String(row.status) : null,
              created_at: String(row.created_at || ''),
              version_no: row.version_no ? Number(row.version_no) : null,
              pdf_url: links.pdfUrl,
              share_url: links.shareUrl,
            };
          });

        setLeadProposals(rows);
      } catch (error) {
        console.error('Failed to load lead proposals in ActionsPanel:', error);
        setLeadProposals([]);
      } finally {
        setIsLoadingProposals(false);
      }
    };

    fetchLeadProposals();
  }, [conversation?.contact?.id, orgId]);

  if (!conversation) {
    return null;
  }

  const { contact } = conversation;
  // Fallback to 'novo_lead' if stage is invalid/missing
  const currentStageKey = formData.status_pipeline || contact.pipelineStage || 'novo_lead';
  const stage = PIPELINE_STAGES[currentStageKey] || PIPELINE_STAGES['novo_lead'];
  const followUpEnabled = contact.followUpEnabled !== false;

  const currentChannelKey = formData.canal || contact.channel || 'whatsapp';
  const channelInfo = CHANNEL_INFO[currentChannelKey] || CHANNEL_INFO['whatsapp'];

  const handleChange = (field: keyof (UpdateLeadData & { canal?: Channel }), value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleStageChange = (newStage: PipelineStage) => {
    handleChange('status_pipeline', newStage);
    // Don't call onMoveToPipeline immediately. Wait for Save.
  };

  const handleSave = async () => {
    if (!onUpdateLead) return;

    setIsSaving(true);
    try {
      // Check if pipeline stage changed
      const stageChanged = formData.status_pipeline && formData.status_pipeline !== contact.pipelineStage;

      const promises = [];

      // 1. Update general data
      // We always update data if there are changes, covering fields like name, phone, etc.
      // Even if only stage changed, updating the lead record is safe.
      promises.push(onUpdateLead(contact.id, formData));

      // 2. If stage changed, trigger the automation pipeline move
      if (stageChanged && formData.status_pipeline) {
        promises.push(onMoveToPipeline(contact.id, formData.status_pipeline));
      }

      await Promise.all(promises);

      setHasChanges(false);
      toast({
        title: "Dados atualizados!",
        description: "As alterações foram salvas.",
      });
    } catch (error) {
      console.error('Error saving lead:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAction = (actionId: string) => {
    onAction(actionId, contact);
  };

  const handleOpenGlobalProposals = () => {
    localStorage.setItem('solarzap_proposals_filter_lead_id', String(contact.id));
    onAction('proposals', contact);
  };

  const handleCopyProposalLink = async (url: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copiado',
        description: 'Link da proposta copiado para a área de transferência.',
      });
    } catch {
      toast({
        title: 'Erro ao copiar link',
        description: 'Não foi possível copiar o link.',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff < 7) return `${diff} dias atrás`;
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const handleToggleFollowUp = async (checked: boolean) => {
    if (!onToggleLeadFollowUp) return;

    setIsTogglingFollowUp(true);
    try {
      await onToggleLeadFollowUp({ leadId: contact.id, enabled: checked });
      toast({
        title: 'Follow-up atualizado',
        description: checked
          ? 'Follow Up Automático habilitado para este lead.'
          : 'Follow Up Automático desabilitado para este lead.',
      });
    } catch (error) {
      console.error('Error toggling follow-up from ActionsPanel:', error);
      toast({
        title: 'Erro ao atualizar follow-up',
        description: 'Não foi possível alterar a configuração do follow-up.',
        variant: 'destructive',
      });
    } finally {
      setIsTogglingFollowUp(false);
    }
  };

  return (
    <div className="h-full w-full border-l border-border bg-card overflow-y-auto custom-scrollbar sm:w-[340px]">
      {/* Header with close button */}
      <div className="p-4 bg-muted/50 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <span className="text-sm font-medium text-muted-foreground">STATUS</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving} size="sm" variant="default" className="gap-1 h-8">
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Salvar
            </Button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Current Stage */}
      <div className="px-4 pb-4 pt-2 border-b border-border space-y-3">
        <Badge className={`${stage.color} text-white text-sm px-3 py-1`}>
          {stage.icon} {stage.title}
        </Badge>
        {onToggleLeadFollowUp && (
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Follow Up Automático</p>
              <p className="text-[11px] text-muted-foreground">Opera independente da IA geral.</p>
            </div>
            <Switch
              checked={followUpEnabled}
              onCheckedChange={(checked) => {
                void handleToggleFollowUp(checked);
              }}
              disabled={isTogglingFollowUp}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">Ações Rápidas</h3>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="secondary"
                size="sm"
                data-testid={`quick-action-${action.id}`}
                className={`${action.color} text-white justify-start gap-2 h-10`}
                onClick={() => handleQuickAction(action.id)}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs">{action.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Client Info - Editable */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">Dados do Cliente</h3>

        <div className="space-y-3">
          {/* Avatar and Name */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-3xl flex-shrink-0">
              {contact.avatar || '👤'}
            </div>
            <div className="flex-1 space-y-1">
              <Input
                value={formData.nome || ''}
                onChange={(e) => handleChange('nome', e.target.value)}
                className="font-medium h-8"
                placeholder="Nome"
              />
              <Input
                value={formData.empresa || ''}
                onChange={(e) => handleChange('empresa', e.target.value)}
                className="text-sm h-7 text-muted-foreground"
                placeholder="Empresa"
              />
            </div>
          </div>

          <Separator />

          {/* Contact Details - Editable */}
          {/* Contact Details - Editable */}
          <div className="space-y-4 text-sm">
            {/* Canal - Now Editable & Truncated */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1 flex-shrink-0">
                <MessageSquare className="w-4 h-4" />
                Origin
              </span>
              <div className="flex-1 min-w-0">
                <Select
                  value={formData.canal}
                  onValueChange={(value) => handleChange('canal', value as Channel)}
                >
                  <SelectTrigger className="w-full h-7 text-xs px-2 truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-1 truncate">
                          {info.icon} {info.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">Telefone</span>
              <Input
                value={formatPhoneForDisplay(formData.telefone) || ''}
                onChange={(e) => handleChange('telefone', e.target.value)}
                className="text-right h-7 max-w-[160px]"
                placeholder="(DD) 00000-0000"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">E-mail</span>
              <Input
                value={formData.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                className="text-right h-7 max-w-[160px] text-xs"
                placeholder="E-mail"
              />
            </div>

            <Separator />

            {/* Address Fields */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1 flex-shrink-0">
                  <MapPin className="w-4 h-4" /> Endereço
                </span>
                <Input
                  value={formData.endereco || ''}
                  onChange={(e) => handleChange('endereco', e.target.value)}
                  className="text-right h-7 flex-1 min-w-0 text-xs"
                  placeholder="Rua, Bairro"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  value={formData.cidade || ''}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  className="h-7 flex-1 text-xs"
                  placeholder="Cidade"
                />
                <Input
                  value={formData.cep || ''}
                  onChange={(e) => handleChange('cep', e.target.value)}
                  className="h-7 w-20 text-xs"
                  placeholder="CEP"
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1 flex-shrink-0">
                <Zap className="w-4 h-4" /> Consumo
              </span>
              <div className="flex items-center gap-1">
                <Input
                  value={formData.consumo_kwh || ''}
                  onChange={(e) => handleChange('consumo_kwh', parseFloat(e.target.value) || 0)}
                  className="text-right h-7 w-20"
                  type="number"
                />
                <span className="text-xs text-muted-foreground">kWh</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">Tipo</span>
              <div className="flex-1 min-w-0 ml-2">
                <Select
                  value={formData.tipo_cliente}
                  onValueChange={(value) => handleChange('tipo_cliente', value as ClientType)}
                >
                  <SelectTrigger className="w-full h-7 text-xs px-2">
                    <SelectValue />
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

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0 text-xs">Valor Est.</span>
              <div className="flex items-center gap-1">
                <span className="text-xs">R$</span>
                <Input
                  value={formData.valor_estimado || ''}
                  onChange={(e) => handleChange('valor_estimado', parseFloat(e.target.value) || 0)}
                  className="text-right h-7 w-24 text-primary font-bold"
                  type="number"
                />
              </div>
            </div>

            <Separator />

            {/* Observações */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground block">Observações</span>
              <textarea
                value={formData.observacoes || ''}
                onChange={(e) => handleChange('observacoes', e.target.value)}
                className="w-full text-xs bg-muted/30 border-border rounded p-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Anotações..."
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Último contato</span>
              <span className="text-foreground">{formatDate(contact.lastContact)}</span>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Propostas deste Lead</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleOpenGlobalProposals}>
                  Ver Todas
                </Button>
              </div>

              {isLoadingProposals && (
                <p className="text-xs text-muted-foreground">Carregando propostas...</p>
              )}

              {!isLoadingProposals && leadProposals.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma proposta encontrada para este lead.</p>
              )}

              {!isLoadingProposals && leadProposals.length > 0 && (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-2" data-testid="lead-proposals-scroll">
                  {leadProposals.map((proposal) => (
                    <div key={proposal.proposal_version_id} className="rounded-md border border-border p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">V{proposal.version_no || 1}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {proposal.status || '—'}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {proposal.created_at ? new Date(proposal.created_at).toLocaleString('pt-BR') : 'Sem data'}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          disabled={!proposal.pdf_url}
                          onClick={() => proposal.pdf_url && window.open(proposal.pdf_url, '_blank')}
                        >
                          Ver PDF
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          disabled={!proposal.share_url && !proposal.pdf_url}
                          onClick={() => handleCopyProposalLink(proposal.share_url || proposal.pdf_url)}
                        >
                          Copiar Link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Move - Full Dropdown */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Mover para</h3>
        <Select
          value={formData.status_pipeline}
          onValueChange={(value) => handleStageChange(value as PipelineStage)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione a etapa" />
          </SelectTrigger>
          <SelectContent className="bg-popover max-h-80">
            {Object.entries(PIPELINE_STAGES).map(([key, stageInfo]) => (
              <SelectItem
                key={key}
                value={key}
                disabled={key === formData.status_pipeline}
              >
                <span className="flex items-center gap-2">
                  <span>{stageInfo.icon}</span>
                  <span>{stageInfo.title}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
