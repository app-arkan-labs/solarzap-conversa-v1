import type { KeyboardEvent } from 'react';
import { CornerDownLeft, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type InternalCrmMessageComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export function InternalCrmMessageComposer(props: InternalCrmMessageComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    props.onSend();
  };

  return (
    <div className="rounded-[24px] border border-border/70 bg-background/90 p-3 shadow-sm">
      <div className="flex items-end gap-3">
        <Textarea
          rows={1}
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder || 'Digite a mensagem para o cliente interno'}
          className="min-h-[56px] resize-none border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0"
        />

        <Button
          size="icon"
          className="h-11 w-11 shrink-0 rounded-2xl"
          onClick={props.onSend}
          disabled={props.disabled || !props.value.trim()}
        >
          <SendHorizontal className="h-4 w-4" />
          <span className="sr-only">Enviar mensagem</span>
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <CornerDownLeft className="h-3.5 w-3.5" />
        Ctrl/Cmd + Enter para enviar
      </div>
    </div>
  );
}
