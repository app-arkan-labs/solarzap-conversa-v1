import { Building2, Factory, Home, Sun, Tractor } from 'lucide-react';
import { CLIENT_TYPES, type UseProposalFormReturn } from '@/hooks/useProposalForm';
import { cn } from '@/lib/utils';

const ICON_BY_TYPE = {
  residencial: Home,
  comercial: Building2,
  industrial: Factory,
  rural: Tractor,
  usina: Sun,
} as const;

interface StepClientTypeProps {
  form: UseProposalFormReturn;
  onNext: () => void;
}

export function StepClientType({ form, onNext }: StepClientTypeProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Qual o tipo de projeto?</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {CLIENT_TYPES.map((item) => {
          const Icon = ICON_BY_TYPE[item.value];
          const selected = form.formData.tipo_cliente === item.value;

          return (
            <button
              type="button"
              key={item.value}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
                selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
              onClick={() => {
                form.handleChange('tipo_cliente', item.value);
                onNext();
              }}
            >
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground">Clique para selecionar e continuar.</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
