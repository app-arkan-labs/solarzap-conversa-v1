import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type DealCommentsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle: string;
  notes: string;
};

export function DealCommentsSheet(props: DealCommentsSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.dealTitle || 'Notas do deal'}</SheetTitle>
          <SheetDescription>
            Registro interno da negociação para preservar contexto de fechamento e follow-up.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
          {props.notes?.trim() || 'Sem notas registradas para este deal.'}
        </div>
      </SheetContent>
    </Sheet>
  );
}
