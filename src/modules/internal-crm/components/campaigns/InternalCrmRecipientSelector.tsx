import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type InternalCrmRecipientSelectorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function InternalCrmRecipientSelector(props: InternalCrmRecipientSelectorProps) {
  const lines = props.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const validCount = lines.filter((line) => {
    const parts = line.split(';').map((item) => item.trim());
    return parts.length >= 2 && parts[1].length > 0;
  }).length;

  const invalidCount = Math.max(0, lines.length - validCount);

  return (
    <div className="space-y-2">
      <Label>Destinatarios (nome;telefone;client_id opcional)</Label>
      <Textarea
        rows={6}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={['Maria Silva;11999990000', 'Joao Souza;21988887777;uuid-client-opcional'].join('\n')}
      />
      <p className="text-xs text-muted-foreground">
        {validCount} linha(s) valida(s)
        {invalidCount > 0 ? `, ${invalidCount} com formato incompleto` : ''}.
      </p>
    </div>
  );
}
