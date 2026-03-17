import { useMemo, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getMemberDisplayName } from '@/lib/memberDisplayName';
import type { MemberDto } from '@/lib/orgAdminClient';
import { cn } from '@/lib/utils';
import { getDistributionPercentages, normalizeAssigneeIds } from '@/lib/assigneeDistribution';

interface MultiAssigneeSelectorProps {
  members: MemberDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
  fallbackId?: string;
  fallbackLabel?: string;
  placeholder?: string;
  maxHeightClassName?: string;
}

export function MultiAssigneeSelector({
  members,
  selectedIds,
  onChange,
  isLoading = false,
  fallbackId,
  fallbackLabel = 'Usuário atual',
  placeholder = 'Selecione os responsáveis',
  maxHeightClassName = 'max-h-[50vh] sm:max-h-72',
}: MultiAssigneeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const normalizedSelected = useMemo(() => normalizeAssigneeIds(selectedIds), [selectedIds]);

  const options = useMemo(() => {
    if (members.length > 0) {
      return members.map((member) => ({
        id: member.user_id,
        label: getMemberDisplayName(member),
      }));
    }

    if (fallbackId) {
      return [{ id: fallbackId, label: fallbackLabel }];
    }

    return [];
  }, [fallbackId, fallbackLabel, members]);

  const percentages = useMemo(
    () => getDistributionPercentages(normalizedSelected.length),
    [normalizedSelected.length],
  );

  const summaryText = useMemo(() => {
    if (!normalizedSelected.length) return placeholder;

    const labels = normalizedSelected
      .map((id, index) => {
        const option = options.find((entry) => entry.id === id);
        const pct = percentages[index] ?? 0;
        return `${option?.label || id} (${(pct / 10).toFixed(1).replace(/\.0$/, '')}%)`;
      })
      .slice(0, 2);

    if (normalizedSelected.length > 2) {
      labels.push(`+${normalizedSelected.length - 2}`);
    }

    return labels.join(' • ');
  }, [normalizedSelected, options, percentages, placeholder]);

  const toggle = (id: string) => {
    const current = new Set(normalizedSelected);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    onChange(Array.from(current));
  };

  const selectAll = () => {
    onChange(options.map((option) => option.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between text-left font-normal"
            disabled={isLoading || options.length < 1}
          >
            <span className="truncate">{isLoading ? 'Carregando membros...' : summaryText}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,24rem)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Distribuir responsáveis</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}>
                Limpar
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAll}>
                Todos
              </Button>
            </div>
          </div>

          <ScrollArea className={cn('pr-2', maxHeightClassName)}>
            <div className="space-y-2">
              {options.map((option) => {
                const isChecked = normalizedSelected.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-sm hover:bg-muted/40"
                  >
                    <Checkbox checked={isChecked} onCheckedChange={() => toggle(option.id)} />
                    <span className="truncate">{option.label}</span>
                  </label>
                );
              })}

              {options.length < 1 && (
                <p className="py-4 text-center text-xs text-muted-foreground">Nenhum membro disponível.</p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <div className="flex flex-wrap gap-2">
        {normalizedSelected.map((id, index) => {
          const option = options.find((entry) => entry.id === id);
          const pct = percentages[index] ?? 0;
          return (
            <Badge key={id} variant="secondary" className="max-w-full">
              <Users className="mr-1 h-3.5 w-3.5" />
              <span className="truncate">{option?.label || id}</span>
              <span className="ml-1 text-[11px] text-muted-foreground">{(pct / 10).toFixed(1).replace(/\.0$/, '')}%</span>
            </Badge>
          );
        })}
        {normalizedSelected.length < 1 && (
          <Badge variant="outline">Nenhum responsável selecionado</Badge>
        )}
      </div>
    </div>
  );
}
