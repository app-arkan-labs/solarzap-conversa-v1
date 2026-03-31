import { useState } from 'react';
import { Loader2, SendHorizontal, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { InternalCrmMessage } from '@/modules/internal-crm/types';

type ClientNotesSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: InternalCrmMessage[];
  onSendNote: (body: string) => Promise<void>;
  isSending: boolean;
};

function formatNoteTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ClientNotesSheet(props: ClientNotesSheetProps) {
  const [body, setBody] = useState('');

  const notes = props.messages.filter((m) => m.message_type === 'note' || m.direction === 'system');

  const handleSend = async () => {
    if (!body.trim()) return;
    await props.onSendNote(body.trim());
    setBody('');
  };

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Comentários / Notas
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
          {/* Notes list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma nota registrada.</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-dashed border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs">
                  <p className="whitespace-pre-wrap break-words text-amber-900 dark:text-amber-200">{note.body || '-'}</p>
                  <p className="mt-1.5 text-[10px] text-amber-700/60 dark:text-amber-400/60">{formatNoteTime(note.created_at)}</p>
                </div>
              ))
            )}
          </div>

          {/* New note input */}
          <div className="flex gap-2 items-end border-t border-border/40 pt-3">
            <Textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Adicionar nota..."
              className="min-h-[60px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => void handleSend()}
              disabled={props.isSending || !body.trim()}
            >
              {props.isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
