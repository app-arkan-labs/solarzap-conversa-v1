import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Send, Loader2, Trash2, Calendar, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { InternalCrmClientNote } from '@/modules/internal-crm/types';

type CrmClientCommentsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  notes: InternalCrmClientNote[];
  isLoading: boolean;
  onAdd: (body: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  isAdding: boolean;
};

export function CrmClientCommentsModal({
  isOpen,
  onClose,
  clientName,
  notes,
  isLoading,
  onAdd,
  onDelete,
  isAdding,
}: CrmClientCommentsModalProps) {
  const [newComment, setNewComment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { toast } = useToast();

  const filteredNotes = useMemo(() => {
    if (!startDate && !endDate) return notes;
    return notes.filter((note) => {
      const noteDate = parseISO(note.created_at);
      if (startDate && endDate) {
        return isWithinInterval(noteDate, {
          start: startOfDay(parseISO(startDate)),
          end: endOfDay(parseISO(endDate)),
        });
      }
      if (startDate) return noteDate >= startOfDay(parseISO(startDate));
      if (endDate) return noteDate <= endOfDay(parseISO(endDate));
      return true;
    });
  }, [notes, startDate, endDate]);

  const clearDateFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    try {
      await onAdd(newComment.trim());
      setNewComment('');
      toast({ title: 'Comentário adicionado!' });
    } catch {
      toast({ title: 'Erro ao adicionar comentário', variant: 'destructive' });
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await onDelete(noteId);
      toast({ title: 'Comentário excluído.' });
    } catch {
      toast({ title: 'Erro ao excluir comentário', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Comentários - {clientName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Textarea
            placeholder="Adicionar comentário..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            className="flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <Button
            size="icon"
            onClick={() => void handleAdd()}
            disabled={isAdding || !newComment.trim()}
            className="shrink-0 self-end"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1">
            <Label className="text-xs">De:</Label>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Até:</Label>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {(startDate || endDate) && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={clearDateFilters}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {(startDate || endDate) && (
          <p className="text-xs text-muted-foreground">
            {filteredNotes.length} de {notes.length} comentários
          </p>
        )}

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Carregando...
            </div>
          ) : filteredNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum comentário encontrado.
            </p>
          ) : (
            <div className="space-y-3 pr-2">
              {filteredNotes.map((note) => (
                <div key={note.id} className="group rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{note.author_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {format(parseISO(note.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10"
                        onClick={() => void handleDelete(note.id)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap">{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
