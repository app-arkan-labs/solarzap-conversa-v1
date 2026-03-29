import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AssignOwnerSelectProps = {
  ownerUserId: string;
  onOwnerUserIdChange: (value: string) => void;
};

export function AssignOwnerSelect(props: AssignOwnerSelectProps) {
  return (
    <div className="space-y-2">
      <Label>Responsavel (user_id)</Label>
      <Input
        value={props.ownerUserId}
        onChange={(event) => props.onOwnerUserIdChange(event.target.value)}
        placeholder="Opcional: informar user_id do responsável"
      />
    </div>
  );
}
