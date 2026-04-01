import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneCall,
  Video,
  Calendar,
  Kanban,
  MapPin,
  X,
  Save,
  Loader2,
  MessageSquare,
  CalendarClock,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import {
  getInternalCrmStageMeta,
  normalizeInternalCrmStageCode,
} from '@/modules/internal-crm/components/pipeline/stageCatalog';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
} from '@/modules/internal-crm/types';

// --- Quick Action buttons (adapted - no solar references) ---
const quickActions = [
  { id: 'call', label: 'Ligar Agora', icon: Phone, color: 'bg-blue-500 hover:bg-blue-600' },
  { id: 'video_call', label: 'Vídeo Chamada', icon: Video, color: 'bg-cyan-500 hover:bg-cyan-600' },
  { id: 'schedule', label: 'Agendar Reunião', icon: Calendar, color: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'schedule_call', label: 'Agendar Chamada', icon: PhoneCall, color: 'bg-orange-500 hover:bg-orange-600' },
  { id: 'comments', label: 'Comentários', icon: MessageSquare, color: 'bg-secondary hover:bg-secondary/90' },
  { id: 'pipeline', label: 'Ver Pipeline', icon: Kanban, color: 'bg-indigo-500 hover:bg-indigo-600' },
];

type ClientFormData = {
  company_name: string;
  primary_contact_name: string;
  primary_phone: string;
  primary_email: string;
  notes: string;
  endereco: string;
  cidade: string;
  cep: string;
};

type InternalCrmActionsPanelFullProps = {
  conversation: InternalCrmConversationSummary | null;
  detail: InternalCrmClientDetail | null;
  onScheduleMeeting: () => void;
  onScheduleCall: () => void;
  onOpenComments: () => void;
  onNavigatePipeline: () => void;
  onSaveClient?: (fields: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
};

function normalizeAppointments(detail: InternalCrmClientDetail | null) {
  return (detail?.appointments || []).map((appointment, index) => {
    const r = appointment as Record<string, unknown>;
    return {
      id: String(r.id || `apt-${index}`),
      title: String(r.title || 'Compromisso'),
      status: String(r.status || 'scheduled'),
      startAt: typeof r.start_at === 'string' ? r.start_at : null,
    };
  });
}

export function InternalCrmActionsPanelFull(props: InternalCrmActionsPanelFullProps) {
  const { toast } = useToast();
  const detail = props.detail;
  const openTasks = (detail?.tasks || []).filter((t) => t.status === 'open');
  const appointments = normalizeAppointments(detail);
  const client = detail?.client;

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>({
    company_name: '',
    primary_contact_name: '',
    primary_phone: '',
    primary_email: '',
    notes: '',
    endereco: '',
    cidade: '',
    cep: '',
  });
  const prevClientIdRef = useRef<string | null>(null);

  // Reset form when conversation/client changes
  useEffect(() => {
    const clientId = client?.id || props.conversation?.client_id || null;
    const isSwitching = prevClientIdRef.current !== clientId;
    prevClientIdRef.current = clientId;

    if (isSwitching || !hasChanges) {
      const meta = (client?.metadata || {}) as Record<string, unknown>;
      setFormData({
        company_name: client?.company_name || props.conversation?.client_company_name || '',
        primary_contact_name: client?.primary_contact_name || props.conversation?.primary_contact_name || '',
        primary_phone: client?.primary_phone || props.conversation?.primary_phone || '',
        primary_email: client?.primary_email || props.conversation?.primary_email || '',
        notes: client?.notes || '',
        endereco: String(meta.endereco || ''),
        cidade: String(meta.cidade || ''),
        cep: String(meta.cep || ''),
      });
      if (isSwitching) setHasChanges(false);
    }
  }, [client, props.conversation, hasChanges]);

  if (!props.conversation) {
    return null;
  }

  const stageCode = normalizeInternalCrmStageCode(props.conversation.current_stage_code || 'novo_lead');
  const stage = getInternalCrmStageMeta(stageCode);

  const handleChange = (field: keyof ClientFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!props.onSaveClient) return;
    const clientId = client?.id || props.conversation?.client_id;
    if (!clientId) return;

    setIsSaving(true);
    try {
      await props.onSaveClient({ ...formData });
      setHasChanges(false);
      toast({ title: 'Dados atualizados!', description: 'As alterações foram salvas.' });
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar as alterações.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAction = (actionId: string) => {
    if (actionId === 'call') {
      const phone = client?.primary_phone || props.conversation?.primary_phone;
      if (phone) window.open(`tel:${phone}`);
    } else if (actionId === 'video_call') {
      // Open Google Meet
      window.open('https://meet.google.com/new', '_blank');
    } else if (actionId === 'schedule') {
      props.onScheduleMeeting();
    } else if (actionId === 'schedule_call') {
      props.onScheduleCall();
    } else if (actionId === 'comments') {
      props.onOpenComments();
    } else if (actionId === 'pipeline') {
      props.onNavigatePipeline();
    }
  };

  return (
    <div className="h-full w-full border-l border-border bg-card overflow-y-auto custom-scrollbar sm:w-[340px]">
      {/* Header with 🔥 STATUS and close button — identical to SolarZap */}
      <div className="p-4 bg-muted/50 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <span className="text-sm font-medium text-muted-foreground">STATUS</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving} size="sm" variant="default" className="gap-1 h-8">
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvar
            </Button>
          )}
          <button
            onClick={props.onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Current Stage Badge */}
      <div className="px-4 pb-4 pt-2 border-b border-border space-y-3">
        <Badge className="text-white text-sm px-3 py-1 border-0" style={{ backgroundColor: stage?.color || '#2196F3' }}>
          {stage?.icon || '●'} {stage?.label || 'Novo Lead'}
        </Badge>
      </div>

      {/* Quick Actions — 2-col grid, same as SolarZap */}
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

      {/* Client Info — Editable, same layout as SolarZap */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">Dados do Cliente</h3>
        <div className="space-y-3">
          {/* Avatar and Name */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-3xl flex-shrink-0">
              👤
            </div>
            <div className="flex-1 space-y-1">
              <Input
                value={formData.company_name}
                onChange={(e) => handleChange('company_name', e.target.value)}
                className="font-medium h-8"
                placeholder="Nome / Empresa"
              />
              <Input
                value={formData.primary_contact_name}
                onChange={(e) => handleChange('primary_contact_name', e.target.value)}
                className="text-sm h-7 text-muted-foreground"
                placeholder="Contato"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">Telefone</span>
              <Input
                value={formData.primary_phone}
                onChange={(e) => handleChange('primary_phone', e.target.value)}
                className="text-right h-7 max-w-[160px]"
                placeholder="(DD) 00000-0000"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex-shrink-0">E-mail</span>
              <Input
                value={formData.primary_email}
                onChange={(e) => handleChange('primary_email', e.target.value)}
                className="text-right h-7 max-w-[160px] text-xs"
                placeholder="E-mail"
              />
            </div>

            <Separator />

            {/* Address */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1 flex-shrink-0">
                  <MapPin className="w-4 h-4" /> Endereço
                </span>
                <Input
                  value={formData.endereco}
                  onChange={(e) => handleChange('endereco', e.target.value)}
                  className="text-right h-7 flex-1 min-w-0 text-xs"
                  placeholder="Rua, Bairro"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  value={formData.cidade}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  className="h-7 flex-1 text-xs"
                  placeholder="Cidade"
                />
                <Input
                  value={formData.cep}
                  onChange={(e) => handleChange('cep', e.target.value)}
                  className="h-7 w-20 text-xs"
                  placeholder="CEP"
                />
              </div>
            </div>

            <Separator />

            {/* Observações */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground block">Observações</span>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="w-full text-xs bg-muted/30 border-border rounded p-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Anotações..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground">Tarefas</p>
        </div>
        {openTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem tarefas abertas.</p>
        ) : (
          <div className="space-y-2">
            {openTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">{task.title}</p>
                {task.due_at ? <p className="mt-0.5 text-muted-foreground">{formatDateTime(task.due_at)}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calendar / Agenda */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground">Agenda</p>
        </div>
        {appointments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum compromisso agendado.</p>
        ) : (
          <div className="space-y-2">
            {appointments.slice(0, 4).map((apt) => (
              <div key={apt.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">{apt.title}</p>
                {apt.startAt ? <p className="mt-0.5 text-muted-foreground">{formatDateTime(apt.startAt)}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
