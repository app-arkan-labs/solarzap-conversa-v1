import { ChevronDown, MessageSquare, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getInternalCrmStageMeta } from '@/modules/internal-crm/components/pipeline/stageCatalog';
import { resolveInternalCrmPipelineStageView } from '@/modules/internal-crm/lib/inboxStage';
import type {
  InternalCrmConversationSummary,
  InternalCrmWhatsappInstance,
} from '@/modules/internal-crm/types';

type InternalCrmConversationListProps = {
  conversations: InternalCrmConversationSummary[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  stageFilter: string;
  onStageFilterChange: (value: string) => void;
  instanceFilter: string;
  onInstanceFilterChange: (value: string) => void;
  instances: InternalCrmWhatsappInstance[];
  isLoading?: boolean;
};

function formatConversationTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const oneDay = 86_400_000;

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  if (diffMs < oneDay * 2 && new Date(now.getTime() - oneDay).toDateString() === date.toDateString()) {
    return 'Ontem';
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getDisplayName(conversation: InternalCrmConversationSummary) {
  return conversation.client_company_name || conversation.primary_contact_name || conversation.primary_phone || 'Cliente';
}

function getAvatarInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500',
    'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function InternalCrmConversationList(props: InternalCrmConversationListProps) {
  const normalizedSearch = props.search.trim().toLowerCase();
  const stageOptions = [
    { value: 'all', label: 'Todas as etapas' },
    ...Array.from(new Set(props.conversations
      .map((conversation) => resolveInternalCrmPipelineStageView({ conversation }).code)
      .filter(Boolean)))
      .map((stageCode) => ({
        value: stageCode,
        label: getInternalCrmStageMeta(stageCode)?.label || stageCode,
      })),
  ];

  const instanceOptions = [
    { value: 'all', label: 'Todas instancias' },
    ...props.instances.map((instance) => ({
      value: instance.id,
      label: instance.display_name || instance.instance_name,
    })),
  ];

  const filteredConversations = props.conversations
    .filter((conversation) => conversation.status !== 'archived')
    .filter((conversation) => {
      if (props.stageFilter === 'all') return true;
      return resolveInternalCrmPipelineStageView({ conversation }).code === props.stageFilter;
    })
    .filter((conversation) => {
      if (props.instanceFilter === 'all') return true;
      return String(conversation.whatsapp_instance_id || '') === props.instanceFilter;
    })
    .filter((conversation) => {
      if (!normalizedSearch) return true;
      return (
        String(conversation.client_company_name || '').toLowerCase().includes(normalizedSearch) ||
        String(conversation.primary_contact_name || '').toLowerCase().includes(normalizedSearch) ||
        String(conversation.primary_phone || '').toLowerCase().includes(normalizedSearch) ||
        String(conversation.primary_email || '').toLowerCase().includes(normalizedSearch) ||
        String(conversation.last_message_preview || '').toLowerCase().includes(normalizedSearch)
      );
    });

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card" data-testid="crm-inbox-list">
      <div className="border-b border-border/70 bg-[linear-gradient(120deg,hsl(var(--primary)/0.12),transparent_30%,hsl(var(--secondary)/0.10)_100%)] px-3 pb-3 pt-3">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-foreground">SolarZap</span>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-xl border-border/60 bg-background/80 pl-9 text-sm"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Pesquisar"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={props.stageFilter} onValueChange={props.onStageFilterChange}>
            <SelectTrigger className="h-9 min-w-0 flex-1 rounded-lg bg-background text-xs">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              {stageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={props.instanceFilter} onValueChange={props.onInstanceFilterChange}>
            <SelectTrigger className="h-9 min-w-0 flex-1 rounded-lg bg-background text-xs">
              <SelectValue placeholder="Instancia" />
            </SelectTrigger>
            <SelectContent>
              {instanceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="button"
          className="mt-3 flex h-10 w-full items-center justify-between rounded-xl border border-border/60 bg-background px-3 text-sm"
        >
          <span className="font-medium">Meus leads</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {props.isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando conversas...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
        ) : (
          filteredConversations.map((conversation) => {
            const isActive = conversation.id === props.selectedConversationId;
            const name = getDisplayName(conversation);
            const unread = Number(conversation.unread_count || 0);
            const stage = resolveInternalCrmPipelineStageView({ conversation });

            return (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'w-full border-b border-border/40 px-4 py-3.5 text-left transition-colors',
                  isActive ? 'bg-primary/8' : 'hover:bg-muted/35',
                )}
                onClick={() => props.onSelectConversation(conversation.id)}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                      getAvatarColor(name),
                    )}
                  >
                    {getAvatarInitial(name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('truncate text-sm', unread > 0 ? 'font-bold' : 'font-semibold')}>
                        {name}
                      </p>
                      <span className={cn('shrink-0 text-[11px]', unread > 0 ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                        {formatConversationTime(conversation.last_message_at)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className={cn('truncate text-xs', unread > 0 ? 'font-medium text-foreground/90' : 'text-muted-foreground')}>
                        {conversation.last_message_preview || 'Sem mensagens recentes'}
                      </p>
                      {unread > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {unread}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <span
                        className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: stage.color }}
                      >
                        {stage.label}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}
