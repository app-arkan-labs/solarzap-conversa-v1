import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
};

export function InternalCrmConversationList(props: InternalCrmConversationListProps) {
  const normalizedSearch = props.search.trim().toLowerCase();

  const filteredConversations = props.conversations.filter((conversation) => {
    if (!normalizedSearch) return true;
    return (
      String(conversation.client_company_name || '').toLowerCase().includes(normalizedSearch) ||
      String(conversation.primary_phone || '').toLowerCase().includes(normalizedSearch) ||
      String(conversation.last_message_preview || '').toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Buscar por cliente, telefone ou texto"
          />
        </div>

        <Select value={props.status} onValueChange={props.onStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="open">Abertas</SelectItem>
            <SelectItem value="resolved">Resolvidas</SelectItem>
            <SelectItem value="archived">Arquivadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="h-[560px] rounded-2xl border border-border/70">
        <div className="space-y-2 p-2">
          {filteredConversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Nenhuma conversa encontrada.
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const isActive = conversation.id === props.selectedConversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isActive
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/70 bg-background hover:border-primary/25 hover:bg-muted/30'
                  }`}
                  onClick={() => props.onSelectConversation(conversation.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{conversation.client_company_name || 'Cliente'}</p>
                      <p className="truncate text-xs text-muted-foreground">{conversation.primary_phone || '-'}</p>
                    </div>
                    <TokenBadge token={conversation.status} />
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{conversation.last_message_preview || '-'}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(conversation.last_message_at)}</p>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
