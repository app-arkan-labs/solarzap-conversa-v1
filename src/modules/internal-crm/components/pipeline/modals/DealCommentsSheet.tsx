import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type DealCommentsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealTitle: string;
  notes: string;
  onSaveNotes: (dealId: string, notes: string) => Promise<void>;
  isSaving: boolean;
};

export function DealCommentsSheet(props: DealCommentsSheetProps) {
  const [localNotes, setLocalNotes] = useState(props.notes || '');

  useEffect(() => {
    setLocalNotes(props.notes || '');
  }, [props.notes, props.dealId]);

  const hasChanges = localNotes !== (props.notes || '');

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.dealTitle || 'Notas'}</SheetTitle>
          <SheetDescription>
            Notas e observações sobre a negociação.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <Textarea
            rows={8}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Adicione notas sobre a negociação..."
          />
          <Button
            onClick={() => props.onSaveNotes(props.dealId, localNotes)}
            disabled={props.isSaving || !hasChanges}
          >
            Salvar Nota
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
