import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InternalCrmMember, InternalCrmStage } from '@/modules/internal-crm/types';

const ALL_VALUE = 'all';

type PipelineFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  stageCode: string;
  onStageCodeChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  ownerUserId: string;
  onOwnerUserIdChange: (value: string) => void;
  sourceChannel: string;
  onSourceChannelChange: (value: string) => void;
  stages: InternalCrmStage[];
  members: InternalCrmMember[];
  sources: Array<{ value: string; label: string }>;
  actionsContent?: ReactNode;
};

export function PipelineFilters(props: PipelineFiltersProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_200px_220px_auto]">
      <div className="relative md:col-span-2 xl:col-span-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Buscar lead ou empresa..."
          className="pl-9"
        />
      </div>

      <Select value={props.stageCode} onValueChange={props.onStageCodeChange}>
        <SelectTrigger>
          <SelectValue placeholder="Etapa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas as etapas</SelectItem>
          {props.stages.map((stage) => (
            <SelectItem key={stage.stage_code} value={stage.stage_code}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={props.status} onValueChange={props.onStatusChange}>
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos os status</SelectItem>
          <SelectItem value="open">Abertos</SelectItem>
          <SelectItem value="won">Fechou Contrato</SelectItem>
          <SelectItem value="lost">Nao Fechou</SelectItem>
        </SelectContent>
      </Select>

      <Select value={props.sourceChannel} onValueChange={props.onSourceChannelChange}>
        <SelectTrigger>
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas as origens</SelectItem>
          {props.sources.map((source) => (
            <SelectItem key={source.value} value={source.value}>
              {source.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={props.ownerUserId} onValueChange={props.onOwnerUserIdChange}>
        <SelectTrigger>
          <SelectValue placeholder="Responsavel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos os responsáveis</SelectItem>
          {props.members.map((member) => (
            <SelectItem key={member.user_id} value={member.user_id}>
              {member.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {props.actionsContent ? (
        <div className="flex items-center justify-end">
          {props.actionsContent}
        </div>
      ) : null}
    </div>
  );
}
