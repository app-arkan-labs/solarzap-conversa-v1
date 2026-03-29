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
};

export function InternalCrmChatArea(props: InternalCrmChatAreaProps) {
  return (
    <div className="flex min-h-[640px] flex-col rounded-2xl border border-border/70">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{props.conversation?.client_company_name || 'Selecione uma conversa'}</p>
            <p className="text-xs text-muted-foreground">{props.conversation?.primary_phone || '-'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.conversation ? <TokenBadge token={props.conversation.status} /> : null}
            {props.instance ? <TokenBadge token={props.instance.status} label={props.instance.display_name} /> : null}
          </div>
        </div>
      </div>

      {props.conversation ? (
        <>
          <ScrollArea className="h-[430px] flex-1 p-4">
            <div className="space-y-3">
              {props.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda nao há mensagens nesta conversa.</p>
              ) : (
                props.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      message.direction === 'outbound'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : message.message_type === 'note'
                          ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-900'
                          : 'bg-muted text-foreground'
                    }`}
                  >
                    <p>{message.body || '-'}</p>
                    <p className="mt-2 text-[11px] opacity-80">{formatDateTime(message.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border/70 p-4">
            <InternalCrmMessageComposer
              value={props.messageBody}
              onValueChange={props.onMessageBodyChange}
              onSend={props.onSendMessage}
              disabled={props.isSending}
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
