import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { InternalCrmConversationSummary } from '@/modules/internal-crm/types';

type InternalCrmConversationActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: InternalCrmConversationSummary | null;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
};

export function InternalCrmConversationActionsSheet(props: InternalCrmConversationActionsSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ações da conversa</SheetTitle>
          <SheetDescription>
            Atualize status e organização da conversa de {props.conversation?.client_company_name || 'cliente selecionado'}.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid gap-2">
          <Button variant="outline" onClick={() => props.onUpdateStatus('open')}>
            Marcar como aberta
          </Button>
          <Button variant="outline" onClick={() => props.onUpdateStatus('resolved')}>
            Marcar como resolvida
          </Button>
          <Button variant="outline" onClick={() => props.onUpdateStatus('archived')}>
            Arquivar conversa
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
