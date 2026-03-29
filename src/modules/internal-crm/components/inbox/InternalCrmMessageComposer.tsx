import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type InternalCrmMessageComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

export function InternalCrmMessageComposer(props: InternalCrmMessageComposerProps) {
  return (
    <div className="rounded-2xl border border-border/70 p-4">
      <Label>Nova mensagem</Label>
      <Textarea
        rows={4}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        placeholder="Digite a mensagem para envio no canal interno"
        className="mt-2"
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={props.onSend} disabled={props.disabled || !props.value.trim()}>
          <SendHorizontal className="mr-1.5 h-4 w-4" />
          Enviar
        </Button>
      </div>
    </div>
  );
}
