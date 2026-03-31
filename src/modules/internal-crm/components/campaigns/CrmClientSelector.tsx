import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useInternalCrmClients } from '@/modules/internal-crm/hooks/useInternalCrmApi';

type Props = {
  selected: string[];
  onSelectionChange: (clients: Array<{ id: string; name: string; phone: string }>) => void;
};

const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  qualificacao: 'Qualificação',
  reuniao_agendada: 'Reunião Agendada',
  proposta_enviada: 'Proposta Enviada',
  negociacao: 'Negociação',
  fechou: 'Fechou',
  nao_fechou: 'Não Fechou',
};

export function CrmClientSelector({ selected, onSelectionChange }: Props) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  const { data } = useInternalCrmClients({
    search: search.length >= 2 ? search : undefined,
    stage_code: stageFilter !== 'all' ? stageFilter : undefined,
  });

  const clients = data?.clients || [];

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleClient(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    let next: string[];
    if (selectedSet.has(clientId)) {
      next = selected.filter((id) => id !== clientId);
    } else {
      next = [...selected, clientId];
    }

    const result = next
      .map((id) => {
        const c = clients.find((cl) => cl.id === id);
        if (!c) return null;
        return {
          id: c.id,
          name: c.company_name || c.primary_contact_name || '',
          phone: c.primary_phone || '',
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; phone: string }>;

    onSelectionChange(result);
  }

  function toggleAll() {
    if (selectedSet.size === clients.length && clients.length > 0) {
      onSelectionChange([]);
    } else {
      onSelectionChange(
        clients
          .filter((c) => c.primary_phone)
          .map((c) => ({
            id: c.id,
            name: c.company_name || c.primary_contact_name || '',
            phone: c.primary_phone || '',
          })),
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as etapas</SelectItem>
            {Object.entries(STAGE_LABELS).map(([code, label]) => (
              <SelectItem key={code} value={code}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-2">
          <Checkbox
            checked={clients.length > 0 && selectedSet.size === clients.length}
            onCheckedChange={toggleAll}
          />
          Selecionar todos ({clients.length})
        </Label>
        {selectedSet.size > 0 && (
          <Badge variant="secondary" className="text-xs">
            {selectedSet.size} selecionado(s)
          </Badge>
        )}
      </div>

      <ScrollArea className="h-52 rounded border">
        <div className="divide-y">
          {clients.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado</p>
          ) : (
            clients.map((c) => {
              const isSelected = selectedSet.has(c.id);
              const hasPhone = Boolean(c.primary_phone);
              return (
                <label
                  key={c.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors',
                    isSelected && 'bg-primary/5',
                    !hasPhone && 'opacity-40 pointer-events-none',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleClient(c.id)}
                    disabled={!hasPhone}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.company_name || c.primary_contact_name || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground">{c.primary_phone || 'Sem telefone'}</p>
                  </div>
                  {c.current_stage_code && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {STAGE_LABELS[c.current_stage_code] || c.current_stage_code}
                    </Badge>
                  )}
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </label>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
