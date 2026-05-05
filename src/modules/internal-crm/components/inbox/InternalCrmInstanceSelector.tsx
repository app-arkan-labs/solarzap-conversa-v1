import { Check, ChevronDown, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { InternalCrmWhatsappInstance } from '@/modules/internal-crm/types';

type InternalCrmInstanceSelectorProps = {
  instances: InternalCrmWhatsappInstance[];
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string) => void;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getInstanceColor(instance: InternalCrmWhatsappInstance): string {
  const metadata = asRecord(instance.metadata);
  const metadataColor = typeof metadata.color === 'string' ? metadata.color.trim() : '';
  const explicitColor = typeof instance.color === 'string' ? instance.color.trim() : '';
  return explicitColor || metadataColor || '#25D366';
}

export function InternalCrmInstanceSelector(props: InternalCrmInstanceSelectorProps) {
  const orderedInstances = [...props.instances].sort((left, right) => {
    if (left.status === right.status) {
      return String(left.display_name || left.instance_name).localeCompare(
        String(right.display_name || right.instance_name),
        'pt-BR',
      );
    }
    if (left.status === 'connected') return -1;
    if (right.status === 'connected') return 1;
    return 0;
  });

  const selected =
    orderedInstances.find((instance) => instance.id === props.selectedInstanceId) ||
    orderedInstances.find((instance) => instance.status === 'connected') ||
    orderedInstances[0] ||
    null;

  if (!selected) {
    return (
      <Button variant="outline" size="sm" disabled className={cn('h-8 text-xs', props.className)}>
        <Smartphone className="mr-1.5 h-3.5 w-3.5" />
        Sem conexao
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1.5 border-dashed px-2 text-xs font-normal', props.className)}
          data-testid="internal-crm-instance-selector-trigger"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: getInstanceColor(selected) }}
            aria-hidden
          />
          <span className="max-w-[150px] truncate">
            {selected.display_name || selected.instance_name}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {orderedInstances.map((instance) => {
          const isSelected = selected.id === instance.id;
          const statusLabel =
            instance.status === 'connected'
              ? 'Conectada'
              : instance.status === 'connecting'
                ? 'Conectando'
                : instance.status === 'error'
                  ? 'Erro'
                  : 'Pausada';

          return (
            <DropdownMenuItem
              key={instance.id}
              className="flex cursor-pointer items-center justify-between gap-2 text-xs"
              onClick={() => props.onSelectInstance(instance.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: getInstanceColor(instance) }}
                  aria-hidden
                />
                <span className="truncate">{instance.display_name || instance.instance_name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{statusLabel}</span>
              </span>
              {isSelected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
