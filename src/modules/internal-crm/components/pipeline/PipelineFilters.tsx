import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InternalCrmStage } from '@/modules/internal-crm/types';

type PipelineFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  stageCode: string;
  onStageCodeChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  stages: InternalCrmStage[];
};

export function PipelineFilters(props: PipelineFiltersProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Buscar por deal ou empresa..."
          className="pl-9"
        />
      </div>

      <Select value={props.stageCode} onValueChange={props.onStageCodeChange}>
        <SelectTrigger>
          <SelectValue placeholder="Etapa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as etapas</SelectItem>
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
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="open">Abertos</SelectItem>
          <SelectItem value="won">Fechou</SelectItem>
          <SelectItem value="lost">Nao fechou</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
