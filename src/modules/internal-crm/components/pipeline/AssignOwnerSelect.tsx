import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InternalCrmMember } from '@/modules/internal-crm/types';

const NO_OWNER_VALUE = '__no_owner__';

type AssignOwnerSelectProps = {
  ownerUserId: string;
  onOwnerUserIdChange: (value: string) => void;
  members?: InternalCrmMember[];
  label?: string;
  placeholder?: string;
};

export function AssignOwnerSelect(props: AssignOwnerSelectProps) {
  const members = props.members || [];
  const hasStructuredMembers = members.length > 0;
  const selectedValue = props.ownerUserId || NO_OWNER_VALUE;

  return (
    <div className="space-y-2">
      <Label>{props.label || 'Responsavel'}</Label>
      {hasStructuredMembers ? (
        <Select
          value={selectedValue}
          onValueChange={(value) => props.onOwnerUserIdChange(value === NO_OWNER_VALUE ? '' : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder={props.placeholder || 'Selecione o responsável'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OWNER_VALUE}>Sem responsavel</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.user_id} value={member.user_id}>
                {member.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={props.ownerUserId}
          onChange={(event) => props.onOwnerUserIdChange(event.target.value)}
          placeholder={props.placeholder || 'Opcional: informar user_id do responsável'}
        />
      )}
    </div>
  );
}
