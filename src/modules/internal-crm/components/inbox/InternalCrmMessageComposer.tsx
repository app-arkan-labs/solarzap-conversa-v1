import type { KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
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

    // Enter sem shift envia a mensagem (como WhatsApp)
    if (!event.shiftKey) {
      event.preventDefault();
      props.onSend();
      return;
    }

    // Shift+Enter adiciona nova linha (comportamento padrão do textarea)
  };

  return (
    <div className="flex items-end gap-2">
      <Textarea
        rows={1}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder || 'Digite uma mensagem...'}
        className="min-h-[40px] max-h-[120px] resize-none rounded-lg border-border/50 bg-muted/30 px-3 py-2.5 text-sm shadow-none focus-visible:ring-1"
      />

      <Button
        size="icon"
        className="h-10 w-10 shrink-0 rounded-lg"
        onClick={props.onSend}
        disabled={props.disabled || !props.value.trim()}
      >
        <SendHorizontal className="h-4 w-4" />
        <span className="sr-only">Enviar</span>
      </Button>
    </div>
  );
}
