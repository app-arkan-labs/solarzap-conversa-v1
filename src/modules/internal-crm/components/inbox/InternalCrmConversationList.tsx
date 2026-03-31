import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { InternalCrmConversationSummary } from '@/modules/internal-crm/types';

type InternalCrmConversationListProps = {
  conversations: InternalCrmConversationSummary[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  isLoading?: boolean;
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Abertas' },
  { value: 'resolved', label: 'Resolvidas' },
  { value: 'archived', label: 'Arquivadas' },
  { value: 'all', label: 'Todas' },
] as const;

function formatConversationTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const oneDay = 86400000;

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
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function InternalCrmConversationList(props: InternalCrmConversationListProps) {
  const normalizedSearch = props.search.trim().toLowerCase();

  const filteredConversations = props.conversations.filter((conversation) => {
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
    <div className="flex h-full min-h-0 flex-col border-r border-border/40">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 rounded-lg border-border/50 bg-muted/40 pl-9 text-sm"
            value={props.search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder="Buscar conversa..."
          />
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 px-3 pb-2">
        {STATUS_OPTIONS.map((option) => {
          const isActive = props.status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
              onClick={() => props.onStatusChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Conversation list */}
      <ScrollArea className="min-h-0 flex-1">
        {props.isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
        ) : (
          filteredConversations.map((conversation) => {
            const isActive = conversation.id === props.selectedConversationId;
            const name = getDisplayName(conversation);
            const unread = Number(conversation.unread_count || 0);

            return (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
                  isActive ? 'bg-primary/8' : 'hover:bg-muted/40',
                )}
                onClick={() => props.onSelectConversation(conversation.id)}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                    getAvatarColor(name),
                  )}
                >
                  {getAvatarInitial(name)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn('truncate text-sm', unread > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground')}>
                      {name}
                    </p>
                    <span className={cn('shrink-0 text-[11px]', unread > 0 ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                      {formatConversationTime(conversation.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn('truncate text-xs', unread > 0 ? 'font-medium text-foreground/80' : 'text-muted-foreground')}>
                      {conversation.last_message_preview || 'Sem mensagens'}
                    </p>
                    {unread > 0 ? (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {unread}
                      </span>
                    ) : null}
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
