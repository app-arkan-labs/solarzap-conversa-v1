import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmAiSettings, InternalCrmClientSummary } from '@/modules/internal-crm/types';

type InternalCrmAiJobsListProps = {
  pendingJobs: InternalCrmAiSettings['pending_jobs'];
  clients: InternalCrmClientSummary[];
  isPending: boolean;
  onEnqueue: (payload: {
    job_type: string;
    client_id: string | null;
    scheduled_at: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
};

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function InternalCrmAiJobsList(props: InternalCrmAiJobsListProps) {
  const [jobType, setJobType] = useState('follow_up');
  const [clientId, setClientId] = useState('none');
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 10 * 60 * 1000)));
  const [payloadText, setPayloadText] = useState('{\n  "source": "manual"\n}');
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const sortedJobs = useMemo(
    () => [...props.pendingJobs].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [props.pendingJobs],
  );

  async function handleEnqueue() {
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      setPayloadError('Data/hora de agendamento invalida.');
      return;
    }

    let parsedPayload: Record<string, unknown> = {};
    try {
      const maybePayload = payloadText.trim() ? JSON.parse(payloadText) : {};
      if (typeof maybePayload !== 'object' || maybePayload === null || Array.isArray(maybePayload)) {
        setPayloadError('Payload precisa ser um objeto JSON.');
        return;
      }
      parsedPayload = maybePayload;
      setPayloadError(null);
    } catch {
      setPayloadError('JSON invalido no payload do job.');
      return;
    }

    await props.onEnqueue({
      job_type: jobType,
      client_id: clientId === 'none' ? null : clientId,
      scheduled_at: scheduledDate.toISOString(),
      payload: parsedPayload,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de job</Label>
          <Select value={jobType} onValueChange={setJobType}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="qualification">Qualificacao</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="broadcast_assistant">Assistente de disparos</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Cliente (opcional)</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem cliente vinculado</SelectItem>
              {props.clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Agendar para</Label>
        <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Payload JSON</Label>
        <Textarea rows={4} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
        {payloadError ? <p className="text-xs text-rose-600">{payloadError}</p> : null}
      </div>

      <Button onClick={() => void handleEnqueue()} disabled={props.isPending}>
        {props.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Enfileirar job
      </Button>

      <div className="space-y-2 rounded-2xl border border-border/70 p-4">
        <p className="text-sm font-medium">Fila pendente</p>
        {sortedJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum job pendente no momento.</p>
        ) : (
          sortedJobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-border/70 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{job.job_type}</p>
                <TokenBadge token={job.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Agendado para {formatDateTime(job.scheduled_at)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
