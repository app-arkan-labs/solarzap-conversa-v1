import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TokenBadge, formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmClientSummary, InternalCrmStage } from '@/modules/internal-crm/types';

type InternalCrmClientsViewProps = {
  clients: InternalCrmClientSummary[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  stageCode: string;
  onStageCodeChange: (value: string) => void;
  lifecycle: string;
  onLifecycleChange: (value: string) => void;
  stages: InternalCrmStage[];
};

function computeHealthScore(client: InternalCrmClientSummary): { score: number; status: 'healthy' | 'attention' | 'risk' } {
  const now = Date.now();
  let score = 70;

  if (client.lifecycle_status === 'active_customer') score += 15;
  if (client.lifecycle_status === 'customer_onboarding') score += 5;
  if (client.lifecycle_status === 'churn_risk') score -= 25;
  if (client.lifecycle_status === 'churned') score -= 40;

  if ((client.open_deal_count || 0) > 0) score += 5;

  if (client.next_action_at) {
    const nextActionAt = new Date(client.next_action_at).getTime();
    if (!Number.isNaN(nextActionAt) && nextActionAt < now) score -= 12;
  }

  if (client.last_contact_at) {
    const lastContactAt = new Date(client.last_contact_at).getTime();
    if (!Number.isNaN(lastContactAt)) {
      const daysWithoutContact = Math.floor((now - lastContactAt) / (24 * 60 * 60 * 1000));
      if (daysWithoutContact > 30) score -= 12;
      if (daysWithoutContact > 60) score -= 12;
    }
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  if (normalizedScore >= 75) return { score: normalizedScore, status: 'healthy' };
  if (normalizedScore >= 45) return { score: normalizedScore, status: 'attention' };
  return { score: normalizedScore, status: 'risk' };
}

export function InternalCrmClientsView(props: InternalCrmClientsViewProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Buscar por empresa, contato ou e-mail"
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

        <Select value={props.lifecycle} onValueChange={props.onLifecycleChange}>
          <SelectTrigger>
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="customer_onboarding">Onboarding</SelectItem>
            <SelectItem value="active_customer">Ativo</SelectItem>
            <SelectItem value="churn_risk">Risco de churn</SelectItem>
            <SelectItem value="churned">Churnado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Saude</TableHead>
              <TableHead>MRR</TableHead>
              <TableHead>Próxima ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhum cliente encontrado para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              props.clients.map((client) => {
                const health = computeHealthScore(client);

                return (
                  <TableRow
                    key={client.id}
                    className={`cursor-pointer ${client.id === props.selectedClientId ? 'bg-muted/35' : ''}`}
                    onClick={() => props.onSelectClient(client.id)}
                  >
                    <TableCell className="font-medium">{client.company_name}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{client.primary_contact_name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{client.primary_phone || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TokenBadge token={client.current_stage_code} label={client.current_stage_code} />
                    </TableCell>
                    <TableCell>
                      <TokenBadge token={client.lifecycle_status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TokenBadge token={health.status} />
                        <span className="text-xs text-muted-foreground">{health.score}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrencyBr(client.total_mrr_cents)}</TableCell>
                    <TableCell>{client.next_action || '-'}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
