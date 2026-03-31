import { useEffect, useRef, useMemo } from 'react';
import { Archive, ArrowLeft, Check, CheckCheck, Clock, PanelRightOpen, Paperclip, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { InternalCrmMessageComposer } from '@/modules/internal-crm/components/inbox/InternalCrmMessageComposer';
import type {
  InternalCrmConversationSummary,
  InternalCrmMessage,
  InternalCrmWhatsappInstance,
} from '@/modules/internal-crm/types';

type InternalCrmChatAreaProps = {
  conversation: InternalCrmConversationSummary | null;
  messages: InternalCrmMessage[];
  instance: InternalCrmWhatsappInstance | null;
  messageBody: string;
  onMessageBodyChange: (value: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
  isUpdatingStatus?: boolean;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
  onOpenActions: () => void;
  onBack: () => void;
};

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function DeliveryIcon({ status }: { status: string }) {
  switch (status) {
    case 'read':
      return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
    case 'delivered':
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/70" />;
    case 'sent':
      return <Check className="h-3.5 w-3.5 text-muted-foreground/70" />;
    case 'failed':
      return <span className="text-[10px] text-destructive">!</span>;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground/50" />;
  }
}

function getDisplayName(c: InternalCrmConversationSummary) {
  return c.client_company_name || c.primary_contact_name || c.primary_phone || 'Cliente';
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

export function InternalCrmChatArea(props: InternalCrmChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canResolve = props.conversation && props.conversation.status !== 'resolved';
  const canArchive = props.conversation && props.conversation.status !== 'archived';

  // Group messages by date for separators
  const messagesWithSeparators = useMemo(() => {
    const result: Array<{ type: 'separator'; label: string } | { type: 'message'; message: InternalCrmMessage }> = [];
    let lastDate = '';
    for (const msg of props.messages) {
      const dateLabel = formatDateLabel(msg.created_at);
      if (dateLabel && dateLabel !== lastDate) {
        result.push({ type: 'separator', label: dateLabel });
        lastDate = dateLabel;
      }
      result.push({ type: 'message', message: msg });
    }
    return result;
  }, [props.messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [props.messages.length]);

  if (!props.conversation) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Selecione uma conversa para visualizar o histórico.
      </div>
    );
  }

  const name = getDisplayName(props.conversation);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-card px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={props.onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', getAvatarColor(name))}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {props.conversation.primary_phone || props.conversation.primary_email || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canResolve ? (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => props.onUpdateStatus('resolved')} disabled={props.isUpdatingStatus}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Resolver
            </Button>
          ) : null}
          {canArchive ? (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => props.onUpdateStatus('archived')} disabled={props.isUpdatingStatus}>
              <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" className="h-8 w-8 xl:hidden" onClick={props.onOpenActions}>
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages area with WhatsApp pattern background */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto chat-bg-pattern custom-scrollbar">
        <div className="flex flex-col gap-1 px-4 py-4 max-w-3xl mx-auto">
          {messagesWithSeparators.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhuma mensagem nesta conversa.
            </div>
          ) : (
            messagesWithSeparators.map((item, idx) => {
              if (item.type === 'separator') {
                return (
                  <div key={`sep-${idx}`} className="flex justify-center my-3">
                    <span className="rounded-lg bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                      {item.label}
                    </span>
                  </div>
                );
              }

              const msg = item.message;
              const isOutbound = msg.direction === 'outbound';
              const isSystem = msg.direction === 'system';
              const isNote = msg.message_type === 'note';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="rounded-lg bg-zinc-800/90 px-3 py-1.5 text-[11px] text-zinc-200 shadow-sm max-w-[85%] text-center">
                      {msg.body || '-'}
                    </span>
                  </div>
                );
              }

              if (isNote) {
                return (
                  <div key={msg.id} className="flex justify-center my-2 max-w-[75%] mx-auto">
                    <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 w-full">
                      <div className="flex items-center gap-1.5 mb-1">
                        <StickyNote className="h-3 w-3" />
                        <span className="font-medium">Nota interna</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{msg.body || '-'}</p>
                      <p className="mt-1.5 text-[10px] opacity-70 text-right">{formatMessageTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'relative max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm',
                      isOutbound
                        ? 'bg-chat-sent text-foreground rounded-tr-none'
                        : 'bg-chat-received text-foreground rounded-tl-none',
                    )}
                  >
                    {msg.attachment_url ? (
                      <a
                        href={msg.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                      >
                        <Paperclip className="h-3 w-3" /> Anexo
                      </a>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{msg.body || '-'}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] opacity-60">{formatMessageTime(msg.created_at)}</span>
                      {isOutbound ? <DeliveryIcon status={msg.delivery_status} /> : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/40 bg-card p-3">
        <InternalCrmMessageComposer
          value={props.messageBody}
          onValueChange={props.onMessageBodyChange}
          onSend={props.onSendMessage}
          disabled={props.isSending}
          placeholder="Digite uma mensagem..."
        />
      </div>
    </div>
  );
}
