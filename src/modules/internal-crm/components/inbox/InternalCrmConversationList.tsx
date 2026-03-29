import { Inbox, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
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

function humanizeToken(value: string | null | undefined) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatConversationTime(value: string | null | undefined) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getConversationIdentity(conversation: InternalCrmConversationSummary) {
  return conversation.client_company_name || conversation.primary_contact_name || conversation.primary_phone || 'Cliente';
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
      String(conversation.subject || '').toLowerCase().includes(normalizedSearch) ||
      String(conversation.last_message_preview || '').toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/95">
      <div className="border-b border-border/70 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Inbox className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Conversas</p>
            <p className="text-xs text-muted-foreground">{props.conversations.length} conversa(s) no funil interno.</p>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-2xl border-border/70 pl-9"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Buscar empresa, telefone, email ou assunto"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => {
            const isActive = props.status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  isActive
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/70 bg-background text-muted-foreground hover:border-primary/20 hover:text-foreground',
                )}
                onClick={() => props.onStatusChange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border/60">
          {props.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando conversas internas...</div>
          ) : null}

          {!props.isLoading && filteredConversations.length === 0 ? (
            <div className="p-4">
              <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
                Nenhuma conversa encontrada para o filtro atual.
              </div>
            </div>
          ) : null}

          {filteredConversations.map((conversation) => {
            const isActive = conversation.id === props.selectedConversationId;
            const identity = getConversationIdentity(conversation);
            const unreadCount = Number(conversation.unread_count || 0);

            return (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'w-full px-4 py-4 text-left transition',
                  isActive ? 'bg-primary/5' : 'hover:bg-muted/30',
                )}
                onClick={() => props.onSelectConversation(conversation.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold',
                      isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border/70 bg-background text-foreground',
                    )}
                  >
                    {identity.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{identity}</p>
                          {unreadCount > 0 ? (
                            <Badge className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white hover:bg-rose-500">
                              {unreadCount}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {conversation.primary_contact_name || conversation.primary_phone || conversation.primary_email || '-'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[11px] font-medium text-muted-foreground">{formatConversationTime(conversation.last_message_at)}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(conversation.last_message_at)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <TokenBadge token={conversation.status} label={humanizeToken(conversation.status)} />
                      <TokenBadge token={conversation.channel} label={conversation.channel === 'manual_note' ? 'Nota interna' : 'WhatsApp'} />
                      {conversation.current_stage_code ? (
                        <TokenBadge token={conversation.current_stage_code} label={humanizeToken(conversation.current_stage_code)} />
                      ) : null}
                      {conversation.lifecycle_status ? (
                        <TokenBadge token={conversation.lifecycle_status} label={humanizeToken(conversation.lifecycle_status)} />
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                      {conversation.subject || conversation.last_message_preview || 'Sem mensagens recentes registradas.'}
                    </p>

                    {conversation.next_action ? (
                      <p className="mt-2 truncate text-[11px] font-medium text-sky-700">
                        Próxima ação: {conversation.next_action}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
