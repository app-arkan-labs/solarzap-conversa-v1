import { Archive, ArrowLeft, CheckCheck, Loader2, PanelRightOpen, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
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

export function InternalCrmChatArea(props: InternalCrmChatAreaProps) {
  const canResolve = props.conversation && props.conversation.status !== 'resolved';
  const canArchive = props.conversation && props.conversation.status !== 'archived';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/95">
      <div className="border-b border-border/70 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-2xl lg:hidden" onClick={props.onBack}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Voltar para a lista</span>
              </Button>
              <div>
                <p className="truncate text-sm font-semibold text-foreground">
                  {props.conversation?.client_company_name || props.conversation?.primary_contact_name || 'Selecione uma conversa'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {props.conversation?.primary_phone || props.conversation?.primary_email || props.conversation?.subject || '-'}
                </p>
              </div>
            </div>

            {props.conversation ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <TokenBadge token={props.conversation.status} label={props.conversation.status} />
                <TokenBadge token={props.conversation.channel} label={props.conversation.channel === 'manual_note' ? 'Nota interna' : 'WhatsApp'} />
                {props.instance ? <TokenBadge token={props.instance.status} label={props.instance.display_name} /> : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canResolve ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onUpdateStatus('resolved')}
                disabled={props.isUpdatingStatus}
              >
                {props.isUpdatingStatus ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1.5 h-4 w-4" />}
                Resolver
              </Button>
            ) : null}
            {canArchive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onUpdateStatus('archived')}
                disabled={props.isUpdatingStatus}
              >
                <Archive className="mr-1.5 h-4 w-4" />
                Arquivar
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="xl:hidden" onClick={props.onOpenActions}>
              <PanelRightOpen className="mr-1.5 h-4 w-4" />
              Ações
            </Button>
          </div>
        </div>
      </div>

      {props.conversation ? (
        <>
          <ScrollArea className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_42%),linear-gradient(to_bottom,_rgba(248,250,252,0.96),_rgba(248,250,252,0.98))]">
            <div className="space-y-3 px-4 py-5">
              {props.messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border/70 bg-background/80 p-5 text-sm text-muted-foreground">
                  Ainda nao há mensagens nesta conversa.
                </div>
              ) : (
                props.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-[24px] px-4 py-3 text-sm shadow-sm ${
                      message.direction === 'outbound'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : message.direction === 'system'
                          ? 'mx-auto bg-zinc-900 text-zinc-50'
                          : message.message_type === 'note'
                            ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-900'
                            : 'bg-white text-foreground'
                    }`}
                  >
                    {message.attachment_url ? (
                      <a
                        href={message.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium underline-offset-2 hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Abrir anexo
                      </a>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{message.body || '-'}</p>
                    <p className="mt-2 text-[11px] opacity-80">{formatDateTime(message.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border/70 bg-card/95 p-4">
            <InternalCrmMessageComposer
              value={props.messageBody}
              onValueChange={props.onMessageBodyChange}
              onSend={props.onSendMessage}
              disabled={props.isSending}
              placeholder="Responder conversa interna"
            />
          </div>
        </>
      ) : (
        <div className="flex h-full flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Selecione uma conversa para visualizar o histórico e enviar mensagens.
        </div>
      )}
    </div>
  );
}
