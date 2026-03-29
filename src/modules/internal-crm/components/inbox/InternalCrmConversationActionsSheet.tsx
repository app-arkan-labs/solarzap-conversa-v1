import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TokenBadge } from '@/modules/internal-crm/components/InternalCrmUi';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
  InternalCrmWhatsappInstance,
} from '@/modules/internal-crm/types';

type InternalCrmConversationActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: InternalCrmConversationSummary | null;
  detail: InternalCrmClientDetail | null;
  instance: InternalCrmWhatsappInstance | null;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
  onProvision: (dealId?: string) => void;
  onConnectInstance: () => void;
  onOpenInstanceDialog: () => void;
  isProvisioning?: boolean;
  isUpdatingStatus?: boolean;
  isConnectingInstance?: boolean;
};

export function InternalCrmConversationActionsSheet(props: InternalCrmConversationActionsSheetProps) {
  const openDealId = props.detail?.deals.find((deal) => deal.status === 'open')?.id;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ações da conversa</SheetTitle>
          <SheetDescription>
            Atualize status e organização da conversa de {props.conversation?.client_company_name || 'cliente selecionado'}.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-3 rounded-3xl border border-border/70 bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">Resumo rápido</p>
            <div className="flex flex-wrap gap-2">
              {props.conversation ? <TokenBadge token={props.conversation.status} label={props.conversation.status} /> : null}
              {props.conversation ? (
                <TokenBadge
                  token={props.conversation.channel}
                  label={props.conversation.channel === 'manual_note' ? 'Nota interna' : 'WhatsApp'}
                />
              ) : null}
              {props.instance ? <TokenBadge token={props.instance.status} label={props.instance.display_name} /> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {props.detail?.client.next_action || props.conversation?.next_action || 'Nenhuma próxima ação registrada.'}
            </p>
          </div>

          <div className="grid gap-2">
            <Button variant="outline" onClick={() => props.onUpdateStatus('open')} disabled={props.isUpdatingStatus}>
              Marcar como aberta
            </Button>
            <Button variant="outline" onClick={() => props.onUpdateStatus('resolved')} disabled={props.isUpdatingStatus}>
              Marcar como resolvida
            </Button>
            <Button variant="outline" onClick={() => props.onUpdateStatus('archived')} disabled={props.isUpdatingStatus}>
              Arquivar conversa
            </Button>
          </div>

          <div className="grid gap-2">
            <Button variant="outline" onClick={props.onConnectInstance} disabled={!props.instance?.id || props.isConnectingInstance}>
              Conectar / atualizar QR
            </Button>
            <Button variant="outline" onClick={props.onOpenInstanceDialog}>
              Nova instância interna
            </Button>
            <Button onClick={() => props.onProvision(openDealId)} disabled={!props.detail?.client.id || props.isProvisioning}>
              Provisionar conta SolarZap
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
